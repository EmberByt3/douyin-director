import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
} from "electron";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fields, readSettings, writeSettings, validateChanges, settingsSnapshot } from "./settings.js";
import {
  clearManagedJobsDir,
  customJobsDir,
  defaultJobsDir,
  getStorageInfo,
  prepareManagedJobsDir,
  readJobsDirSetting,
  saveJobsDirSetting,
} from "./storage.js";
import {
  applyEdgeHeaders,
  buildEdgeIdentity,
  isSafeLoginNavigation,
} from "./douyin-session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREFERRED_API_PORT = Number(process.env.DESKTOP_TEST_PORT || 8789);
let apiPort = PREFERRED_API_PORT;
let apiBase = `http://127.0.0.1:${apiPort}`;

let mainWindow = null;
let loginWindow = null;
let tunnelProcess = null;
let backendStartPromise = null;
let localApiStarted = false;
let apiPortSelected = false;
let apiPortSelectionPromise = null;
let backendStatus = { state: "starting", message: "正在启动桌面服务..." };
let userLibrarySettings = null;
let jobsDir = "";
let douyinSessionConfigured = false;
let cloudAccount = null;
const localApiToken = crypto.randomBytes(32).toString("base64url");
const MATERIAL_GUIDE_URLS = Object.freeze({
  "developer-console": "https://open.feishu.cn/app",
  "bitable-permission":
    "https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/get",
});

app.setName("抖音编导拆解台 开源版");
app.setAppUserModelId("org.douyindirector.opensource");
app.setPath("userData", path.join(app.getPath("appData"), "douyin-director-opensource"));
app.disableHardwareAcceleration();
if (process.env.DESKTOP_TEST_USER_DATA) {
  app.setPath("userData", process.env.DESKTOP_TEST_USER_DATA);
}

function writeStartupLog(event, detail = "") {
  try {
    const target = path.join(app.getPath("userData"), "startup.log");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(
      target,
      `${new Date().toISOString()}\t${event}\t${String(detail).replace(/[\r\n]+/g, " ")}\n`,
      "utf8",
    );
  } catch {
    // Startup logging must never prevent the app from opening.
  }
}

writeStartupLog(
  "process-start",
  `version=${app.getVersion()} packaged=${app.isPackaged}`,
);
process.on("unhandledRejection", (reason) => {
  writeStartupLog(
    "unhandled-rejection",
    reason instanceof Error ? reason.stack || reason.message : String(reason),
  );
});
process.on("uncaughtException", (error) => {
  writeStartupLog(
    "uncaught-exception",
    error?.stack || error?.message || String(error),
  );
  try {
    dialog.showErrorBox(
      "抖音编导拆解台启动失败",
      `${error?.message || error}\n\n日志：${path.join(app.getPath("userData"), "startup.log")}`,
    );
  } finally {
    app.exit(1);
  }
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function getResourceRoot() {
  return app.isPackaged
    ? process.resourcesPath
    : app.getAppPath();
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!Object.hasOwn(process.env, key)) process.env[key] = parts.join("=").trim();
  }
}

function configureRuntime() {
  const resourceRoot = getResourceRoot();
  const envPath = app.isPackaged
    ? path.join(resourceRoot, "config", "private.env")
    : path.join(app.getAppPath(), ".env");

  loadEnvFile(envPath);
  Object.assign(process.env, readSettings(workbenchSettingsPath(), safeStorage));
  process.env.PORT = String(apiPort);
  process.env.PUBLIC_BASE_URL = apiBase;
  process.env.LOCAL_API_TOKEN = localApiToken;
  configureJobsDirectory();
  process.env.ACCOUNT_DATA_PATH = path.join(
    app.getPath("userData"),
    "account-store.json",
  );
  process.env.DOUYIN_DOWNLOADER_REPO ||= path.join(
    resourceRoot,
    "external",
    "jiji262-douyin-downloader",
  );
  process.env.DOUYIN_DOWNLOADER_PYTHON ||= "python";
  // Open-source distributions use user-installed FFmpeg; never a developer's private runtime.
  process.env.FFMPEG_PATH ||= "ffmpeg";
  process.env.FRAME_RATE_FPS ||= "5";
}

function workbenchSettingsPath() {
  return path.join(app.getPath("userData"), "workbench-settings.bin");
}

