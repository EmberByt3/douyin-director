import fs from "node:fs";
import path from "node:path";

// [config path, label, environment name, type, limits/choices]
export const fields = [
  ["localDirect","本地直连模式"], ["providerGatewayRequired","强制云端模型网关"],
  ["deepseek.baseUrl","文本接口地址","DEEPSEEK_BASE_URL","url"],
  ["deepseek.model","文本模型","DEEPSEEK_MODEL"], ["deepseek.apiKey","文本 API Key","DEEPSEEK_API_KEY","secret"],
  ["vision.provider","视频理解服务","VISION_PROVIDER","select",["minimax","off"]],
  ["minimax.visionUrl","视觉接口地址","MINIMAX_VISION_URL","url"],
  ["minimax.visionModel","视觉模型","MINIMAX_VISION_MODEL"],
  ["minimax.apiKey","视觉 API Key","MINIMAX_API_KEY","secret"],
  ["minimax.groupId","Group ID","MINIMAX_GROUP_ID"], ["minimax.serviceTier","服务等级","MINIMAX_SERVICE_TIER"],
  ["vision.batchSize","每批画面数量","VISION_BATCH_SIZE","number",[1,19]],
  ["vision.batchConcurrency","视觉并发批数","VISION_BATCH_CONCURRENCY","number",[1,8]],
  ["asr.provider","语音识别服务","ASR_PROVIDER","select",["volcano"]],
  ["asr.required","要求有效语音识别","ASR_REQUIRED","boolean"],
  ["volcano.apiKey","语音 API Key","VOLCANO_ASR_API_KEY","secret"],
  ["volcano.submitUrl","语音提交地址","VOLCANO_ASR_SUBMIT_URL","url"],
  ["volcano.queryUrl","语音查询地址","VOLCANO_ASR_QUERY_URL","url"],
  ["volcano.resourceId","语音资源 ID","VOLCANO_ASR_RESOURCE_ID"],
  ["volcano.language","识别语言","VOLCANO_ASR_LANGUAGE"],
  ["volcano.pollIntervalMs","查询间隔（毫秒）","VOLCANO_ASR_POLL_INTERVAL_MS","number",[500,60000]],
  ["volcano.timeoutMs","语音轮询超时（毫秒）","VOLCANO_ASR_TIMEOUT_MS","number",[10000,1800000]],
  ["volcano.directUploadMaxMb","音频直传上限（MB）","VOLCANO_DIRECT_UPLOAD_MAX_MB","number",[1,95]],
  ["volcano.publicUrlRetries","旧公网音频重试次数（当前不使用）"],
  ["frameRateFps","每秒抽帧数","FRAME_RATE_FPS","number",[1,30]],
  ["keepVideo","保留视频与音频","KEEP_VIDEO","boolean"],
  ["download.retryTimes","直链下载尝试次数","DOWNLOAD_RETRY_TIMES","number",[1,10]],
  ["download.retryDelaysMs","直链重试间隔（毫秒，逗号分隔）","DOWNLOAD_RETRY_DELAYS_MS","delays"],
  ["download.integrityCheck","直链下载完整性校验","DOWNLOAD_INTEGRITY_CHECK","boolean"],
  ["download.cookie","备用下载 Cookie","DOUYIN_COOKIE","secret"],
  ["download.browserFallbackEnabled","Python 浏览器回退（桌面主流程不使用）","BROWSER_FALLBACK_ENABLED","boolean"],
  ["download.douyinDownloaderEnabled","启用备用 Python 下载器","DOUYIN_DOWNLOADER_ENABLED","boolean"],
  ["download.douyinDownloaderTimeoutMs","Python 下载超时（毫秒）","DOUYIN_DOWNLOADER_TIMEOUT_MS","number",[10000,600000]],
  ["download.douyinDownloaderRepo","可选 Python 下载器目录","DOUYIN_DOWNLOADER_REPO","path"], ["download.douyinDownloaderPython","可选 Python 执行路径","DOUYIN_DOWNLOADER_PYTHON","path"],
  ["materialLibrary.platformApiUrl","平台素材代理地址（本地模式停用）"],
  ["materialLibrary.platformApiKey","平台素材代理密钥",null,"secret"],
  ["materialLibrary.platformAppId","平台飞书 App ID","PLATFORM_FEISHU_APP_ID"],
  ["materialLibrary.platformAppSecret","平台飞书 App Secret","PLATFORM_FEISHU_APP_SECRET","secret"],
  ["materialLibrary.platformBaseUrl","平台飞书 Base 地址","PLATFORM_FEISHU_BASE_URL","urlOptional"],
  ["billing.enabled","云端计费开关"], ["billing.devMode","计费开发模式"],
  ["billing.trialPoints","旧账户体验次数"], ["billing.analyzeCost","旧分析次数规则"],
  ["billing.rewriteCost","旧仿写次数规则"], ["billing.libraryScriptCost","旧素材创作次数规则"],
  ["billing.sessionDays","旧账户会话有效天数"], ["billing.checkoutUrlTemplate","旧支付地址"],
  ["rootDir","应用资源目录"], ["port","当前本地服务端口"], ["publicBaseUrl","当前本地服务地址"],
  ["refreshPublicBaseUrl","公网通道刷新器"], ["jobsDir","任务存储目录"],
  ["accountDataPath","历史本地账户文件"], ["ffmpegPath","FFmpeg 执行路径","FFMPEG_PATH","path"],
];
const groupFor = key => /^(deepseek)/.test(key) ? "文本模型" : /^(vision|minimax)/.test(key) ? "视觉模型" : /^(asr|volcano)/.test(key) ? "语音识别" : /^(download)/.test(key) ? "视频下载" : /^(materialLibrary)/.test(key) ? "平台素材库" : /^billing/.test(key) ? "已停用的计费配置" : /frameRateFps|keepVideo/.test(key) ? "视频处理" : "运行与存储";
const get = (value,key) => key.split(".").reduce((item,part)=>item?.[part],value);
const display = value => value == null ? "未启用" : Array.isArray(value) ? value.join(",") : String(value);
export function validateChanges(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("配置格式不正确。");
  const result = {};
  for (const [key,raw] of Object.entries(changes)) {
    const field=fields.find(item=>item[0]===key && item[2]);
    if (!field) throw new Error("包含不支持修改的配置项。");
    const [,label,env,type,limits]=field;
    if (typeof raw !== "string" || raw.length>16384 || /[\r\n\0]/.test(raw)) throw new Error(`${label}格式不正确。`);
    const value=key === "deepseek.baseUrl" ? raw.trim().replace(/\/+$/, "") : raw.trim();
    if (type === "number" && (!/^\d+$/.test(value) || Number(value)<limits[0] || Number(value)>limits[1])) throw new Error(`${label}须在 ${limits[0]}–${limits[1]} 之间。`);
    if (type === "boolean" && !["true","false"].includes(value)) throw new Error(`${label}须为开或关。`);
    if (type === "select" && !limits.includes(value)) throw new Error(`${label}选项无效。`);
    if (type === "path" && !value) throw new Error(`${label}不能为空。`);
    if (type === "delays" && (!/^\d+(,\d+)*$/.test(value) || value.split(",").some(v=>Number(v)>60000))) throw new Error(`${label}格式不正确。`);
    if (type?.startsWith("url") && (value || type==="url")) {
      let url; try { url=new URL(value); } catch { throw new Error(`${label}须为有效地址。`); }
      if (url.protocol!=="https:" || url.username || url.password || url.hash) throw new Error(`${label}须使用 HTTPS，且不能含账号密码或片段。`);
    }
    if (!type && !value && !/groupId|platformAppId/.test(key)) throw new Error(`${label}不能为空。`);
    result[env]=value;
  }
  return result;
}
export function settingsSnapshot(config,overrides={},extra={}) {
  const rows=fields.map(([key,label,env,type,limits])=> {
    const actual=display(get(config,key));
    const saved=env && Object.hasOwn(overrides,env) ? overrides[env] : actual;
    const secret=type==="secret";
    return {key,label,env:env||"",group:groupFor(key),type:type||typeof get(config,key),choices:type==="select"?limits:undefined,
      editable:Boolean(env),secret,configured:secret?Boolean(saved):undefined,
      value:secret?"":saved,effective:secret?"":actual,pending:saved!==actual};
  });
  for (const [key,label,value,secret=false,group="运行与存储"] of extra.rows||[]) rows.push({key,label,group,type:"string",editable:false,secret,configured:secret?Boolean(value):undefined,value:secret?"":display(value),effective:secret?"":display(value),pending:false});
  return {rows,pending:rows.some(row=>row.pending),mode:config.localDirect?"本地直连":"云端网关"};
}
export function readSettings(file,codec) {
  if (!fs.existsSync(file)) return {};
  const values=JSON.parse(codec.decryptString(fs.readFileSync(file)));
  const changes={};
  for (const field of fields) if (field[2] && Object.hasOwn(values,field[2])) changes[field[0]]=values[field[2]];
  return validateChanges(changes);
}
export function writeSettings(file,values,codec) {
  if (!codec.isEncryptionAvailable()) throw new Error("系统安全存储不可用，未保存配置。");
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=`${file}.tmp`;
  try { fs.writeFileSync(temp,codec.encryptString(JSON.stringify(values))); fs.renameSync(temp,file); }
  finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); }
}
