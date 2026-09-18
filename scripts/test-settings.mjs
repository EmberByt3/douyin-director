import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fields, validateChanges, settingsSnapshot, readSettings, writeSettings } from '../desktop/settings.js';
import { config } from '../server/config.js';
const leaves=(obj,prefix='')=>Object.entries(obj).flatMap(([key,value])=>value && typeof value==='object' && !Array.isArray(value)?leaves(value,prefix+key+'.'):[prefix+key]);
assert.deepEqual(fields.map(f=>f[0]).sort(),leaves(config).sort(),'Every effective config must appear');
const synthetic=structuredClone(config);
for(const field of fields.filter(f=>f[3]==='secret')) {
  const keys=field[0].split('.'); synthetic[keys[0]][keys[1]]='synthetic-secret-'+field[0];
}
const snapshot=settingsSnapshot(synthetic,validateChanges({'deepseek.apiKey':'synthetic-saved-key','frameRateFps':'6'}));
assert(!JSON.stringify(snapshot).includes('synthetic-secret'));
assert(!JSON.stringify(snapshot).includes('synthetic-saved-key'));
assert(snapshot.rows.find(r=>r.key==='deepseek.apiKey').pending);
assert.equal(validateChanges({'deepseek.baseUrl':'https://api.example.com///'}).DEEPSEEK_BASE_URL,'https://api.example.com');
for(const changes of [{'localDirect':'false'},{'frameRateFps':'0'},{'frameRateFps':'3.5'},{'deepseek.baseUrl':'http://example.com'},{'vision.provider':'invalid'},{'download.retryDelaysMs':'1,no'},{'deepseek.apiKey':'secret\nINJECT=value'}])assert.throws(()=>validateChanges(changes));
assert.equal(validateChanges({'deepseek.apiKey':''}).DEEPSEEK_API_KEY,'');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'director-settings-'));
const file=path.join(dir,'settings.bin');
const key=crypto.randomBytes(32);
const codec={isEncryptionAvailable:()=>true,encryptString(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(value),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]);},decryptString(value){const cipher=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));cipher.setAuthTag(value.subarray(12,28));return Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString();}};
try {
  assert.deepEqual(readSettings(file,codec),{});
  const values=validateChanges({'deepseek.apiKey':'synthetic-secret','frameRateFps':'6'});
  writeSettings(file,values,codec);assert.deepEqual(readSettings(file,codec),values);
  assert(!fs.readFileSync(file).includes('synthetic-secret'));
  writeSettings(file,{...values,DEEPSEEK_API_KEY:''},codec);assert.equal(readSettings(file,codec).DEEPSEEK_API_KEY,'');
  assert.throws(()=>writeSettings(file,values,{isEncryptionAvailable:()=>false}));
  assert.equal(readSettings(file,codec).DEEPSEEK_API_KEY,'');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
console.log('Settings passed: complete coverage, redaction, validation, encrypted persistence, clearing, fail-closed storage.');