function assertSettingsSender(event) {
  const contents = mainWindow?.webContents;
  const expected = pathToFileURL(path.join(__dirname, "renderer", "index.html")).href;
  if (!contents || event.sender.id !== contents.id || event.senderFrame !== contents.mainFrame || event.senderFrame.url !== expected) {
    throw new Error("此页面不能访问本机配置。");
  }
}

async function getWorkbenchSettings() {
  await startBackend();
  const { config } = await import("../server/config.js");
  const cookies = await session.fromPartition("persist:douyin-director").cookies.get({ domain: ".douyin.com" });
  return settingsSnapshot(config, readSettings(workbenchSettingsPath(), safeStorage), { rows: [
    ["cloudAccountUrl", "账户云通道地址（当前已停用）", process.env.ACCOUNT_CLOUD_URL || "未启用"],
    ["overrideFile", "设置保存位置（系统加密）", workbenchSettingsPath()],
    ["baseConfigFile", "基础配置文件", app.isPackaged ? path.join(getResourceRoot(), "config", "private.env") : path.join(app.getAppPath(), ".env")],
    ["localAccess", "本地 API 访问保护", "已启用；启动时生成临时令牌"],
    ["douyinSession", "抖音本机登录状态", cookies.some(c => ["sessionid", "sessionid_ss"].includes(c.name) && c.value) ? "检测到登录凭据；有效性由抖音确认" : "未检测到登录凭据", false, "视频下载"],
    ["browserResolveTimeout", "桌面视频解析超时（毫秒）", 45000, false, "视频下载"],
    ["browserDownloadTimeout", "桌面视频下载超时（毫秒）", 120000, false, "视频下载"],
    ["userLibrary.appId", "个人飞书 App ID", userLibrarySettings?.appId || "未配置", false, "个人素材库"],
    ["userLibrary.appSecret", "个人飞书 App Secret", userLibrarySettings?.appSecret || "", true, "个人素材库"],
    ["userLibrary.baseUrl", "个人飞书 Base 地址", userLibrarySettings?.baseUrl || "未配置", false, "个人素材库"],
  ] });
}

ipcMain.handle("settings:get", async event => {
  assertSettingsSender(event);
  return getWorkbenchSettings();
});
ipcMain.handle("settings:reveal", async (event, key) => {
  assertSettingsSender(event);
  await startBackend();
  if (key === "userLibrary.appSecret") return userLibrarySettings?.appSecret || "";
  const field = fields.find(f => f[0] === key && f[3] === "secret");
  if (!field) throw new Error("不支持查看此配置。");
  const saved = readSettings(workbenchSettingsPath(), safeStorage);
  if (field[2] && Object.hasOwn(saved, field[2])) return saved[field[2]];
  const { config } = await import("../server/config.js");
  return key.split(".").reduce((value, part) => value?.[part], config) || "";
});
ipcMain.handle("settings:save", async (event, changes) => {
  assertSettingsSender(event);
  const updates = validateChanges(changes);
  writeSettings(workbenchSettingsPath(), { ...readSettings(workbenchSettingsPath(), safeStorage), ...updates }, safeStorage);
  return getWorkbenchSettings();
});
ipcMain.handle("settings:restart", async event => {
  assertSettingsSender(event);
  const { hasActiveJobs } = await import("../server/jobs.js");
  if (hasActiveJobs()) throw new Error("当前有任务正在运行；配置已保存，请在任务结束后重启。");
  app.relaunch();
  setTimeout(() => app.exit(0), 150);
  return true;
});

async function hydrateCloudAccount() {
  const { config } = await import("../server/config.js");
  if (config.localDirect) {
    const { configureCloudBilling } = await import("../server/billing/runtime.js");
    const { configureProviderGateway } = await import("../server/providers/gateway.js");
    configureCloudBilling(null);
    configureProviderGateway(null);
    cloudAccount = null;
    return null;
  }
  if (cloudAccount) return cloudAccount;
  const { CloudAccountClient } = await import("./cloud-account.js");
  cloudAccount = new CloudAccountClient({
    baseUrl: process.env.ACCOUNT_CLOUD_URL || "",
    statePath: path.join(app.getPath("userData"), "cloud-account.bin"),
    encryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
    allowInsecureLocalhost: !app.isPackaged,
  });
  const { configureCloudBilling } =
    await import("../server/billing/runtime.js");
  configureCloudBilling(cloudAccount);
  const { configureProviderGateway } =
    await import("../server/providers/gateway.js");
  configureProviderGateway(cloudAccount);
  return cloudAccount;
}

