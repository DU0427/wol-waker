// 把黑底前景图标抠成透明，并（若存在安卓工程）写入各密度 mipmap
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { decode, encode } = require('./png.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'design', 'out');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// 图标主色 #3ddc84
const R = 0x3d, G = 0xdc, B = 0x84;

const DENSITY = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];

// 黑底 → 透明：像素 = 主色 × alpha，故 alpha = max(r/R, g/G, b/B)
function keyOutBlack(srcPath) {
  const { width, height, data } = decode(fs.readFileSync(srcPath));
  const out = Buffer.alloc(width * height * 4);
  let minA = 255, maxA = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    let a = Math.max(r / R, g / G, b / B);
    if (a > 1) a = 1;
    const ai = Math.round(a * 255);
    if (ai < minA) minA = ai;
    if (ai > maxA) maxA = ai;
    out[i * 4] = R; out[i * 4 + 1] = G; out[i * 4 + 2] = B; out[i * 4 + 3] = ai;
  }
  return { width, height, data: out, minA, maxA };
}

function write(file, w, h, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encode(w, h, data));
}

let wrote = 0;
for (const [dens, launch, fg] of DENSITY) {
  // 1) 透明前景
  const keyed = keyOutBlack(path.join(OUT, `fg-black-${fg}.png`));
  if (keyed.minA !== 0 || keyed.maxA !== 255) {
    throw new Error(`抠色异常 fg-black-${fg}.png minA=${keyed.minA} maxA=${keyed.maxA}`);
  }
  write(path.join(OUT, `ic_launcher_foreground-${fg}.png`), keyed.width, keyed.height, keyed.data);

  // 2) 落地到安卓工程（若已生成）
  if (fs.existsSync(RES)) {
    const dir = path.join(RES, `mipmap-${dens}`);
    write(path.join(dir, 'ic_launcher_foreground.png'), keyed.width, keyed.height, keyed.data);
    fs.copyFileSync(path.join(OUT, `ic_launcher-${launch}.png`), path.join(dir, 'ic_launcher.png'));
    fs.copyFileSync(path.join(OUT, `ic_launcher-${launch}.png`), path.join(dir, 'ic_launcher_round.png'));
    wrote++;
  }
  console.log(`${dens}: launcher=${launch} fg=${fg} minA=${keyed.minA} maxA=${keyed.maxA}`);
}
console.log(`ICON_KEY_OK android_res_written=${wrote}`);
