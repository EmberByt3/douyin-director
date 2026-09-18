import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
if(process.platform!=='win32')throw new Error('This desktop smoke test currently targets Windows.');
const root=process.cwd();
const dir=path.join(root,'artifacts','desktop-smoke');
fs.mkdirSync(dir,{recursive:true});
const profile=fs.mkdtempSync(path.join(dir,'profile-'));
const packaged=process.argv.includes('--packaged');
const executable=packaged?path.join(root,'dist','win-unpacked','Douyin Director Open Source.exe'):createRequire(import.meta.url)('electron');
for(const phase of ['write','reload','cleared']){
  await new Promise((resolve,reject)=>{
    const child=spawn(executable,packaged?[]:[root],{windowsHide:true,env:{...process.env,
      DESKTOP_TEST_USER_DATA:profile,DESKTOP_TEST_PORT:'8891',
      DESKTOP_SMOKE_SCREENSHOT:path.join(dir,`${packaged?'packaged':'source'}-${phase}.png`),
      DESKTOP_SMOKE_LOCAL_DIRECT:'true',DESKTOP_SMOKE_SETTINGS:'true',DESKTOP_SMOKE_SETTINGS_PHASE:phase,
      LOCAL_DIRECT_MODE:'true',FRAME_RATE_FPS:'5',DEEPSEEK_API_KEY:'synthetic-settings-old-key',MINIMAX_API_KEY:'',VOLCANO_ASR_API_KEY:'',
    },stdio:['ignore','pipe','pipe']});
    let out='',err='';
    child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);
    const timer=setTimeout(()=>{child.kill();reject(new Error(`Desktop smoke timed out (${phase})`));},45000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);fs.writeFileSync(path.join(dir,`${packaged?'packaged':'source'}-${phase}.log`),out+'\n'+err);
      if(code!==0||!out.includes('Desktop smoke test passed')) {
        console.error(out.slice(-6000)); console.error(err.slice(-6000));
        reject(new Error(`Desktop smoke failed (${phase}, exit ${code}); see artifacts/desktop-smoke`));
      } else resolve();
    });
  });
  console.log(`Desktop ${packaged?'packaged':'source'} smoke passed: ${phase}`);
}
