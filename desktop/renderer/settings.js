(() => {
  const byId = id => document.getElementById(id);
  const page = byId("settingsPage"), content = byId("settingsContent"), message = byId("settingsMessage");
  const save = byId("saveSettings"), restart = byId("restartSettings");
  let snapshot = null, busy = false, lastFocus = null;
  const changes = new Map();
  const descriptions = {
    "文本模型":"脚本拆解与创作所用的模型接口。",
    "视觉模型":"按批次读取视频画面；关闭后不调用视觉模型。",
    "语音识别":"识别口播内容；接口直接从本机访问。",
    "视频下载":"桌面优先使用抖音登录窗口的会话抓取，备用配置在相应下载路径使用。",
    "个人素材库":"独立保存的个人飞书连接；通过上方“编辑个人飞书连接”修改并验证。",
    "平台素材库":"平台飞书素材库与个人素材库分别配置。本地模式停用云服务器代理。",
    "已停用的计费配置":"当前不扣次数、不访问账户云服务。旧参数仅供查看。",
    "运行与存储":"端口与本地访问保护由程序管理。任务目录通过“存储管理”修改。FFmpeg 可填写命令名或完整执行路径。",
    "视频处理":"抽帧密度影响画面数量、处理时长和模型用量。"
  };
  const element = (tag, text, className) => { const e = document.createElement(tag); if(text !== undefined)e.textContent=text; if(className)e.className=className; return e; };
  const readable = value => value === "true" ? "开启" : value === "false" ? "关闭" : value || "未配置";
  function status(text, error=false) { message.textContent=text; message.classList.toggle("error",error); }
  function buttons() { save.disabled=busy || !changes.size; restart.disabled=busy || changes.size>0 || !snapshot?.pending; }
  function mark(row, value, note) {
    if (!row.secret && value===row.value) changes.delete(row.key); else changes.set(row.key,value);
    note.textContent=changes.has(row.key)?"尚未保存；保存后重启生效":row.pending?`重启后生效；当前：${row.secret?"密钥已遮住":readable(row.effective)}`:row.editable?"修改后需重启":"系统管理 / 只读";
    note.classList.toggle("pending",changes.has(row.key)||row.pending);
    status(changes.size?`${changes.size} 项尚未保存。`:snapshot.pending?"存在已保存配置，重启后生效。":"当前配置已生效。"); buttons();
  }
  function render(data) {
    snapshot=data; content.replaceChildren();
    const groups=new Map();
    const order=["文本模型","视觉模型","语音识别","视频处理","视频下载","个人素材库","平台素材库","运行与存储","已停用的计费配置"];
    for(const row of [...data.rows].sort((a,b)=>order.indexOf(a.group)-order.indexOf(b.group))) {
      let group=groups.get(row.group);
      if(!group) { group=element("section",undefined,"settings-group"); group.append(element("h2",row.group),element("p",descriptions[row.group]||"")); groups.set(row.group,group); content.append(group); }
      const wrapper=element("div",undefined,"setting-row"); wrapper.dataset.search=`${row.label} ${row.env||""} ${row.group} ${row.secret?"":row.value}`.toLowerCase(); wrapper.dataset.key=row.key;
      const label=element("label",row.label,"setting-label"); label.htmlFor=`setting-${row.key}`; label.append(element("small",row.env||row.key));
      const control=element("div",undefined,"setting-control"), line=element("div",undefined,"setting-input-line"), note=element("small",row.pending?`重启后生效；当前：${row.secret?"密钥已遮住":readable(row.effective)}`:row.editable?"修改后需重启":"系统管理 / 只读",`setting-note${row.pending?" pending":""}`);
      if(row.editable || row.secret) {
        const input=element(row.type==="boolean"||row.type==="select"?"select":"input"); input.id=`setting-${row.key}`; input.autocomplete="off";
        if(input.tagName==="SELECT") for(const value of row.type==="boolean"?["true","false"]:row.choices) { const option=element("option",readable(value)); option.value=value; input.append(option); }
        else input.type=row.secret?"password":row.type==="number"?"number":"text";
        input.value=row.value; input.readOnly=!row.editable; input.placeholder=row.secret?(row.configured?"已配置 · 点击查看或输入替换":"未配置"):"未配置";
        input.addEventListener("input",()=>mark(row,input.value,note)); line.append(input);
        if(row.secret) {
          const reveal=element("button","查看","button button-secondary"); reveal.type="button";
          reveal.addEventListener("click",async()=>{
            if(input.type==="text") { input.type="password"; if(!changes.has(row.key))input.value=""; reveal.textContent="查看"; return; }
            reveal.disabled=true;
            try { if(!changes.has(row.key))input.value=await window.desktopAPI.revealSetting(row.key); input.type="text"; reveal.textContent="隐藏"; }
            catch { status("无法查看此配置，请重新打开设置页。",true); }
            finally { reveal.disabled=false; }
          }); line.append(reveal);
          if(row.editable) { const clear=element("button","清空","button button-secondary"); clear.type="button"; clear.addEventListener("click",()=>{input.value="";input.type="password";reveal.textContent="查看";mark(row,"",note);});line.append(clear); }
        }
      } else line.append(element("div",readable(row.value),"setting-value"));
      control.append(line,note); wrapper.append(label,control); group.append(wrapper);
    }
    filter(); buttons();
  }
  function filter() {
    const query=byId("settingsSearch").value.trim().toLowerCase();
    for(const group of content.querySelectorAll(".settings-group")) { let count=0; for(const row of group.querySelectorAll(".setting-row")) { row.hidden=!row.dataset.search.includes(query); if(!row.hidden)count++; } group.hidden=!count; }
    content.querySelector(".settings-empty")?.remove();
    if(snapshot && ![...content.querySelectorAll(".settings-group")].some(g=>!g.hidden))content.append(element("p","没有匹配的配置。","settings-empty"));
  }
  window.openWorkbenchSettings=async()=>{
    lastFocus=document.activeElement; page.hidden=false; busy=true; buttons(); status("正在读取本机配置…");
    try { const data=await window.desktopAPI.getSettings(); changes.clear();render(data);status(data.pending?"存在已保存配置，重启后生效。":"当前配置已生效；密钥默认遮住，可逐项查看。"); }
    catch { content.replaceChildren();status("配置读取失败，请检查本机服务和配置文件。",true); }
    finally { busy=false;buttons();byId("settingsSearch").focus(); }
  };
  function close() {
    if(busy)return false;
    if(changes.size && !window.confirm("有尚未保存的配置，放弃修改并返回？"))return false;
    changes.clear(); content.replaceChildren(); page.hidden=true;lastFocus?.focus();return true;
  }
  byId("closeSettings").addEventListener("click",close);
  byId("openSettings").addEventListener("click",window.openWorkbenchSettings);
  byId("settingsSearch").addEventListener("input",filter);
  byId("settingsStorage").addEventListener("click",()=>{if(close())openAccountDrawer();});
  byId("settingsLibrary").addEventListener("click",()=>{if(close())activateTab("library");});
  save.addEventListener("click",async()=>{busy=true;buttons();try{render(await window.desktopAPI.saveSettings(Object.fromEntries(changes)));changes.clear();status("已加密保存。点击“重启生效”应用配置。");}catch(error){status(String(error.message).replace(/^Error invoking remote method '[^']+': Error: /,""),true);}finally{busy=false;buttons();}});
  restart.addEventListener("click",async()=>{busy=true;buttons();try{await window.desktopAPI.restartForSettings();status("正在重启工作台…");}catch(error){status(String(error.message).replace(/^Error invoking remote method '[^']+': Error: /,""),true);busy=false;buttons();}});
  document.addEventListener("keydown",event=>{
    if(page.hidden)return;
    if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();close();}
    if(event.key==="Tab") {const focusable=[...page.querySelectorAll("button:not(:disabled),input,select")].filter(e=>e.getClientRects().length); const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  },true);
})();
