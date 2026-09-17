// 把 src/core/wol.js 复制到 src/ui/wol.js
// 目的：Capacitor 的 webDir(src/ui) 必须是自包含的，而 Electron 能直接读 ../core
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'src', 'core', 'wol.js');
const dst = path.join(ROOT, 'src', 'ui', 'wol.js');
const banner =
  '// 自动生成，请勿手改：本文件由 npm run sync:web 从 src/core/wol.js 复制而来。\n' +
  '// 要改逻辑请改 src/core/wol.js，然后重新执行 npm run sync:web（或 cap:sync / electron / dist:win）。\n';
fs.writeFileSync(dst, banner + fs.readFileSync(src, 'utf8'));
console.log('sync-web: src/core/wol.js -> src/ui/wol.js');
