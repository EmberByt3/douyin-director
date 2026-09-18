import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Deliberately independent of .env, user settings and the packaging machine's environment.
const defaults = 'LOCAL_DIRECT_MODE=true\nPROVIDER_GATEWAY_REQUIRED=false\nBILLING_ENABLED=false\nVISION_PROVIDER=minimax\nDOUYIN_DOWNLOADER_ENABLED=false\nFFMPEG_PATH=ffmpeg\n';
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'private.env'), defaults);
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'build', 'LICENSE.txt'));
console.log('Prepared public defaults; no developer configuration was read.');
