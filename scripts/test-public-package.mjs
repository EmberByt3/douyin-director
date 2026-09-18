import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const secret='synthetic-packaging-secret-must-not-ship';
const result=spawnSync(process.execPath,['scripts/prepare-package-env.mjs'],{env:{...process.env,DEEPSEEK_API_KEY:secret,ACCOUNT_CLOUD_URL:'https://private.example.invalid'},encoding:'utf8'});
assert.equal(result.status,0);
const text=fs.readFileSync('build/private.env','utf8');
assert.match(text,/LOCAL_DIRECT_MODE=true/);
assert.match(text,/BILLING_ENABLED=false/);
assert(!text.includes(secret));assert(!text.includes('private.example.invalid'));
assert(!/API_KEY|APP_SECRET|COOKIE|PASSWORD/.test(text));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.equal(pkg.license,'MIT');
assert(pkg.build.files.includes('!**/.env*'));
assert(!pkg.build.extraResources.some(r=>r.from.includes('runtime')||r.from.includes('external')));
console.log('Public packaging defaults passed: local mode, no private config or bundled third-party runtime.');

