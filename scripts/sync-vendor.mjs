// 把 Ionic / IonIcons 从 node_modules 复制到 src/ui/vendor
// （Electron 与 Capacitor 的 webDir(src/ui) 都需要自包含）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function cpDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) cpDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Ionic 核心（组件 + CSS）
const IONIC = path.join(ROOT, 'node_modules', '@ionic', 'core');
const vIonic = path.join(ROOT, 'src', 'ui', 'vendor', 'ionic');
fs.mkdirSync(vIonic, { recursive: true });
fs.copyFileSync(path.join(IONIC, 'css', 'ionic.bundle.css'), path.join(vIonic, 'ionic.bundle.css'));
fs.copyFileSync(path.join(IONIC, 'dist', 'ionic', 'ionic.esm.js'), path.join(vIonic, 'ionic.esm.js'));
const loader = path.join(IONIC, 'dist', 'ionic', 'ionic.js');
if (fs.existsSync(loader)) fs.copyFileSync(loader, path.join(vIonic, 'ionic.js'));
cpDir(path.join(IONIC, 'dist', 'ionic', 'svg'), path.join(vIonic, 'svg'));
// 依赖 chunk（p-*.entry.js 等）
for (const e of fs.readdirSync(path.join(IONIC, 'dist', 'ionic'), { withFileTypes: true })) {
  if (e.isFile() && /\.(entry\.js|js)$/.test(e.name)) {
    fs.copyFileSync(path.join(IONIC, 'dist', 'ionic', e.name), path.join(vIonic, e.name));
  }
}

// IonIcons（图标集）
const ICONS = path.join(ROOT, 'node_modules', 'ionicons', 'dist', 'ionicons');
const vIcons = path.join(ROOT, 'src', 'ui', 'vendor', 'ionicons');
fs.mkdirSync(vIcons, { recursive: true });
fs.copyFileSync(path.join(ICONS, 'ionicons.esm.js'), path.join(vIcons, 'ionicons.esm.js'));
const iconsLoader = path.join(ICONS, 'ionicons.js');
if (fs.existsSync(iconsLoader)) fs.copyFileSync(iconsLoader, path.join(vIcons, 'ionicons.js'));
cpDir(path.join(ICONS, 'svg'), path.join(vIcons, 'svg'));
for (const e of fs.readdirSync(ICONS, { withFileTypes: true })) {
  if (e.isFile() && /\.js$/.test(e.name) && e.name !== 'ionicons.esm.js' && e.name !== 'index.esm.js') {
    fs.copyFileSync(path.join(ICONS, e.name), path.join(vIcons, e.name));
  }
}

console.log('vendor synced: ionic + ionicons');