import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.cwd();
const ignored=new Set(['.git','node_modules','dist','build','artifacts','jobs','data','runtime','external','.env']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  if(ignored.has(entry.name)||entry.name.startsWith('.env.')&&entry.name!=='.env.example')return [];
  const file=path.join(dir,entry.name);
  if(entry.isSymbolicLink())throw new Error('Symlinks are not allowed in public source');
  return entry.isDirectory()?walk(file):[path.relative(root,file).replaceAll('\\','/')];
});}
const tracked=spawnSync('git',['ls-files','-z'],{encoding:'utf8'});
// In CI inspect every tracked file, even files that a local ignore rule would hide.
const files=tracked.status===0&&tracked.stdout?tracked.stdout.split('\0').filter(Boolean):walk(root);
const problems=[];
const tokenPatterns=[
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/,
];
for(const file of files){
  const parts=file.split('/');
  if(parts.some(p=>ignored.has(p))||/\.(?:env|bin|bak|pem|key|pfx|p12|mp4|mov|wav|mp3|sqlite|asar|exe|zip)$/i.test(file)||parts.some(p=>p.startsWith('.env.')&&p!=='.env.example'))problems.push([file,'private/generated file']);
  const buf=fs.readFileSync(path.join(root,file));
  if(buf.length>2*1024*1024)problems.push([file,'unexpected large file']);
  if(/\.(png|ico)$/i.test(file))continue;
  const text=buf.toString('utf8');
  if(tokenPatterns.some(re=>re.test(text)))problems.push([file,'credential-like literal']);
  if(/[CD]:[\\/](?:Users|CodexWork)[\\/]/i.test(text))problems.push([file,'private machine path']);
  if(/director-(?:api|admin)\.basshunter\.xyz/i.test(text))problems.push([file,'retired private deployment']);
}
if(problems.length){for(const [file,reason] of problems)console.error(`${file}: ${reason}`);process.exit(1);}
console.log(`Public-source checks passed (${files.length} files). This heuristic complements review; it is not a guarantee that all secrets are detected.`);