function configureJobsDirectory() {
  if (jobsDir) return jobsDir;
  const userDataPath = app.getPath("userData");
  const configuredJobsDir = readJobsDirSetting(userDataPath);
  try {
    jobsDir = prepareManagedJobsDir(configuredJobsDir, {
      allowExistingWithoutMarker:
        configuredJobsDir === defaultJobsDir(userDataPath),
    });
  } catch (error) {
    writeStartupLog(
      "storage-fallback",
      error instanceof Error ? error.message : String(error),
    );
    jobsDir = prepareManagedJobsDir(defaultJobsDir(userDataPath), {
      allowExistingWithoutMarker: true,
    });
  }
  process.env.JOBS_DIR = jobsDir;
  return jobsDir;
}

function materialSettingsPath() {
  return path.join(app.getPath("userData"), "material-library.bin");
}

async function hydrateUserLibrary() {
  userLibrarySettings = readEncryptedMaterialSettings();
  const { setUserLibraryConfig, clearUserLibraryConfig } =
    await import("../server/materials/runtime.js");
  if (userLibrarySettings) setUserLibraryConfig(userLibrarySettings);
  else clearUserLibraryConfig();
}

function readEncryptedMaterialSettings() {
  const target = materialSettingsPath();
  if (!fs.existsSync(target) || !safeStorage.isEncryptionAvailable())
    return null;
  try {
    const value = JSON.parse(
      safeStorage.decryptString(fs.readFileSync(target)),
    );
    if (!value?.appId || !value?.appSecret || !value?.baseUrl) return null;
    return value;
  } catch {
    return null;
  }
}

function writeEncryptedMaterialSettings(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows 凭据加密当前不可用，已阻止保存 App Secret。");
  }
  fs.mkdirSync(path.dirname(materialSettingsPath()), { recursive: true });
  fs.writeFileSync(
    materialSettingsPath(),
    safeStorage.encryptString(JSON.stringify(value)),
  );
}

function publicMaterialSettings(value) {
  return {
    configured: Boolean(value),
    appId: value?.appId || "",
    baseUrl: value?.baseUrl || "",
    secretConfigured: Boolean(value?.appSecret),
  };
}

