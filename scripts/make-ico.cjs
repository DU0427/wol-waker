// 把 design/out/ico-*.png 打包成 Windows 用的多尺寸 build/icon.ico（PNG 压缩帧）
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'design', 'out');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const frames = SIZES.map((size) => ({ size, data: fs.readFileSync(path.join(OUT, `ico-${size}.png`)) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);           // type: icon
header.writeUInt16LE(frames.length, 4);

let offset = 6 + 16 * frames.length;
const entries = [];
for (const f of frames) {
  const e = Buffer.alloc(16);
  e[0] = f.size >= 256 ? 0 : f.size;
  e[1] = f.size >= 256 ? 0 : f.size;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);              // color planes
  e.writeUInt16LE(32, 6);             // bits per pixel
  e.writeUInt32LE(f.data.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += f.data.length;
}

const out = Buffer.concat([header, ...entries, ...frames.map((f) => f.data)]);
const dest = path.join(ROOT, 'build', 'icon.ico');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`ICO_OK ${dest} frames=${frames.length} bytes=${out.length}`);
