import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const {listPackage,extractFile}=createRequire(import.meta.url)('@electron/asar');
const resources=path.resolve('dist/win-unpacked/resources');
const archive=path.join(resources,'app.asar');
const entries=listPackage(archive);
assert(!entries.some(file=>/(?:^|[\\/])(?:\.env(?:\.|$)|jobs[\\/]|artifacts[\\/]|.*\.bin$)/i.test(file)),'Private or generated data in app archive');
const defaults=fs.readFileSync(path.join(resources,'config/private.env'),'utf8');
assert.match(defaults,/LOCAL_DIRECT_MODE=true/);
assert(!/API_KEY|APP_SECRET|COOKIE|PASSWORD|ACCOUNT_CLOUD_URL/.test(defaults));
for(const name of ['desktop/main.js','desktop/settings.js','desktop/preload.cjs','desktop/renderer/settings.js','server/config.js','server/downloader.js']) {
  assert(fs.readFileSync(name).equals(extractFile(archive,path.join(...name.split('/')))),`Archive differs from source: ${name}`);
}
console.log('Packaged source matches checkout; archive excludes private data and uses public local-mode defaults.');
