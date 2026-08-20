// 本地优先 + GitHub 回退的二进制下载代理
// 本地提供修改过的 winCodeSign（无 darwin 符号链接），其余工具自动回退到 GitHub 官方下载
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const dir = process.argv[2];
const port = parseInt(process.argv[3], 10);
const GH_BASE = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/';

function pipeHttps(url, res) {
  https.get(url, { rejectUnauthorized: false }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      pipeHttps(r.headers.location, res);
      r.resume();
      return;
    }
    if (r.statusCode !== 200) {
      res.writeHead(r.statusCode || 502, { 'Content-Type': 'text/plain' });
      res.end('upstream status ' + r.statusCode);
      r.resume();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    r.pipe(res);
  }).on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('upstream error: ' + e.message);
  });
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(dir, urlPath);
  fs.readFile(file, (err, data) => {
    if (err) {
      // 本地没有 -> 回退 GitHub 官方 release
      const ghUrl = GH_BASE + urlPath;
      console.log('FALLBACK ' + urlPath + ' -> ' + ghUrl);
      pipeHttps(ghUrl, res);
      return;
    }
    console.log('LOCAL ' + urlPath + ' (' + data.length + ' bytes)');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('BIN_PROXY listening on http://127.0.0.1:' + port + ' serving ' + dir);
});