function sendBackendStatus(state, message) {
  backendStatus = { state, message };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (!mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send("backend:status", backendStatus);
      }
    } catch {
      // The window may close between the guard and IPC dispatch.
    }
  }
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBase}/health`);
      const payload = await response.json();
      if (response.ok && payload.ok) return;
    } catch {
      // The API may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`本地分析服务启动超时（端口 ${apiPort}）。`);
}

async function startLocalApi() {
  sendBackendStatus("starting", "正在启动本地分析服务...");
  await import("../server/index.js");
  await waitForHealth();
}

function startTunnel() {
  return new Promise((resolve, reject) => {
    const cloudflared = path.join(
      getResourceRoot(),
      "tools",
      "cloudflared.exe",
    );
    if (!fs.existsSync(cloudflared)) {
      reject(new Error("程序包缺少 cloudflared.exe。"));
      return;
    }

    sendBackendStatus("starting", "正在建立语音识别通道...");
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`无法建立语音识别通道。${output.slice(-500)}`));
    }, 90000);

    tunnelProcess = spawn(
      cloudflared,
      ["tunnel", "--no-autoupdate", "--protocol", "http2", "--url", apiBase],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const consume = (chunk) => {
      output += chunk.toString();
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(match[0]);
    };

    tunnelProcess.stdout.on("data", consume);
    tunnelProcess.stderr.on("data", consume);
    tunnelProcess.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    tunnelProcess.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `语音识别通道异常退出（${code ?? "unknown"}）。${output.slice(-500)}`,
        ),
      );
    });
  });
}

async function startBackend() {
  if (backendStartPromise) return backendStartPromise;
  backendStartPromise = (async () => {
    if (!localApiStarted) {
      await selectApiPort();
      configureRuntime();
      await hydrateCloudAccount();
      await hydrateUserLibrary();
      const { configureBrowserVideoDownloader } = await import("../server/downloader.js");
      const { downloadDouyinVideo } = await import("./douyin-video.js");
      configureBrowserVideoDownloader(async ({ sourceUrl, targetDir, log }) => {
        const { douyinSession, edgeIdentity } = configureDouyinSession();
        return downloadDouyinVideo({ sourceUrl, targetDir, log, douyinSession, userAgent: edgeIdentity.userAgent });
      });
      await startLocalApi();
      localApiStarted = true;
    }
    const { config } = await import("../server/config.js");
    config.refreshPublicBaseUrl = null;
    sendBackendStatus("ready", config.localDirect ? "服务已就绪，本机直接调用模型，可以开始分析。" : "服务已就绪，可以粘贴抖音链接开始分析。");
  })();
  try {
    await backendStartPromise;
  } finally {
    backendStartPromise = null;
  }
}

async function requireCloudAccount() {
  await startBackend();
  if (!cloudAccount?.configured) {
    throw new Error("云端账户服务尚未配置，请联系测试管理员。");
  }
  return cloudAccount;
}

function sanitizeAccountInput(input) {
  return {
    email: String(input?.email || "")
      .trim()
      .slice(0, 254),
    name: String(input?.name || "")
      .trim()
      .slice(0, 40),
    password: String(input?.password || "").slice(0, 128),
    inviteCode: String(input?.inviteCode || "")
      .trim()
      .slice(0, 80),
  };
}

async function selectApiPort() {
  if (apiPortSelected) return;
  if (apiPortSelectionPromise) return apiPortSelectionPromise;
  apiPortSelectionPromise = (async () => {
    for (let offset = 0; offset < 12; offset += 1) {
      const candidate = PREFERRED_API_PORT + offset;
      if (await isPortAvailable(candidate)) {
        apiPort = candidate;
        apiBase = `http://127.0.0.1:${candidate}`;
        apiPortSelected = true;
        return;
      }
    }
    throw new Error(
      `端口 ${PREFERRED_API_PORT}-${PREFERRED_API_PORT + 11} 均被占用。`,
    );
  })();
  try {
    await apiPortSelectionPromise;
  } finally {
    apiPortSelectionPromise = null;
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host: "127.0.0.1", port }, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function connectTunnelWithRetry(maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    stopTunnel();
    sendBackendStatus(
      "starting",
      `正在建立语音识别通道（${attempt}/${maxAttempts}）...`,
    );
    try {
      const publicUrl = await startTunnel();
      await waitForTunnelHealth(publicUrl);
      return publicUrl;
    } catch (error) {
      lastError = error;
      stopTunnel();
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  throw lastError || new Error("语音识别通道建立失败。");
}

async function waitForTunnelHealth(publicUrl, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${publicUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json();
      if (response.ok && payload.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`语音识别通道已创建但尚不可访问：${lastError}`);
}

function stopTunnel() {
  if (tunnelProcess && !tunnelProcess.killed) {
    tunnelProcess.kill();
  }
  tunnelProcess = null;
}

async function finishSmokeTest() {
  const screenshotPath = process.env.DESKTOP_SMOKE_SCREENSHOT;
  if (!screenshotPath || !mainWindow || mainWindow.isDestroyed()) return;
  // CI can finish loading the account before the billing catalog has rendered.
  // Wait for observable readiness instead of assuming a fixed machine speed.
  let rendererState;
  const deadline = Date.now() + 15000;
  do {
    rendererState = await mainWindow.webContents.executeJavaScript(`({
      status: document.getElementById("statusText")?.textContent || "",
      submitDisabled: Boolean(document.getElementById("submitJob")?.disabled),
      localReady: document.body.classList.contains('local-direct-mode') && document.getElementById('analyzeCost')?.textContent === '本机直连'
    })`);
    if (rendererState.status.includes("服务已就绪") && !rendererState.submitDisabled &&
      (process.env.DESKTOP_SMOKE_LOCAL_DIRECT !== "true" || rendererState.localReady)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  if (
    !rendererState.status.includes("服务已就绪") ||
    rendererState.submitDisabled ||
    (process.env.DESKTOP_SMOKE_LOCAL_DIRECT === "true" && !rendererState.localReady)
  ) {
    throw new Error(`桌面界面脚本未就绪：${JSON.stringify(rendererState)}`);
  }
  if (
    String(process.env.DESKTOP_SMOKE_MODEL_PRIVACY || "").toLowerCase() ===
    "true"
  ) {
    const privacyState = await mainWindow.webContents
      .executeJavaScript(`(() => {
      const sample = "DeepSeek deepseek-chat MiniMax-M3 MiniMax Volcano ASR 火山引擎 volc.seedasr.auc";
      renderReportHtml('<style>.raw-css-leak{color:red}</style><section class="report-doc"><p>' + sample + '</p></section>');
      renderRewriteHtml('<section class="rewrite-doc"><p>' + sample + '</p></section>');
      return {
        report: document.getElementById("reportText")?.innerText || "",
        rewrite: document.getElementById("rewriteResult")?.innerText || ""
      };
    })()`);
    const visibleText = `${privacyState.report} ${privacyState.rewrite}`;
    if (/minimax|deepseek|volcano|火山引擎|volc\.seedasr/i.test(visibleText)) {
      throw new Error(`前端仍显示内部模型信息：${visibleText}`);
    }
    if (/raw-css-leak|color\s*:\s*red/i.test(visibleText)) {
      throw new Error(`前端仍显示模型返回的样式代码：${visibleText}`);
    }
  }
  if (
    String(process.env.DESKTOP_SMOKE_DOUYIN_IDENTITY || "").toLowerCase() ===
    "true"
  ) {
    const { douyinSession, edgeIdentity } = configureDouyinSession();
    const activeUserAgent = douyinSession.getUserAgent();
    if (
      activeUserAgent !== edgeIdentity.userAgent ||
      /electron/i.test(activeUserAgent)
    ) {
      throw new Error(`抖音登录会话浏览器标识异常：${activeUserAgent}`);
    }
  }
  if (
    String(process.env.DESKTOP_SMOKE_ACCOUNT || "").toLowerCase() === "true"
  ) {
    await mainWindow.webContents.executeJavaScript(
      `document.getElementById("accountButton")?.click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (
    String(process.env.DESKTOP_SMOKE_REGISTER || "").toLowerCase() === "true"
  ) {
    const registration = {
      email: process.env.DESKTOP_SMOKE_EMAIL || "designer@example.com",
      password: process.env.DESKTOP_SMOKE_PASSWORD || "DirectorPass123!",
      name: process.env.DESKTOP_SMOKE_NAME || "内容创作组",
      inviteCode: process.env.DESKTOP_SMOKE_INVITE_CODE || "",
    };
    await mainWindow.webContents.executeJavaScript(`(() => {
      const input = ${JSON.stringify(registration)};
      document.querySelector('[data-auth-mode="register"]')?.click();
      document.getElementById("loginEmail").value = input.email;
      document.getElementById("loginPassword").value = input.password;
      document.getElementById("loginName").value = input.name;
      document.getElementById("registerInviteCode").value = input.inviteCode;
      document.getElementById("loginAccount").click();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1600));
  }
  if (String(process.env.DESKTOP_SMOKE_CDK || "").toLowerCase() === "true") {
    const cdk = process.env.DESKTOP_SMOKE_CDK_CODE || "";
    await mainWindow.webContents.executeJavaScript(`(() => {
      document.getElementById("cdkCode").value = ${JSON.stringify(cdk)};
      document.getElementById("redeemCdk").click();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const balance = await mainWindow.webContents.executeJavaScript(
      `document.getElementById("drawerBalance")?.textContent`,
    );
    if (balance !== "5") throw new Error(`CDK 兑换后余额错误：${balance}`);
  }
  const smokeTab = String(process.env.DESKTOP_SMOKE_TAB || "").trim();
  if (smokeTab) {
    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('[data-tab="${smokeTab.replace(/[^a-z-]/gi, "")}"]')?.click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (process.env.DESKTOP_SMOKE_LIBRARY_GUIDE === "1") {
    await mainWindow.webContents.executeJavaScript(
      `document.getElementById("openLibraryGuide")?.click()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (process.env.DESKTOP_SMOKE_LOCAL_DIRECT === "true") {
    const localState = await mainWindow.webContents.executeJavaScript(`({
      local: document.body.classList.contains('local-direct-mode'),
      walletHidden: document.getElementById('walletButton').hidden,
      signInHidden: document.getElementById('signedOutView').hidden,
      settings: document.getElementById('accountTitle').textContent,
      cost: document.getElementById('analyzeCost').textContent
    })`);
    if (!localState.local || !localState.walletHidden || !localState.signInHidden || localState.settings !== "本机设置" || localState.cost !== "本机直连") {
      throw new Error(`本地直连界面异常：${JSON.stringify(localState)}`);
    }
    const response = await fetch(`${apiBase}/v1/account`, { headers: { authorization: `Bearer ${localApiToken}` } });
    const result = await response.json();
    if (!response.ok || !result.account?.localDirect) throw new Error("本地账户 API 校验失败。");
    writeStartupLog("local-direct-smoke-passed", "no-cloud-account; billing-disabled; local-token-required");
  }
  if (process.env.DESKTOP_SMOKE_SETTINGS === "true") {
    const { smokeSettings } = await import("./settings-smoke.js");
    await smokeSettings(mainWindow, process.env.DESKTOP_SMOKE_SETTINGS_PHASE || "read");
    writeStartupLog("settings-smoke-passed", "masked-snapshot; complete-fields; search; encrypted-save");
  }
  const image = await mainWindow.webContents.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`Desktop smoke test passed: ${screenshotPath}`);
  app.quit();
}

function createMainWindow() {
  writeStartupLog("window-create");
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: "#eee9df",
    title: "抖音编导拆解台",
    icon: path.join(__dirname, "assets", "app-icon.png"),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    writeStartupLog("window-ready-to-show");
    mainWindow?.show();
  });
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description, validatedUrl) => {
      writeStartupLog(
        "renderer-load-failed",
        `${code} ${description} ${validatedUrl}`,
      );
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeStartupLog("renderer-gone", JSON.stringify(details));
  });
  mainWindow.on("unresponsive", () => writeStartupLog("window-unresponsive"));
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function openDouyinLogin() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  const { edgeIdentity } = configureDouyinSession();
  loginWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    parent: mainWindow,
    title: "登录抖音",
    autoHideMenuBar: true,
    webPreferences: {
      partition: "persist:douyin-director",
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  protectLoginWindowNavigation(loginWindow);
  loginWindow.loadURL("https://www.douyin.com/", {
    userAgent: edgeIdentity.userAgent,
    extraHeaders: "Accept-Language: zh-CN,zh;q=0.9\r\n",
  });
  loginWindow.on("closed", () => {
    loginWindow = null;
    sendBackendStatus("ready", "抖音登录窗口已关闭，可以重新提交分析。");
  });
}

function protectLoginWindowNavigation(window) {
  const blockExternalProtocol = (event, targetUrl) => {
    const navigationUrl =
      typeof targetUrl === "string" && targetUrl
        ? targetUrl
        : event?.url;
    if (isSafeLoginNavigation(navigationUrl)) return;
    event.preventDefault();
    void dialog.showMessageBox(window, {
      type: "info",
      title: "请使用手机抖音扫码",
      message: "这个链接需要调用其他浏览器或客户端，已为你拦截。",
      detail:
        "登录时直接使用手机抖音扫描页面二维码即可，无需点击页面中的“抖音APP”等文字链接。",
      buttons: ["知道了"],
      defaultId: 0,
      noLink: true,
    });
  };

  window.webContents.on("will-navigate", blockExternalProtocol);
  window.webContents.on("will-frame-navigate", blockExternalProtocol);
  window.webContents.on("will-redirect", blockExternalProtocol);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isSafeLoginNavigation(url)) {
      void dialog.showMessageBox(window, {
        type: "info",
        title: "请使用手机抖音扫码",
        message: "已拦截无效的外部应用链接。",
        detail: "直接扫描页面二维码即可完成登录。",
        buttons: ["知道了"],
        defaultId: 0,
        noLink: true,
      });
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

function configureDouyinSession() {
  const douyinSession = session.fromPartition("persist:douyin-director");
  const edgeIdentity = buildEdgeIdentity(process.versions.chrome);
  douyinSession.setUserAgent(edgeIdentity.userAgent, "zh-CN,zh;q=0.9");

  if (!douyinSessionConfigured) {
    douyinSessionConfigured = true;
    douyinSession.webRequest.onBeforeSendHeaders(
      {
        urls: [
          "*://*.douyin.com/*",
          "*://douyin.com/*",
          "*://*.iesdouyin.com/*",
          "*://iesdouyin.com/*",
        ],
      },
      (details, callback) => {
        callback({
          requestHeaders: applyEdgeHeaders(
            details.requestHeaders,
            edgeIdentity,
          ),
        });
      },
    );
  }

  return { douyinSession, edgeIdentity };
}

ipcMain.handle("cookies:get", async (_event, filter) => {
  return session
    .fromPartition("persist:douyin-director")
    .cookies.get(filter || {});
});
ipcMain.handle("douyin:login", () => openDouyinLogin());
ipcMain.handle("backend:get-status", () => backendStatus);
ipcMain.handle("app:show-install-location", () =>
  shell.showItemInFolder(process.execPath),
);
ipcMain.handle("storage:get", async () =>
  getStorageInfo(configureJobsDirectory(), app.getPath("userData")),
);
ipcMain.handle("storage:select", async () => {
  configureJobsDirectory();
  const { hasActiveJobs, forgetFinishedJobs } =
    await import("../server/jobs.js");
  if (hasActiveJobs())
    throw new Error("当前有分析任务正在进行，请等待任务完成后再更改存储位置。");
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: "选择任务存储位置",
    buttonLabel: "使用此位置",
    defaultPath: path.dirname(jobsDir),
    properties: ["openDirectory", "createDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true };

  const target = prepareManagedJobsDir(customJobsDir(selection.filePaths[0]));
  saveJobsDirSetting(app.getPath("userData"), target);
  jobsDir = target;
  process.env.JOBS_DIR = target;
  const { config } = await import("../server/config.js");
  config.jobsDir = target;
  forgetFinishedJobs();
  return {
    canceled: false,
    ...(await getStorageInfo(target, app.getPath("userData"))),
  };
});
ipcMain.handle("storage:open", async () => {
  configureJobsDirectory();
  prepareManagedJobsDir(jobsDir, {
    allowExistingWithoutMarker:
      jobsDir === defaultJobsDir(app.getPath("userData")),
  });
  const error = await shell.openPath(jobsDir);
  if (error) throw new Error(`无法打开任务目录：${error}`);
  return true;
});
ipcMain.handle("storage:clear", async () => {
  configureJobsDirectory();
  const { hasActiveJobs, forgetFinishedJobs } =
    await import("../server/jobs.js");
  if (hasActiveJobs())
    throw new Error("当前有分析任务正在进行，请等待任务完成后再清理缓存。");
  const info = await getStorageInfo(jobsDir, app.getPath("userData"));
  if (info.taskCount === 0 && info.bytes === 0)
    return { cleared: false, empty: true, ...info };
  const answer = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "清理任务缓存",
    message: `确定清理 ${info.taskCount} 个任务的本地缓存吗？`,
    detail: `将删除已下载视频、音频、关键帧和本地报告，共 ${formatBytes(info.bytes)}。\n\n不会删除账户、点数、飞书素材库或产品资料。此操作不可撤销。`,
    buttons: ["取消", "清理缓存"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (answer.response !== 1) return { cleared: false, canceled: true, ...info };
  await clearManagedJobsDir(jobsDir);
  forgetFinishedJobs();
  return {
    cleared: true,
    ...(await getStorageInfo(jobsDir, app.getPath("userData"))),
  };
});
ipcMain.handle("app:open-checkout", async (_event, value) => {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") {
    throw new Error("付款地址必须使用 HTTPS。");
  }
  await shell.openExternal(url.toString());
  return true;
});
ipcMain.handle("backend:get-api-base", async () => {
  await selectApiPort();
  return apiBase;
});
ipcMain.handle("backend:get-access-token", () => localApiToken);
ipcMain.handle("account:session", async () => {
  await startBackend();
  const { config } = await import("../server/config.js");
  if (config.localDirect) {
    const { localDirectAccount } = await import("../server/billing/runtime.js");
    return { configured: true, mode: "local", account: localDirectAccount() };
  }
  return cloudAccount?.getSession() || { configured: false, account: null };
});
ipcMain.handle("account:register", async (_event, input) =>
  (await requireCloudAccount()).register(sanitizeAccountInput(input)),
);
ipcMain.handle("account:login", async (_event, input) =>
  (await requireCloudAccount()).login(sanitizeAccountInput(input)),
);
ipcMain.handle("account:forgot-password", async (_event, email) =>
  (await requireCloudAccount()).forgotPassword(String(email || "").trim()),
);
ipcMain.handle("account:resend-verification", async () =>
  (await requireCloudAccount()).resendEmailVerification(),
);
ipcMain.handle("account:logout", async () =>
  (await requireCloudAccount()).logout(),
);
ipcMain.handle("account:ledger", async (_event, limit) => {
  await startBackend();
  const { config } = await import("../server/config.js");
  if (config.localDirect) return { entries: [] };
  return (await requireCloudAccount()).getLedger(Math.max(1, Math.min(100, Number(limit) || 30)));
});
ipcMain.handle("account:redeem-cdk", async (_event, code) =>
  (await requireCloudAccount()).redeemCdk(String(code || "").trim()),
);
ipcMain.handle("account:change-password", async (_event, input) =>
  (await requireCloudAccount()).changePassword(
    String(input?.currentPassword || ""),
    String(input?.newPassword || ""),
  ),
);
ipcMain.handle("backend:restart", async () => {
  sendBackendStatus("starting", "正在重新连接语音识别通道...");
  try {
    await startBackend();
    return backendStatus;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendBackendStatus("error", message);
    return backendStatus;
  }
});
ipcMain.handle("materials:get-status", async (_event, live = false) => {
  const { getMaterialLibraryStatus } =
    await import("../server/materials/library.js");
  return getMaterialLibraryStatus({ live: Boolean(live) });
});
ipcMain.handle("materials:initialize-user", async (_event, input) => {
  const appId = String(input?.appId || userLibrarySettings?.appId || "").trim();
  const appSecret = String(
    input?.appSecret || userLibrarySettings?.appSecret || "",
  ).trim();
  const baseUrl = String(
    input?.baseUrl || userLibrarySettings?.baseUrl || "",
  ).trim();
  if (!appId || !appSecret || !baseUrl) {
    throw new Error("请完整填写 App ID、App Secret 和 Base 链接。");
  }
  const settings = { appId, appSecret, baseUrl };
  const { initializeFeishuLibrary } =
    await import("../server/materials/feishu.js");
  const initialized = await initializeFeishuLibrary(settings);
  writeEncryptedMaterialSettings(settings);
  userLibrarySettings = settings;
  const { setUserLibraryConfig } =
    await import("../server/materials/runtime.js");
  setUserLibraryConfig(settings);
  return { settings: publicMaterialSettings(settings), initialized };
});
ipcMain.handle("materials:test-user", async (_event, input) => {
  const settings = {
    appId: String(input?.appId || userLibrarySettings?.appId || "").trim(),
    appSecret: String(
      input?.appSecret || userLibrarySettings?.appSecret || "",
    ).trim(),
    baseUrl: String(
      input?.baseUrl || userLibrarySettings?.baseUrl || "",
    ).trim(),
  };
  const { testFeishuLibrary } = await import("../server/materials/feishu.js");
  return testFeishuLibrary(settings);
});
ipcMain.handle("materials:disconnect-user", async () => {
  fs.rmSync(materialSettingsPath(), { force: true });
  userLibrarySettings = null;
  const { clearUserLibraryConfig } =
    await import("../server/materials/runtime.js");
  clearUserLibraryConfig();
  return publicMaterialSettings(null);
});
ipcMain.handle("materials:open-user-base", async () => {
  if (!userLibrarySettings?.baseUrl) throw new Error("尚未连接个人素材库。");
  const target = new URL(userLibrarySettings.baseUrl);
  if (target.protocol !== "https:")
    throw new Error("素材库链接必须使用 HTTPS。");
  await shell.openExternal(target.toString());
  return true;
});
ipcMain.handle("materials:open-guide-link", async (_event, key) => {
  const target = MATERIAL_GUIDE_URLS[String(key || "")];
  if (!target) throw new Error("不支持打开该教程链接。");
  await shell.openExternal(target);
  return true;
});
ipcMain.handle("materials:save-product", async (_event, product) => {
  const { syncProductToUserLibrary } =
    await import("../server/materials/library.js");
  return syncProductToUserLibrary(product || {});
});

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    writeStartupLog("app-ready");
    createMainWindow();
    try {
      await startBackend();
      writeStartupLog("backend-ready", apiBase);
      await finishSmokeTest();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeStartupLog(
        "backend-error",
        error instanceof Error ? error.stack || message : message,
      );
      sendBackendStatus("error", message);
      if (process.env.DESKTOP_SMOKE_SCREENSHOT) {
        process.exitCode = 1;
        app.quit();
      }
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopTunnel();
});

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
