'use strict';

/**
 * 下载 Electron 预编译包到 .cache/electron/。
 *
 * 用 Node 自带的 TLS 栈（系统 schannel 在受限环境下不可用），
 * 并采用多连接分块下载 —— 单个连接通常被限速，并发能快好几倍。
 *
 *   node tools/fetch-electron.cjs
 */

const fs = require('fs');
const path = require('path');

const MIRRORS = [
  'https://cdn.npmmirror.com/binaries/electron',
  'https://registry.npmmirror.com/-/binary/electron',
  'https://github.com/electron/electron/releases/download'
];
const CONNECTIONS = 8;
const CHUNK = 4 * 1024 * 1024;

const version = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'electron', 'package.json'), 'utf8')
).version;

const file = 'electron-v' + version + '-win32-x64.zip';
const outDir = path.join(__dirname, '..', '.cache', 'electron');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, file);

function urlFor(mirror, ver, name) {
  return mirror.indexOf('releases/download') >= 0
    ? mirror + '/v' + ver + '/' + name
    : mirror + '/' + ver + '/' + name;
}

const mb = (n) => (n / 1048576).toFixed(1);

async function head(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return Number(res.headers.get('content-length') || 0);
}

async function fetchRange(url, start, end, dest) {
  const res = await fetch(url, { headers: { Range: 'bytes=' + start + '-' + end } });
  if (res.status !== 206 && res.status !== 200) throw new Error('HTTP ' + res.status);
  const fd = fs.openSync(dest, 'w');
  try {
    let got = 0;
    for await (const chunk of res.body) {
      fs.writeSync(fd, chunk);
      got += chunk.length;
      onProgress(chunk.length);
    }
    if (got !== end - start + 1) throw new Error('分块长度不符 ' + got);
  } finally {
    fs.closeSync(fd);
  }
}

let done = 0;
let total = 0;
let lastTick = 0;
let startTime = 0;

function onProgress(n) {
  done += n;
  const now = Date.now();
  if (now - lastTick > 2000) {
    lastTick = now;
    console.log('  ' + mb(done) + ' / ' + mb(total) + ' MB  ' +
      ((done / total) * 100).toFixed(1) + '%  ' +
      mb(done / ((now - startTime) / 1000)) + ' MB/s');
  }
}

(async () => {
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50 * 1024 * 1024) {
    console.log('已存在，跳过下载: ' + outFile);
    return;
  }

  let mirror = null;
  for (const m of MIRRORS) {
    const url = urlFor(m, version, file);
    try {
      const len = await head(url);
      if (len > 50 * 1024 * 1024) {
        mirror = url;
        total = len;
        console.log('镜像: ' + url + '  (' + mb(len) + ' MB)');
        break;
      }
    } catch (err) {
      console.log('跳过 ' + url + ' -> ' + err.message);
    }
  }
  if (!mirror) {
    console.error('所有镜像都不可用');
    process.exit(1);
  }

  startTime = Date.now();
  const parts = [];
  for (let s = 0; s < total; s += CHUNK) {
    parts.push([s, Math.min(s + CHUNK - 1, total - 1)]);
  }
  console.log('分成 ' + parts.length + ' 块，' + CONNECTIONS + ' 个并发连接');

  const tmp = parts.map((_, i) => outFile + '.part' + i);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= parts.length) return;
      let lastErr = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const before = fs.existsSync(tmp[i]) ? fs.statSync(tmp[i]).size : 0;
        try {
          await fetchRange(mirror, parts[i][0] + before, parts[i][1], tmp[i]);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const nowSize = fs.existsSync(tmp[i]) ? fs.statSync(tmp[i]).size : 0;
          done -= nowSize;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (lastErr) throw new Error('分块 ' + i + ' 失败: ' + lastErr.message);
    }
  }

  await Promise.all(Array.from({ length: CONNECTIONS }, worker));

  const fd = fs.openSync(outFile, 'w');
  for (const t of tmp) {
    fs.writeSync(fd, fs.readFileSync(t));
    fs.unlinkSync(t);
  }
  fs.closeSync(fd);

  const size = fs.statSync(outFile).size;
  console.log('完成: ' + outFile + '  (' + mb(size) + ' MB, ' +
    ((Date.now() - startTime) / 1000).toFixed(0) + 's)');
  if (size !== total) {
    console.error('大小不符');
    process.exit(1);
  }
})().catch((err) => {
  console.error('下载失败: ' + err.message);
  process.exit(1);
});
