// Native UI regression checks. Mutating checks are restricted to an isolated test profile.
export async function smokeSettings(window, phase) {
  if (phase !== "read" && !process.env.DESKTOP_TEST_USER_DATA) throw new Error("Settings tests require an isolated profile");
  const result = await window.webContents.executeJavaScript(`(async () => {
    const assert = (value, label) => { if (!value) throw new Error(label); };
    await window.openWorkbenchSettings();
    const snapshot = await window.desktopAPI.getSettings();
    assert(snapshot.rows.length >= 60, 'Incomplete settings');
    assert(snapshot.rows.filter(r=>r.secret).every(r=>r.value === '' && r.effective === ''), 'Snapshot contains a secret');
    assert(document.querySelectorAll('.setting-row').length === snapshot.rows.length, 'Missing UI fields');
    assert([...document.querySelectorAll('.setting-row input[type=password]')].every(i=>!i.value), 'Secret prefilled');
    const search = document.getElementById('settingsSearch');
    search.value='DEEPSEEK'; search.dispatchEvent(new Event('input'));
    assert([...document.querySelectorAll('.setting-row')].filter(e=>!e.hidden).length === 3,'Search failed');
    search.value=''; search.dispatchEvent(new Event('input'));
    if (${JSON.stringify(phase)} === 'write') {
      const keyInput = document.getElementById('setting-deepseek.apiKey');
      const reveal = keyInput.parentElement.querySelector('button'); reveal.click();
      for(let i=0;i<100 && keyInput.type!=='text';i++) await new Promise(r=>setTimeout(r,50));
      assert(keyInput.type==='text' && keyInput.value==='synthetic-settings-old-key','Reveal failed');
      reveal.click(); assert(keyInput.type==='password' && keyInput.value==='','Hide failed');
      keyInput.value='synthetic-settings-new-key'; keyInput.dispatchEvent(new Event('input'));
      const frames=document.getElementById('setting-frameRateFps'); frames.value='6';frames.dispatchEvent(new Event('input'));
      document.getElementById('saveSettings').click();
      for(let i=0;i<100;i++) {if(document.getElementById('settingsMessage').textContent.startsWith('已加密保存'))break;await new Promise(r=>setTimeout(r,50));}
      const after=await window.desktopAPI.getSettings();
      const frame=after.rows.find(r=>r.key==='frameRateFps');
      assert(frame.value==='6' && frame.effective==='5' && frame.pending,'Save incorrectly applied live');
      assert(!document.getElementById('restartSettings').disabled,'Restart unavailable');
      assert(document.getElementById('setting-deepseek.apiKey').value==='','Saved secret displayed');
      let rejected=false;try{await window.desktopAPI.saveSettings({'localDirect':'false'});}catch{rejected=true;}assert(rejected,'Readonly mutation accepted');
    }
    if (${JSON.stringify(phase)} === 'reload') {
      const frame=snapshot.rows.find(r=>r.key==='frameRateFps');
      assert(frame.value==='6' && frame.effective==='6' && !frame.pending,'Saved setting not applied after restart');
      assert(await window.desktopAPI.revealSetting('deepseek.apiKey')==='synthetic-settings-new-key','Saved key not applied');
      await window.desktopAPI.saveSettings({'deepseek.apiKey':''});
    }
    if (${JSON.stringify(phase)} === 'cleared') {
      const key=snapshot.rows.find(r=>r.key==='deepseek.apiKey');
      assert(!key.configured && !key.pending,'Cleared key restored from base env');
      assert(await window.desktopAPI.revealSetting('deepseek.apiKey')==='','Clear failed');
    }
    return {rows:snapshot.rows.length, passed:true};
  })()`);
  if (!result.passed) throw new Error("Settings UI test failed");
}
