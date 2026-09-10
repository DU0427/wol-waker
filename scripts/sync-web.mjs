// 把 src/core/wol.js 复制到 src/ui/wol.js
// 目的：Capacitor 的 webDir(src/ui) 必须是自包含的，而 Electron 能直接读 ../core
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'src', 'core', 'wol.js');
const dst = path.join(ROOT, 'src', 'ui', 'wol.js');
fs.copyFileSync(src, dst);
console.log('sync-web: src/core/wol.js -> src/ui/wol.js');
