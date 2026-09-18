import { spawnSync } from 'node:child_process';
const tests = ['settings','local-direct','billing','materials','material-structure','asr-direct','vision','frame-stacks','frame-serving','storage','douyin-session','douyin-video','provider-gateway','library-guide','generated-html','public-package'];
for (const name of tests) {
  const result = spawnSync(process.execPath, [`scripts/test-${name}.mjs`], { stdio:'inherit', timeout:90000, env:{...process.env, LOCAL_DIRECT_MODE:'true'} });
  if (result.status !== 0) { console.error(`FAILED: ${name}`); process.exit(result.status || 1); }
}
console.log(`All ${tests.length} offline suites passed.`);

