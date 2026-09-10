// 用已安装的 Electron(Chromium) 把 SVG 渲染成各尺寸 PNG，无需额外依赖
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'design', 'out');
fs.mkdirSync(OUT, { recursive: true });

const LAUNCHER = [48, 72, 96, 144, 192];
const FOREGROUND = [108, 162, 216, 324, 432];
const ICO = [16, 24, 32, 48, 64, 128, 256];

function wrap(svg, size, transparent) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:${transparent ? 'transparent' : '#000'}}
svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${svg}</body></html>`;
}

let win = null;
function getWin() {
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: 1024, height: 1024, useContentSize: true, show: false, frame: false,
      transparent: true, backgroundColor: '#00000000',
      webPreferences: { zoomFactor: 1, backgroundThrottling: false },
    });
  }
  return win;
}

// 复用同一个窗口 + 失败重试：频繁创建/销毁窗口会触发 ERR_FAILED 竞态
async function render(svg, size, transparent, outName) {
  const w = getWin();
  w.setContentSize(size, size);
  const url = 'data:text/html;base64,' + Buffer.from(wrap(svg, size, transparent), 'utf8').toString('base64');
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await w.loadURL(url);
      w.webContents.setZoomFactor(1);
      await new Promise((r) => setTimeout(r, 300));
      const img = await w.webContents.capturePage();
      if (img.getSize().width !== size) throw new Error(`尺寸不符 ${img.getSize().width} != ${size}`);
      fs.writeFileSync(path.join(OUT, outName), img.toPNG());
      return;
    } catch (e) {
      if (attempt === 4) throw new Error(`${outName} 渲染失败: ${e.message}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

app.whenReady().then(async () => {
  const full = fs.readFileSync(path.join(ROOT, 'design', 'icon.svg'), 'utf8');
  const fg = fs.readFileSync(path.join(ROOT, 'design', 'icon-fg.svg'), 'utf8');
  await render(full, 1024, true, 'icon-1024.png');
  await render(full, 256, true, 'preview-256.png');
  for (const s of LAUNCHER) await render(full, s, true, `ic_launcher-${s}.png`);
  for (const s of ICO) await render(full, s, true, `ico-${s}.png`);
  // 前景图标统一渲染到纯黑底，后续用抠色算法转成透明（透明窗口大尺寸不可靠）
  await render(fg, 1024, false, 'fg-black-1024.png');
  for (const s of FOREGROUND) await render(fg, s, false, `fg-black-${s}.png`);
  console.log('ICON_RENDER_OK');
  app.quit();
}).catch((e) => { console.error('RENDER_FAIL', e.message); app.exit(1); });
