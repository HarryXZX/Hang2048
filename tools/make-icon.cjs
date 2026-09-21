'use strict';

/**
 * 把 icon.png（512×512）转成 build/icon.ico（多尺寸，PNG 载荷）。
 *
 * 用 Electron 自带 nativeImage 做缩放（Skia，质量好），
 * 不依赖任何第三方图像库。
 *
 *   npm run icon      （等价于 electron tools/make-icon.cjs）
 */

const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [256, 128, 64, 48, 32, 24, 16];

const root = path.join(__dirname, '..');
const srcPng = path.join(root, 'icon.png');
const outDir = path.join(root, 'build');

/** 用 PNG 载荷组装 ICO（Vista 之后支持） */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: icon
  header.writeUInt16LE(entries.length, 4); // image count

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;

  entries.forEach((entry, i) => {
    const o = i * 16;
    dir[o] = entry.size >= 256 ? 0 : entry.size;      // width（256 记作 0）
    dir[o + 1] = entry.size >= 256 ? 0 : entry.size;  // height
    dir[o + 2] = 0;                                   // palette
    dir[o + 3] = 0;                                   // reserved
    dir.writeUInt16LE(1, o + 4);                      // color planes
    dir.writeUInt16LE(32, o + 6);                     // bits per pixel
    dir.writeUInt32LE(entry.data.length, o + 8);      // bytes in resource
    dir.writeUInt32LE(offset, o + 12);                // image offset
    offset += entry.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  if (!fs.existsSync(srcPng)) {
    console.error('找不到源图标: ' + srcPng);
    app.exit(1);
    return;
  }

  const src = nativeImage.createFromPath(srcPng);
  if (src.isEmpty()) {
    console.error('源图标无法解析: ' + srcPng);
    app.exit(1);
    return;
  }

  const { width, height } = src.getSize();
  console.log('源图标 ' + width + 'x' + height + '  ' +
    (fs.statSync(srcPng).size / 1024).toFixed(1) + ' KB');

  const entries = [];
  for (const size of SIZES) {
    const resized = size === width && size === height
      ? src
      : src.resize({ width: size, height: size, quality: 'best' });
    entries.push({ size, data: resized.toPNG() });
  }

  fs.mkdirSync(outDir, { recursive: true });
  const ico = buildIco(entries);
  const icoPath = path.join(outDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);

  // 顺带把 256 尺寸存一份 PNG，方便预览
  const previewPath = path.join(outDir, 'icon-256.png');
  fs.writeFileSync(previewPath, entries[0].data);

  console.log('已生成 ' + icoPath + '  ' + (ico.length / 1024).toFixed(1) + ' KB');
  console.log('  尺寸: ' + SIZES.join(' / '));
  console.log('已生成 ' + previewPath);
  app.exit(0);
});
