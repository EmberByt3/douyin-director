const API_BASES = ["http://127.0.0.1:8789", "http://localhost:8789"];
let apiBase = API_BASES[0];

const apiBaseReady = Promise.resolve(window.desktopAPI?.getApiBase?.())
  .then((base) => {
    if (!base || API_BASES.includes(base)) return;
    API_BASES.unshift(base);
    apiBase = base;
  })
  .catch(() => {});

const els = {
  videoUrl: document.getElementById("videoUrl"),
  openDouyin: document.getElementById("openDouyin"),
  serviceIndicator: document.getElementById("serviceIndicator"),
  submitJob: document.getElementById("submitJob"),
  refreshJob: document.getElementById("refreshJob"),
  statusText: document.getElementById("statusText"),
  progressBar: document.getElementById("progressBar"),
  progressPercent: document.getElementById("progressPercent"),
  reportText: document.getElementById("reportText"),
  copyReport: document.getElementById("copyReport"),
  retryMaterialSync: document.getElementById("retryMaterialSync"),
  frames: document.getElementById("frames"),
  rewriteCopy: document.getElementById("rewriteCopy"),
  copyRewrite: document.getElementById("copyRewrite"),
  rewriteStatus: document.getElementById("rewriteStatus"),
  rewriteResult: document.getElementById("rewriteResult"),
  productSelect: document.getElementById("productSelect"),
  saveProduct: document.getElementById("saveProduct"),
  deleteProduct: document.getElementById("deleteProduct"),
  productName: document.getElementById("productName"),
  productCategory: document.getElementById("productCategory"),
  productAudience: document.getElementById("productAudience"),
  productOffer: document.getElementById("productOffer"),
  productSellingPoints: document.getElementById("productSellingPoints"),
  productScenes: document.getElementById("productScenes"),
  productMustSay: document.getElementById("productMustSay"),
  productMustAvoid: document.getElementById("productMustAvoid"),
  productTone: document.getElementById("productTone"),
  productDuration: document.getElementById("productDuration"),
  creationTitle: document.getElementById("creationTitle"),
  creationModes: document.getElementById("creationModes"),
  libraryQueryField: document.getElementById("libraryQueryField"),
  libraryQuery: document.getElementById("libraryQuery"),
  librarySourceField: document.getElementById("librarySourceField"),
  librarySources: document.getElementById("librarySources"),
  platformLibraryBadge: document.getElementById("platformLibraryBadge"),
  platformLibraryName: document.getElementById("platformLibraryName"),
  userLibraryBadge: document.getElementById("userLibraryBadge"),
  feishuAppId: document.getElementById("feishuAppId"),
  feishuAppSecret: document.getElementById("feishuAppSecret"),
  feishuBaseUrl: document.getElementById("feishuBaseUrl"),
  libraryStatus: document.getElementById("libraryStatus"),
  refreshLibraries: document.getElementById("refreshLibraries"),
  testUserLibrary: document.getElementById("testUserLibrary"),
  initializeUserLibrary: document.getElementById("initializeUserLibrary"),
  openUserLibrary: document.getElementById("openUserLibrary"),
  disconnectUserLibrary: document.getElementById("disconnectUserLibrary"),
  openLibraryGuide: document.getElementById("openLibraryGuide"),
  libraryGuideOverlay: document.getElementById("libraryGuideOverlay"),
  libraryGuideBackdrop: document.getElementById("libraryGuideBackdrop"),
  closeLibraryGuide: document.getElementById("closeLibraryGuide"),
  copyLibraryPermissions: document.getElementById("copyLibraryPermissions"),
  goToLibraryBinding: document.getElementById("goToLibraryBinding"),
  walletButton: document.getElementById("walletButton"),
  walletBalance: document.getElementById("walletBalance"),
  accountButton: document.getElementById("accountButton"),
  accountName: document.getElementById("accountName"),
  accountOverlay: document.getElementById("accountOverlay"),
  accountBackdrop: document.getElementById("accountBackdrop"),
  closeAccount: document.getElementById("closeAccount"),
  signedOutView: document.getElementById("signedOutView"),
  signedInView: document.getElementById("signedInView"),
  checkoutView: document.getElementById("checkoutView"),
  loginEmail: document.getElementById("loginEmail"),
  loginName: document.getElementById("loginName"),
  loginPassword: document.getElementById("loginPassword"),
  registerNameField: document.getElementById("registerNameField"),
  registerInviteField: document.getElementById("registerInviteField"),
  registerInviteCode: document.getElementById("registerInviteCode"),
  authModes: document.getElementById("authModes"),
  loginAccount: document.getElementById("loginAccount"),
  forgotPassword: document.getElementById("forgotPassword"),
  loginStatus: document.getElementById("loginStatus"),
  drawerBalance: document.getElementById("drawerBalance"),
  drawerIdentity: document.getElementById("drawerIdentity"),
  emailVerificationPanel: document.getElementById("emailVerificationPanel"),
  resendEmailVerification: document.getElementById(
    "resendEmailVerification",
  ),
  emailVerificationStatus: document.getElementById(
    "emailVerificationStatus",
  ),
  billingModeBadge: document.getElementById("billingModeBadge"),
  productList: document.getElementById("productList"),
  ledgerList: document.getElementById("ledgerList"),
  refreshAccount: document.getElementById("refreshAccount"),
  signOutAccount: document.getElementById("signOutAccount"),
  cdkCode: document.getElementById("cdkCode"),
  redeemCdk: document.getElementById("redeemCdk"),
  cdkStatus: document.getElementById("cdkStatus"),
  currentAccountPassword: document.getElementById("currentAccountPassword"),
  newAccountPassword: document.getElementById("newAccountPassword"),
  confirmAccountPassword: document.getElementById("confirmAccountPassword"),
  changeAccountPassword: document.getElementById("changeAccountPassword"),
  accountSecurityStatus: document.getElementById("accountSecurityStatus"),
  backToProducts: document.getElementById("backToProducts"),
  checkoutProductName: document.getElementById("checkoutProductName"),
  checkoutPoints: document.getElementById("checkoutPoints"),
  checkoutPrice: document.getElementById("checkoutPrice"),
  paymentMethods: document.getElementById("paymentMethods"),
  checkoutNotice: document.getElementById("checkoutNotice"),
  paymentQrWrap: document.getElementById("paymentQrWrap"),
  paymentQr: document.getElementById("paymentQr"),
  paymentOrderNo: document.getElementById("paymentOrderNo"),
  confirmPayment: document.getElementById("confirmPayment"),
  checkoutStatus: document.getElementById("checkoutStatus"),
  openInstallLocation: document.getElementById("openInstallLocation"),
  storageType: document.getElementById("storageType"),
  storagePath: document.getElementById("storagePath"),
  storageTaskCount: document.getElementById("storageTaskCount"),
  storageSize: document.getElementById("storageSize"),
  storageStatus: document.getElementById("storageStatus"),
  chooseStorageLocation: document.getElementById("chooseStorageLocation"),
  openStorageLocation: document.getElementById("openStorageLocation"),
  clearStorageCache: document.getElementById("clearStorageCache"),
  analyzeCost: document.getElementById("analyzeCost"),
  rewriteCost: document.getElementById("rewriteCost"),
  libraryScriptCost: document.getElementById("libraryScriptCost"),
  toast: document.getElementById("toast"),
};

const tabButtons = [...document.querySelectorAll("[data-tab]")];
const tabPanels = [...document.querySelectorAll("[data-panel]")];

const ALLOWED_TAGS = new Set([
  "SECTION",
  "HEADER",
  "ARTICLE",
  "DIV",
  "P",
  "SPAN",
  "STRONG",
  "EM",
  "H1",
  "H2",
  "H3",
  "UL",
  "OL",
  "LI",
  "BR",
]);
const DROP_CONTENT_TAGS = new Set([
  "STYLE",
  "SCRIPT",
  "NOSCRIPT",
  "TEMPLATE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "META",
  "LINK",
]);
const ALLOWED_CLASSES = new Set([
  "report-doc",
  "report-hero",
  "report-section",
  "evidence-grid",
  "script-box",
  "timeline",
  "shot-card",
  "badge",
  "template-box",
  "mini-card",
  "label",
  "value",
  "rewrite-doc",
  "rewrite-hero",
  "rewrite-section",
]);

const STORAGE_KEY = "savedProducts";
let currentJobId = "";
let pollTimer = 0;
let backendState = "starting";
let authToken = "";
let currentAccount = null;
let billingCatalog = {
  mode: "cdk",
  products: [],
  costs: { analyze: 1, rewrite: 1, libraryScript: 1 },
};
let selectedCheckoutProduct = null;
let selectedPaymentMethod = "wechat";
let checkoutVisible = false;
let paymentPollTimer = 0;
let currentPaymentOrder = null;
let toastTimer = 0;
let creationMode = "benchmark";
let librarySource = "both";
let currentProductId = "";
let renderedJobId = "";
let announcedMaterialState = "";
let authMode = "login";
const appVersion = document.body.dataset.appVersion || "1.6.10";

init();

function init() {
  chrome.storage.local.get(
    ["lastVideoUrl", "currentJobId", "appVersion"],
    async (value) => {
      els.videoUrl.value = value.lastVideoUrl || "";
      try {
        authToken = await window.desktopAPI.getLocalApiAccessToken();
        const session = await window.desktopAPI.getAccountSession();
        currentAccount = session.account || null;
        if (!session.configured) {
          setLoginStatus("云端账户服务尚未配置，请联系测试管理员。", true);
        }
      } catch (error) {
        currentAccount = null;
        setLoginStatus(cleanDesktopError(error), true);
      }
      const upgraded = value.appVersion !== appVersion;
      currentJobId = value.currentJobId || "";
      chrome.storage.local.set({ appVersion });
      if (currentJobId) {
        void refreshJob();
        startPolling();
      } else if (upgraded) {
        els.reportText.innerHTML =
          '<div class="empty-state">版本已更新，请点击“开始分析”生成新报告。</div>';
      }
      void loadBillingCatalog();
      if (currentAccount) void loadLedger();
      renderAccount();
    },
  );

  loadProductSelect();

  els.submitJob.addEventListener("click", submitJob);
  els.openDouyin?.addEventListener("click", () =>
    window.desktopAPI.openDouyinLogin(),
  );
  els.refreshJob.addEventListener("click", refreshOrReconnect);
  els.copyReport.addEventListener("click", copyReport);
  els.retryMaterialSync?.addEventListener("click", retryCurrentMaterialSync);
  els.rewriteCopy.addEventListener("click", rewriteCopy);
  els.creationModes?.addEventListener("click", selectCreationMode);
  els.librarySources?.addEventListener("change", selectLibrarySource);
  els.copyRewrite.addEventListener("click", copyRewrite);
  els.productSelect.addEventListener("change", onProductSelect);
  els.saveProduct.addEventListener("click", onSaveProduct);
  els.deleteProduct.addEventListener("click", onDeleteProduct);
  els.walletButton.addEventListener("click", openAccountDrawer);
  els.accountButton.addEventListener("click", () => currentAccount?.localDirect ? window.openWorkbenchSettings() : openAccountDrawer());
  els.accountBackdrop.addEventListener("click", closeAccountDrawer);
  els.closeAccount.addEventListener("click", closeAccountDrawer);
  els.loginAccount.addEventListener("click", loginAccount);
  els.authModes.addEventListener("click", selectAuthMode);
  els.forgotPassword.addEventListener("click", forgotPassword);
  els.resendEmailVerification.addEventListener(
    "click",
    resendEmailVerification,
  );
  els.refreshAccount.addEventListener("click", loadAccount);
  els.signOutAccount.addEventListener("click", signOutAccount);
  els.redeemCdk.addEventListener("click", redeemCdk);
  els.changeAccountPassword.addEventListener("click", changeAccountPassword);
  els.backToProducts.addEventListener("click", closeCheckout);
  els.confirmPayment.addEventListener("click", confirmPayment);
  els.paymentMethods.addEventListener("click", selectPaymentMethod);
  els.openInstallLocation.addEventListener("click", () =>
    window.desktopAPI?.showInstallLocation?.(),
  );
  els.chooseStorageLocation?.addEventListener("click", chooseStorageLocation);
  els.openStorageLocation?.addEventListener("click", openStorageLocation);
  els.clearStorageCache?.addEventListener("click", clearStorageCache);
  els.productList.addEventListener("click", purchasePoints);
  els.refreshLibraries?.addEventListener("click", () =>
    loadMaterialLibraries(true),
  );
  els.testUserLibrary?.addEventListener("click", testUserLibrary);
  els.initializeUserLibrary?.addEventListener("click", initializeUserLibrary);
  els.openUserLibrary?.addEventListener("click", openUserLibrary);
  els.disconnectUserLibrary?.addEventListener("click", disconnectUserLibrary);
  els.openLibraryGuide?.addEventListener("click", openLibraryGuide);
  els.libraryGuideBackdrop?.addEventListener("click", closeLibraryGuide);
  els.closeLibraryGuide?.addEventListener("click", closeLibraryGuide);
  els.copyLibraryPermissions?.addEventListener(
    "click",
    copyLibraryPermissions,
  );
  els.goToLibraryBinding?.addEventListener("click", () => {
    closeLibraryGuide();
    window.setTimeout(() => els.feishuAppId?.focus(), 190);
  });
  document
    .querySelectorAll("[data-library-guide-link]")
    .forEach((button) =>
      button.addEventListener("click", openLibraryGuideLink),
    );
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.libraryGuideOverlay?.hidden) closeLibraryGuide();
    else closeAccountDrawer();
  });
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  window.desktopAPI?.onBackendStatus(applyBackendStatus);
  window.desktopAPI?.getBackendStatus().then(applyBackendStatus);
  applyCreationMode();
  void loadMaterialLibraries(false);
  void loadStorageSettings();
}

async function loadStorageSettings() {
  if (!window.desktopAPI?.getStorageSettings) return;
  setStorageBusy(true);
  try {
    renderStorageInfo(await window.desktopAPI.getStorageSettings());
    setStorageStatus("视频、音频、关键帧和本地报告保存在这里。");
  } catch (error) {
    setStorageStatus(desktopErrorMessage(error, "无法读取存储位置。"), true);
  } finally {
    setStorageBusy(false);
  }
}

async function chooseStorageLocation() {
  setStorageBusy(true);
  setStorageStatus("正在选择新的任务存储位置...");
  try {
    const result = await window.desktopAPI.selectStorageLocation();
    if (result?.canceled) {
      setStorageStatus("未更改存储位置。");
      return;
    }
    detachCurrentJob();
    renderStorageInfo(result);
    setStorageStatus("已切换。之后的新任务将保存到此目录。");
    showToast("任务存储位置已更新。");
  } catch (error) {
    setStorageStatus(desktopErrorMessage(error, "更改存储位置失败。"), true);
  } finally {
    setStorageBusy(false);
  }
}

async function openStorageLocation() {
  setStorageBusy(true);
  try {
    await window.desktopAPI.openStorageLocation();
    setStorageStatus("已打开任务目录。");
  } catch (error) {
    setStorageStatus(desktopErrorMessage(error, "无法打开任务目录。"), true);
  } finally {
    setStorageBusy(false);
  }
}

async function clearStorageCache() {
  setStorageBusy(true);
  setStorageStatus("正在检查本地缓存...");
  try {
    const result = await window.desktopAPI.clearStorageCache();
    if (result?.canceled) {
      setStorageStatus("已取消清理。");
      return;
    }
    if (result?.empty) {
      renderStorageInfo(result);
      setStorageStatus("当前没有可清理的任务缓存。");
      return;
    }
    if (result?.cleared) {
      detachCurrentJob();
      renderStorageInfo(result);
      setStorageStatus("缓存已清理，账户、点数和素材库数据均已保留。");
      showToast("本地任务缓存已清理。");
    }
  } catch (error) {
    setStorageStatus(desktopErrorMessage(error, "清理缓存失败。"), true);
  } finally {
    setStorageBusy(false);
  }
}

function renderStorageInfo(info) {
  if (!info) return;
  els.storagePath.textContent = info.path || "--";
  els.storagePath.title = info.path || "";
  els.storageTaskCount.textContent = String(info.taskCount ?? 0);
  els.storageSize.textContent = formatFileSize(info.bytes);
  els.storageType.textContent = info.isCustom ? "自定义位置" : "默认位置";
  els.storageType.classList.toggle("is-custom", Boolean(info.isCustom));
}

function setStorageBusy(busy) {
  [els.chooseStorageLocation, els.openStorageLocation, els.clearStorageCache]
    .filter(Boolean)
    .forEach((button) => {
      button.disabled = busy;
    });
}

function setStorageStatus(message, isError = false) {
  els.storageStatus.textContent = message;
  els.storageStatus.classList.toggle("error", isError);
}

function detachCurrentJob() {
  window.clearInterval(pollTimer);
  currentJobId = "";
  renderedJobId = "";
  chrome.storage.local.set({ currentJobId: "" });
}

function formatFileSize(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function desktopErrorMessage(error, fallback) {
  return (
    String(error?.message || fallback)
      .replace(/^Error invoking remote method '[^']+':\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim() || fallback
  );
}

function applyBackendStatus({ state, message }) {
  backendState = state;
  setStatus(message, state === "error");
  els.submitJob.disabled = state === "starting" || state === "error";
  els.refreshJob.textContent = state === "error" ? "重连服务" : "刷新状态";
  els.refreshJob.disabled = state === "starting";
  els.serviceIndicator?.classList.toggle("is-starting", state === "starting");
  els.serviceIndicator?.classList.toggle("is-ready", state === "ready");
  els.serviceIndicator?.classList.toggle("is-error", state === "error");
}

async function refreshOrReconnect() {
  if (backendState !== "error") {
    await refreshJob();
    return;
  }
  applyBackendStatus({
    state: "starting",
    message: "正在重新连接语音识别通道...",
  });
  try {
    const status = await window.desktopAPI.restartBackend();
    applyBackendStatus(status);
  } catch (error) {
    applyBackendStatus({
      state: "error",
      message: error?.message || "语音识别通道重连失败。",
    });
  }
}

function activateTab(name) {
  tabButtons.forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  tabPanels.forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  if (name === "library") void loadMaterialLibraries(false);
}

async function submitJob() {
  if (!authToken || !currentAccount) {
    openAccountDrawer();
    setStatus("请先登录账户，再开始视频分析。", true);
    return;
  }
  if (currentAccount.emailVerified !== true) {
    openAccountDrawer();
    setStatus("请先完成登录邮箱验证。", true);
    return;
  }

  const rawInput = els.videoUrl.value.trim();
  const url = extractFirstUrl(rawInput);
  if (!url) {
    setStatus(
      "没有识别到 http/https 视频链接，可以直接粘贴抖音整段分享文案。",
      true,
    );
    return;
  }

  els.submitJob.disabled = true;
  setStatus("正在读取抖音登录态并提交任务...");
  setProgress(0);
  els.reportText.innerHTML =
    '<div class="empty-state">正在生成新报告，请稍候...</div>';
  els.copyReport.disabled = true;
  els.frames.innerHTML = "";
  renderedJobId = "";
  announcedMaterialState = "";
  els.retryMaterialSync.hidden = true;

  try {
    const douyinCookie = await getDouyinCookie();
    const response = await apiFetch("/v1/video-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        options: {
          frameRateFps: 5,
          douyinCookie,
        },
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw apiResponseError(response, payload.error || "任务提交失败。");
    }

    currentJobId = payload.id;
    chrome.storage.local.set({ lastVideoUrl: rawInput, currentJobId });
    renderJob(payload);
    await loadAccount({ quiet: true });
    startPolling();
  } catch (error) {
    setStatus(error.message || "任务提交失败。", true);
    if (error.statusCode === 402) openAccountDrawer();
  } finally {
    els.submitJob.disabled = false;
  }
}

function extractFirstUrl(value) {
  const text = String(value || "").trim();
  const match = text.match(/https?:\/\/[^\s，。?"<>]+/i);
  return match ? match[0].replace(/[),，。；;]+$/g, "") : "";
}

async function apiFetch(path, options = {}) {
  await apiBaseReady;
  let lastError;
  const headers = { ...(options.headers || {}) };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const requestOptions = { ...options, headers };
  for (const base of API_BASES) {
    try {
      const response = await fetch(`${base}${path}`, requestOptions);
      apiBase = base;
      if (response.status === 401 && path !== "/v1/auth/login") {
        clearSession();
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  const detail =
    lastError instanceof Error && lastError.message
      ? `（${lastError.message}）`
      : "";
  throw new Error(
    `无法连接本地分析服务。请先双击 start-service.bat 并保持窗口开启，再点击“刷新状态”。${detail}`,
  );
}

async function getDouyinCookie() {
  if (!chrome.cookies?.getAll) {
    return "";
  }

  const cookieLists = await Promise.all([
    getCookies({ url: "https://www.douyin.com/" }),
    getCookies({ url: "https://www.iesdouyin.com/" }),
    getCookies({ domain: "douyin.com" }),
    getCookies({ domain: "iesdouyin.com" }),
  ]);
  const byName = new Map();
  for (const cookie of cookieLists.flat()) {
    if (cookie?.name && typeof cookie.value === "string") {
      byName.set(cookie.name, cookie.value);
    }
  }

  return [...byName.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function getCookies(query) {
  return new Promise((resolve) => {
    chrome.cookies.getAll(query, (cookies) => {
      resolve(Array.isArray(cookies) ? cookies : []);
    });
  });
}

async function refreshJob() {
  if (!currentJobId) {
    setStatus("暂无任务。");
    return;
  }

  try {
    const response = await apiFetch(
      `/v1/video-jobs/${encodeURIComponent(currentJobId)}`,
    );
    const payload = await response.json();
    if (!response.ok) {
      throw apiResponseError(response, payload.error || "状态查询失败。");
    }
    renderJob(payload);
  } catch (error) {
    setStatus(error.message || "状态查询失败。", true);
  }
}

function startPolling() {
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    await refreshJob();
  }, 1600);
}

function renderJob(job) {
  setProgress(job.progress || 0);
  if (job.status === "failed") {
    const message = friendlyError(job.error || "未知错误");
    setStatus(`失败：${message}`, true);
    renderReportError(message);
    window.clearInterval(pollTimer);
    void loadAccount({ quiet: true });
    return;
  }

  setStatus(`${formatStatus(job.status)} · ${job.progress || 0}%`);
  if (job.result && renderedJobId !== job.id) {
    renderResult(job.result, { activate: true, announceSync: false });
    renderedJobId = job.id;
  }
  if (job.status === "done") {
    window.clearInterval(pollTimer);
    renderResult(job.result, {
      activate: renderedJobId !== job.id,
      announceSync: true,
    });
    renderedJobId = job.id;
    void loadAccount({ quiet: true });
  }
}

function friendlyError(message) {
  const text = anonymizeServiceNames(message);
  if (/ArgusSecurityPlugin|status\s*[=:]\s*403/i.test(text)) {
    return "抖音暂未接受视频请求。请稍后重试；这不一定是登录失效。失败详情已记录到任务目录。";
  }
  if (
    text.includes(
      "jiji262/douyin-downloader finished but no media file was found",
    ) ||
    text.includes("Success Rate 0.0%") ||
    text.includes("Cookies may be invalid or incomplete") ||
    text.includes("Failed to get video detail") ||
    text.includes("Success 0") ||
    text.includes("Failed 1")
  ) {
    return "抖音没有返回可下载的视频文件。请确认这条作品可以正常播放后重试；若作品页提示登录或验证，请在“登录抖音”窗口完成。";
  }
  if (text.includes("Unsupported URL type: https://www.douyin.com")) {
    return "这条短链被抖音重定向到了首页，不是作品页。请重新复制一条新的分享链接。";
  }
  return text;
}

function renderResult(result, { activate = true, announceSync = true } = {}) {
  if (!result) {
    return;
  }

  const html =
    result.analysis?.html ||
    markdownToBasicHtml(result.analysis?.markdown || "");
  if (html.trim()) {
    renderReportHtml(html);
  } else {
    renderReportError("报告服务没有返回有效内容，本次任务应自动退回次数，请稍后重试。");
  }
  renderFrameStacks(result.frames || [], result.frameRateFps || 5);
  els.retryMaterialSync.hidden = !(
    result.materialSync?.configured && result.materialSync?.state === "failed"
  );
  if (
    announceSync &&
    result.materialSync?.configured &&
    announcedMaterialState !== result.materialSync.state
  ) {
    announcedMaterialState = result.materialSync.state || "unknown";
    if (result.materialSync.state === "exists") {
      showToast("该素材已在我的素材库中，本次未重复入库。");
    } else if (result.materialSync.state === "upgraded") {
      showToast(
        `旧素材已升级：${result.materialSync.segmentCount || 0} 个内容片段，${result.materialSync.shotCount || 0} 个镜头`,
      );
    } else if (result.materialSync.synced) {
      showToast(
        `新素材已拆分入库：${result.materialSync.segmentCount || 0} 个内容片段，${result.materialSync.shotCount || 0} 个镜头`,
      );
    } else if (
      result.materialSync.state === "failed" &&
      result.materialSync.message
    ) {
      showToast(
        `报告已完成，素材入库失败：${result.materialSync.message}`,
        true,
      );
    }
  }
  if (activate) activateTab("report");
}

async function retryCurrentMaterialSync() {
  if (!currentJobId) {
    setStatus("当前没有可重新入库的任务。", true);
    return;
  }
  els.retryMaterialSync.disabled = true;
  setStatus("正在复用现有分析结果，分阶段重新写入素材库...");
  announcedMaterialState = "syncing";
  try {
    const response = await apiFetch(
      `/v1/video-jobs/${encodeURIComponent(currentJobId)}/sync-material`,
      {
        method: "POST",
      },
    );
    const payload = await response.json();
    if (!response.ok)
      throw apiResponseError(response, payload.error || "重新入库失败。");
    renderJob(payload);
    if (payload.result?.materialSync?.state === "failed") {
      setStatus(
        `素材重新入库失败：${payload.result.materialSync.message || "未知错误"}`,
        true,
      );
    } else {
      setStatus("报告和素材库均已完成 · 100%");
    }
  } catch (error) {
    setStatus(error.message || "重新入库失败。", true);
  } finally {
    els.retryMaterialSync.disabled = false;
  }
}

function renderFrameStacks(frames, frameRateFps) {
  els.frames.innerHTML = "";
  const groups = groupFramesBySecond(frames, frameRateFps);
  if (!groups.length) {
    els.frames.innerHTML =
      '<div class="empty-state"><strong>暂无关键帧</strong><span>当前任务没有可展示的画面证据。</span></div>';
    return;
  }
  for (const group of groups) {
    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "frame-stack";
    link.title = `第 ${group.second + 1} 秒，共 ${group.frames.length} 帧；滚动鼠标滚轮切换`;

    const viewport = document.createElement("span");
    viewport.className = "frame-stack-viewport";
    const images = group.frames.map((frame, index) => {
      const image = document.createElement("img");
      image.src = `${apiBase}${frame.publicPath}`;
      image.alt = `${Number(frame.capturedAtSec || 0).toFixed(1)} 秒画面`;
      image.loading = "lazy";
      image.decoding = "async";
      image.className = "frame-stack-image";
      image.dataset.frameIndex = String(index);
      viewport.append(image);
      return image;
    });

    const dots = document.createElement("span");
    dots.className = "frame-dots";
    dots.setAttribute("aria-hidden", "true");
    const dotItems = group.frames.map(() => {
      const dot = document.createElement("i");
      dots.append(dot);
      return dot;
    });

    const meta = document.createElement("span");
    meta.className = "frame-meta";
    const count = document.createElement("span");
    count.className = "frame-count";

    let activeIndex = 0;
    let lastWheelAt = 0;
    const activateFrame = (nextIndex) => {
      activeIndex = (nextIndex + group.frames.length) % group.frames.length;
      images.forEach((image, index) => {
        image.classList.toggle("is-active", index === activeIndex);
      });
      dotItems.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === activeIndex);
      });
      const frame = group.frames[activeIndex];
      const time = Number(frame.capturedAtSec || 0).toFixed(1);
      link.href = `${apiBase}${frame.publicPath}`;
      link.setAttribute(
        "aria-label",
        `${time} 秒画面，第 ${activeIndex + 1} 帧，共 ${group.frames.length} 帧`,
      );
      meta.textContent = `${time}s`;
      count.textContent = `${activeIndex + 1}/${group.frames.length}`;
    };
    activateFrame(0);

    link.addEventListener("wheel", (event) => {
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheelAt < 90) return;
      lastWheelAt = now;
      activateFrame(activeIndex + (event.deltaY >= 0 ? 1 : -1));
    }, { passive: false });
    link.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      activateFrame(activeIndex + step);
    });

    link.append(viewport, dots, count, meta);
    els.frames.append(link);
  }
}

function groupFramesBySecond(frames, frameRateFps) {
  const fps = Math.max(1, Number(frameRateFps) || 5);
  const bySecond = new Map();
  frames.forEach((frame, index) => {
    const second = Number.isFinite(Number(frame.secondIndex))
      ? Number(frame.secondIndex)
      : Math.floor(index / fps);
    if (!bySecond.has(second)) {
      bySecond.set(second, []);
    }
    bySecond.get(second).push(frame);
  });

  return [...bySecond.entries()]
    .sort(([a], [b]) => a - b)
    .map(([second, items]) => ({
      second,
      frames: items.sort((a, b) => {
        const frameOrder = Number(a.frameInSecond) - Number(b.frameInSecond);
        if (Number.isFinite(frameOrder) && frameOrder !== 0) return frameOrder;
        return Number(a.capturedAtSec || 0) - Number(b.capturedAtSec || 0);
      }),
    }));
}

function renderReportHtml(html) {
  els.reportText.classList.remove("empty");
  els.reportText.innerHTML = "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<div>${anonymizeServiceNames(html)}</div>`,
    "text/html",
  );
  const wrapper = doc.body.firstElementChild;
  const reportRoot = wrapper?.querySelector(".report-doc");
  const renderRoot = reportRoot || wrapper;
  sanitizeNode(renderRoot);
  if (reportRoot) els.reportText.append(reportRoot);
  else if (wrapper) els.reportText.append(...wrapper.childNodes);
  els.copyReport.disabled = !(els.reportText.innerText || "").trim();
}

function renderReportError(message) {
  els.reportText.classList.add("empty");
  els.reportText.innerHTML = `<div class="empty-state"><strong>报告生成失败</strong><span>${escapeHtml(message)}</span></div>`;
  els.copyReport.disabled = true;
}

function sanitizeNode(node) {
  for (const child of [...node.children]) {
    if (DROP_CONTENT_TAGS.has(child.tagName)) {
      child.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(child.tagName)) {
      child.replaceWith(document.createTextNode(child.textContent || ""));
      continue;
    }

    for (const attr of [...child.attributes]) {
      if (attr.name !== "class") {
        child.removeAttribute(attr.name);
      }
    }

    const classes = [...child.classList].filter((name) =>
      ALLOWED_CLASSES.has(name),
    );
    child.removeAttribute("class");
    if (classes.length) {
      child.className = classes.join(" ");
    }
    sanitizeNode(child);
  }

  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      child.textContent = anonymizeServiceNames(child.textContent);
    }
  }
}

function markdownToBasicHtml(markdown) {
  return String(markdown || "")
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function copyReport() {
  const text = els.reportText.innerText || "";
  if (!text || text === "暂无结果") {
    setStatus("暂无可复制报告。", true);
    return;
  }
  await navigator.clipboard.writeText(text);
  setStatus("报告已复制。");
}

async function rewriteCopy() {
  if (!authToken || !currentAccount) {
    openAccountDrawer();
    setRewriteStatus("请先登录账户。", true);
    return;
  }
  if (currentAccount.emailVerified !== true) {
    openAccountDrawer();
    setRewriteStatus("请先完成登录邮箱验证。", true);
    return;
  }
  if (creationMode === "benchmark" && !currentJobId) {
    setRewriteStatus("请先完成一条视频分析。", true);
    return;
  }

  const product = collectProduct();
  if (!product.name && !product.sellingPoints) {
    setRewriteStatus("至少填写产品名或核心卖点。", true);
    return;
  }

  els.rewriteCopy.disabled = true;
  setRewriteStatus(
    creationMode === "benchmark"
      ? "正在基于原片结构生成自家产品脚本..."
      : "正在从双素材库匹配片段并生成拍摄脚本...",
  );

  try {
    const endpoint =
      creationMode === "benchmark"
        ? `/v1/video-jobs/${encodeURIComponent(currentJobId)}/rewrite`
        : "/v1/library-scripts";
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product,
        query: els.libraryQuery?.value.trim() || "",
        source: librarySource,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw apiResponseError(response, payload.error || "仿写生成失败。");
    }

    renderRewriteHtml(payload.rewrite?.html || "<p>没有生成仿写。</p>");
    setRewriteStatus(
      creationMode === "benchmark"
        ? "仿写已生成。"
        : "素材库脚本已生成，并保留素材ID依据。",
    );
    if (payload.account) applyAccount(payload.account);
    else await loadAccount({ quiet: true });
    activateTab("rewrite");
  } catch (error) {
    const message = error.message || "仿写生成失败。";
    setRewriteStatus(
      /等待超时|生成超时/.test(message)
        ? "云端生成超时，本次次数已退还，请稍后重新生成。"
        : message,
      true,
    );
    await loadAccount({ quiet: true }).catch(() => {});
    if (error.statusCode === 402) openAccountDrawer();
  } finally {
    els.rewriteCopy.disabled = false;
  }
}

// ── 账户与点数 ──

function openAccountDrawer() {
  els.accountOverlay.hidden = false;
  requestAnimationFrame(() => els.accountOverlay.classList.add("is-open"));
}

function closeAccountDrawer() {
  els.accountOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    if (!els.accountOverlay.classList.contains("is-open")) {
      els.accountOverlay.hidden = true;
    }
  }, 180);
}

async function loadBillingCatalog() {
  try {
    const response = await apiFetch("/v1/billing/products");
    const payload = await response.json();
    if (!response.ok)
      throw apiResponseError(response, payload.error || "无法读取点数规则。");
    billingCatalog = payload;
    els.analyzeCost.textContent = payload.mode === "local" ? "本机直连" : `${payload.costs.analyze} 次 / 任务`;
    els.rewriteCost.textContent = payload.mode === "local" ? "本机直连" : `${payload.costs.rewrite} 次 / 任务`;
    els.libraryScriptCost.textContent = payload.mode === "local" ? "本机直连" : `${payload.costs.libraryScript || 1} 次 / 任务`;
    applyCreationMode();
    renderAccount();
  } catch (error) {
    showToast(error.message || "点数规则加载失败。", true);
  }
}

function selectCreationMode(event) {
  const button = event.target.closest("[data-creation-mode]");
  if (!button) return;
  creationMode =
    button.dataset.creationMode === "library" ? "library" : "benchmark";
  applyCreationMode();
}

function selectLibrarySource(event) {
  const input = event.target.closest('input[name="librarySource"]');
  if (!input) return;
  librarySource = ["platform", "user"].includes(input.value)
    ? input.value
    : "both";
  applyCreationMode();
}

function applyCreationMode() {
  for (const button of els.creationModes?.querySelectorAll(
    "[data-creation-mode]",
  ) || []) {
    button.classList.toggle(
      "is-active",
      button.dataset.creationMode === creationMode,
    );
  }
  const libraryMode = creationMode === "library";
  els.creationTitle.textContent = libraryMode
    ? "从素材库生成拍摄脚本"
    : "基于对标视频仿写";
  els.rewriteCopy.textContent = libraryMode
    ? `生成脚本 · ${billingCatalog.costs.libraryScript || 1}次`
    : `生成仿写 · ${billingCatalog.costs.rewrite || 1}次`;
  if (currentAccount?.localDirect) els.rewriteCopy.textContent = libraryMode ? "生成脚本" : "生成仿写";
  els.libraryQueryField.hidden = !libraryMode;
  els.librarySourceField.hidden = !libraryMode;
  const sourceLabel =
    librarySource === "platform"
      ? "平台素材库"
      : librarySource === "user"
        ? "我的飞书素材库"
        : "平台素材库和我的飞书素材库";
  setRewriteStatus(
    libraryMode
      ? `填写产品信息后，将检索${sourceLabel}。`
      : "先完成一条视频分析，再按原片结构生成产品仿写。",
  );
}

async function loadMaterialLibraries(live = false) {
  if (!window.desktopAPI?.getMaterialLibraryStatus) return;
  setLibraryStatus(live ? "正在检查两个素材库..." : "正在读取素材库配置...");
  try {
    const status = await window.desktopAPI.getMaterialLibraryStatus(live);
    renderMaterialLibraryStatus(status);
  } catch (error) {
    setLibraryStatus(error?.message || "素材库状态读取失败。", true);
  }
}

function renderMaterialLibraryStatus(status) {
  const platform = status?.platform || {};
  const user = status?.user || {};
  setConnectionBadge(
    els.platformLibraryBadge,
    platform.available,
    platform.configured ? "已连接" : "待发布",
  );
  els.platformLibraryName.textContent = platform.label || "平台基础素材库";
  setConnectionBadge(
    els.userLibraryBadge,
    user.available,
    user.configured ? "需检查" : "未连接",
  );
  els.feishuAppId.value = user.appId || "";
  els.feishuBaseUrl.value = user.baseUrl || "";
  els.feishuAppSecret.value = "";
  els.feishuAppSecret.placeholder = user.secretConfigured
    ? "已安全保存，留空则沿用"
    : "首次连接时填写";
  els.openUserLibrary.disabled = !user.configured;
  els.disconnectUserLibrary.disabled = !user.configured;
  if (user.error) setLibraryStatus(user.error, true);
  else if (user.available)
    setLibraryStatus(
      "个人素材库可用。新视频会同步写入编导宽表、语义片段和逐镜头执行数据。",
    );
  else if (user.configured)
    setLibraryStatus("已保存配置，请测试连接或修复素材表。");
  else
    setLibraryStatus(
      "填写自己的飞书应用和空白 Base，程序将创建五张表，并配置 40+ 个编导拆解字段。",
    );
}

function setConnectionBadge(element, available, text) {
  element.textContent = text;
  element.classList.toggle("is-connected", Boolean(available));
  element.classList.toggle("is-warning", !available);
}

function collectLibrarySettings() {
  return {
    appId: els.feishuAppId.value.trim(),
    appSecret: els.feishuAppSecret.value.trim(),
    baseUrl: els.feishuBaseUrl.value.trim(),
  };
}

async function testUserLibrary() {
  els.testUserLibrary.disabled = true;
  setLibraryStatus("正在验证飞书应用与 Base 权限...");
  try {
    const result = await window.desktopAPI.testUserLibrary(
      collectLibrarySettings(),
    );
    setLibraryStatus(`连接成功：${result.name || "飞书素材库"}`);
    setConnectionBadge(els.userLibraryBadge, true, "可连接");
  } catch (error) {
    setLibraryStatus(error?.message || "连接测试失败。", true);
  } finally {
    els.testUserLibrary.disabled = false;
  }
}

async function initializeUserLibrary() {
  els.initializeUserLibrary.disabled = true;
  setLibraryStatus("正在升级五张素材表和编导字段，请稍候...");
  try {
    const result = await window.desktopAPI.initializeUserLibrary(
      collectLibrarySettings(),
    );
    const created = result.initialized?.created?.length || 0;
    const repaired = result.initialized?.repaired?.length || 0;
    setLibraryStatus(
      `初始化完成：新建 ${created} 张表，补齐 ${repaired} 组字段；已启用编导宽表、语义片段和逐镜头拆分。`,
    );
    showToast("我的飞书素材库已连接。");
    await loadMaterialLibraries(true);
  } catch (error) {
    setLibraryStatus(error?.message || "素材库初始化失败。", true);
  } finally {
    els.initializeUserLibrary.disabled = false;
  }
}

async function openUserLibrary() {
  try {
    await window.desktopAPI.openUserLibrary();
  } catch (error) {
    setLibraryStatus(error?.message || "无法打开素材库。", true);
  }
}

async function disconnectUserLibrary() {
  try {
    await window.desktopAPI.disconnectUserLibrary();
    els.feishuAppId.value = "";
    els.feishuAppSecret.value = "";
    els.feishuBaseUrl.value = "";
    showToast("已断开个人素材库，本地凭据已清除。");
    await loadMaterialLibraries(false);
  } catch (error) {
    setLibraryStatus(error?.message || "断开失败。", true);
  }
}

function setLibraryStatus(text, isError = false) {
  els.libraryStatus.textContent = text;
  els.libraryStatus.classList.toggle("error", isError);
}

function openLibraryGuide() {
  if (!els.libraryGuideOverlay) return;
  els.libraryGuideOverlay.hidden = false;
  document.body.classList.add("has-modal-open");
  requestAnimationFrame(() => {
    els.libraryGuideOverlay.classList.add("is-open");
    els.closeLibraryGuide?.focus();
  });
}

function closeLibraryGuide() {
  if (!els.libraryGuideOverlay || els.libraryGuideOverlay.hidden) return;
  els.libraryGuideOverlay.classList.remove("is-open");
  document.body.classList.remove("has-modal-open");
  window.setTimeout(() => {
    if (!els.libraryGuideOverlay.classList.contains("is-open")) {
      els.libraryGuideOverlay.hidden = true;
      els.openLibraryGuide?.focus();
    }
  }, 200);
}

async function copyLibraryPermissions() {
  const permissionText = [
    "飞书素材库权限清单",
    "必选：查看、评论、编辑和管理多维表格（bitable:app）",
    "按需：查看知识空间节点信息（wiki:node:read，仅使用 /wiki/ 链接时需要）",
    "文档授权：在目标 Base 中添加该应用为文档应用，并授予可管理权限",
  ].join("\n");
  try {
    await navigator.clipboard.writeText(permissionText);
    showToast("飞书权限清单已复制。");
  } catch {
    showToast("无法复制，请手动记录权限名称。", true);
  }
}

async function openLibraryGuideLink(event) {
  const key = event.currentTarget?.dataset?.libraryGuideLink;
  if (!key || !window.desktopAPI?.openMaterialGuideLink) return;
  event.currentTarget.disabled = true;
  try {
    await window.desktopAPI.openMaterialGuideLink(key);
  } catch (error) {
    showToast(cleanDesktopError(error), true);
  } finally {
    event.currentTarget.disabled = false;
  }
}

function selectAuthMode(event) {
  const button = event.target.closest("[data-auth-mode]");
  if (!button) return;
  authMode = button.dataset.authMode === "register" ? "register" : "login";
  for (const item of els.authModes.querySelectorAll("[data-auth-mode]")) {
    item.classList.toggle("is-active", item.dataset.authMode === authMode);
  }
  const registering = authMode === "register";
  els.registerNameField.hidden = !registering;
  els.registerInviteField.hidden = !registering;
  els.loginPassword.autocomplete = registering
    ? "new-password"
    : "current-password";
  els.loginAccount.textContent = registering ? "使用邀请码注册" : "安全登录";
  els.forgotPassword.hidden = registering;
  setLoginStatus(
    registering
      ? "每个邀请码默认仅可注册一个测试账户。"
      : "使用邮箱和密码登录。 ",
  );
}

async function forgotPassword() {
  const email = els.loginEmail.value.trim();
  if (!email) {
    setLoginStatus("请先填写需要找回密码的邮箱。", true);
    return;
  }
  els.forgotPassword.disabled = true;
  try {
    await window.desktopAPI.forgotAccountPassword(email);
    setLoginStatus("如果该邮箱已注册，密码重置邮件将在几分钟内送达。");
  } catch (error) {
    setLoginStatus(cleanDesktopError(error), true);
  } finally {
    els.forgotPassword.disabled = false;
  }
}

async function resendEmailVerification() {
  els.resendEmailVerification.disabled = true;
  els.emailVerificationStatus.classList.remove("error");
  els.emailVerificationStatus.textContent = "正在发送验证邮件...";
  try {
    const result = await window.desktopAPI.resendAccountVerification();
    if (result.alreadyVerified) {
      await loadAccount({ quiet: true });
      showToast("邮箱已经验证。 ");
      return;
    }
    els.emailVerificationStatus.textContent =
      "验证邮件已发送，请检查收件箱和垃圾邮件目录。";
  } catch (error) {
    els.emailVerificationStatus.textContent = cleanDesktopError(error);
    els.emailVerificationStatus.classList.add("error");
  } finally {
    els.resendEmailVerification.disabled = false;
  }
}

async function redeemCdk() {
  const code = els.cdkCode.value.trim();
  if (!code) {
    setCdkStatus("请输入 CDK。", true);
    return;
  }
  els.redeemCdk.disabled = true;
  setCdkStatus("正在兑换...");
  try {
    const result = await window.desktopAPI.redeemCdk(code);
    els.cdkCode.value = "";
    await loadAccount({ quiet: true });
    setCdkStatus(
      `兑换成功，到账 ${result.credits} 次，当前剩余 ${result.balance} 次。`,
    );
  } catch (error) {
    setCdkStatus(cleanDesktopError(error), true);
  } finally {
    els.redeemCdk.disabled = false;
  }
}

async function changeAccountPassword() {
  const currentPassword = els.currentAccountPassword.value;
  const newPassword = els.newAccountPassword.value;
  if (!currentPassword || !newPassword) {
    setAccountSecurityStatus("请填写当前密码和新密码。", true);
    return;
  }
  if (newPassword !== els.confirmAccountPassword.value) {
    setAccountSecurityStatus("两次输入的新密码不一致。", true);
    return;
  }
  els.changeAccountPassword.disabled = true;
  try {
    await window.desktopAPI.changeAccountPassword({
      currentPassword,
      newPassword,
    });
    els.currentAccountPassword.value = "";
    els.newAccountPassword.value = "";
    els.confirmAccountPassword.value = "";
    currentAccount = null;
    renderAccount();
    setLoginStatus("密码修改成功，请使用新密码重新登录。");
    showToast("密码已修改，其他登录会话已全部退出。");
  } catch (error) {
    setAccountSecurityStatus(cleanDesktopError(error), true);
  } finally {
    els.changeAccountPassword.disabled = false;
  }
}

async function loginAccount() {
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;
  const name = els.loginName.value.trim();
  const inviteCode = els.registerInviteCode.value.trim();
  if (!email || !password) {
    setLoginStatus("请输入邮箱和密码。", true);
    return;
  }
  if (authMode === "register" && (!name || !inviteCode)) {
    setLoginStatus("注册需要填写称呼和邀请码。", true);
    return;
  }

  els.loginAccount.disabled = true;
  setLoginStatus(
    authMode === "register" ? "正在创建云端账户..." : "正在安全登录...",
  );
  try {
    const payload =
      authMode === "register"
        ? await window.desktopAPI.registerAccount({
            email,
            name,
            password,
            inviteCode,
          })
        : await window.desktopAPI.loginAccount({ email, password });
    applyAccount(payload.account);
    els.loginPassword.value = "";
    els.registerInviteCode.value = "";
    await loadLedger();
    setLoginStatus(
      authMode === "register"
        ? payload.verificationEmailSent
          ? "注册成功，验证邮件已发送。"
          : "注册成功，请在账户面板重新发送验证邮件。"
        : "登录成功。",
    );
    showToast(`欢迎回来，${payload.account.name}`);
  } catch (error) {
    setLoginStatus(cleanDesktopError(error), true);
  } finally {
    els.loginAccount.disabled = false;
  }
}

async function loadAccount({ quiet = false } = {}) {
  try {
    const payload = await window.desktopAPI.getAccountSession();
    applyAccount(payload.account || null);
    if (payload.account) await loadLedger();
  } catch (error) {
    currentAccount = null;
    if (!quiet) showToast(cleanDesktopError(error), true);
    renderAccount();
  }
}

async function loadLedger() {
  if (!currentAccount || currentAccount.localDirect) return;
  try {
    const payload = await window.desktopAPI.getAccountLedger(16);
    renderLedger(payload.entries || []);
  } catch (error) {
    els.ledgerList.innerHTML = `<p class="drawer-empty">${escapeHtml(cleanDesktopError(error))}</p>`;
  }
}

function applyAccount(account) {
  currentAccount = account;
  renderAccount();
}

function renderAccount() {
  const localDirect = currentAccount?.localDirect === true;
  document.body.classList.toggle("local-direct-mode", localDirect);
  els.walletButton.hidden = localDirect;
  document.getElementById("localDirectView").hidden = !localDirect;
  document.getElementById("accountTitle").textContent = localDirect ? "本机设置" : "账户与测试次数";
  if (localDirect) {
    els.accountName.textContent = "本地直连 · 设置";
    els.signedOutView.hidden = true;
    els.signedInView.hidden = true;
    els.checkoutView.hidden = true;
    return;
  }
  const signedIn = Boolean(currentAccount);
  els.signedOutView.hidden = signedIn;
  els.signedInView.hidden = !signedIn || checkoutVisible;
  els.checkoutView.hidden = !signedIn || !checkoutVisible;
  els.walletBalance.textContent = signedIn
    ? String(currentAccount.balance)
    : "--";
  els.accountName.textContent = signedIn
    ? compactName(currentAccount.name)
    : "登录";
  if (!signedIn) return;

  els.drawerBalance.textContent = String(currentAccount.balance);
  els.drawerIdentity.textContent = `${currentAccount.name} · ${currentAccount.email}`;
  const emailVerified = currentAccount.emailVerified === true;
  els.emailVerificationPanel.hidden = emailVerified;
  els.cdkCode.disabled = !emailVerified;
  els.redeemCdk.disabled = !emailVerified;
  if (!emailVerified)
    setCdkStatus("完成邮箱验证后即可兑换 CDK。", false);
  const checkoutAvailable = billingCatalog.checkoutAvailable === true;
  els.billingModeBadge.textContent = "微信支付";
  els.billingModeBadge.parentElement.hidden = !checkoutAvailable;
  els.productList.hidden = !checkoutAvailable;
  renderProducts();
}

function renderProducts() {
  els.productList.innerHTML = "";
  for (const product of billingCatalog.products || []) {
    const row = document.createElement("div");
    row.className = `point-product${product.recommended ? " is-recommended" : ""}`;

    const copy = document.createElement("div");
    copy.className = "point-product-copy";
    const name = document.createElement("strong");
    name.textContent = product.name;
    const meta = document.createElement("span");
    meta.textContent = `${product.points} 点 · ¥${(product.priceCents / 100).toFixed(1)}`;
    copy.append(name, meta);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-small button-secondary";
    button.dataset.productId = product.id;
    button.textContent = "购买";
    button.disabled = !authToken;
    row.append(copy, button);
    els.productList.append(row);
  }
}

function purchasePoints(event) {
  const button = event.target.closest("[data-product-id]");
  if (!button || !authToken) return;
  const product = (billingCatalog.products || []).find(
    (item) => item.id === button.dataset.productId,
  );
  if (!product) {
    showToast("套餐信息不存在。", true);
    return;
  }
  selectedCheckoutProduct = product;
  selectedPaymentMethod = "wechat";
  checkoutVisible = true;
  currentPaymentOrder = null;
  stopPaymentPolling();
  els.checkoutProductName.textContent = product.name;
  els.checkoutPoints.textContent = `${product.points} 点`;
  els.checkoutPrice.textContent = `¥${(product.priceCents / 100).toFixed(1)}`;
  els.checkoutNotice.textContent =
    "订单金额由云端锁定。付款完成后点数会自动到账，请勿重复支付。";
  els.paymentQrWrap.hidden = true;
  els.paymentQr.removeAttribute("src");
  els.paymentOrderNo.textContent = "";
  els.confirmPayment.hidden = false;
  els.confirmPayment.textContent = "生成付款码";
  els.checkoutStatus.textContent = "";
  updatePaymentMethodButtons();
  renderAccount();
}

function closeCheckout() {
  checkoutVisible = false;
  selectedCheckoutProduct = null;
  currentPaymentOrder = null;
  stopPaymentPolling();
  renderAccount();
}

function selectPaymentMethod(event) {
  const button = event.target.closest("[data-payment-method]");
  if (!button) return;
  selectedPaymentMethod = button.dataset.paymentMethod;
  updatePaymentMethodButtons();
}

function updatePaymentMethodButtons() {
  for (const button of els.paymentMethods.querySelectorAll(
    "[data-payment-method]",
  )) {
    button.classList.toggle(
      "is-active",
      button.dataset.paymentMethod === selectedPaymentMethod,
    );
  }
}

async function confirmPayment() {
  if (!selectedCheckoutProduct || !authToken) return;
  els.confirmPayment.disabled = true;
  setCheckoutStatus("正在创建订单...");
  try {
    const response = await apiFetch("/v1/billing/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: selectedCheckoutProduct.id,
        paymentMethod: selectedPaymentMethod,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      throw apiResponseError(response, payload.error || "订单创建失败。");
    if (payload.order?.status === "paid") {
      checkoutVisible = false;
      selectedCheckoutProduct = null;
      applyAccount(payload.account);
      await loadLedger();
      showToast("支付成功，点数已到账。");
      return;
    }
    if (!payload.order?.qrDataUrl) {
      throw new Error("订单已创建，但未取得微信付款码。");
    }
    currentPaymentOrder = payload.order;
    els.paymentQr.src = payload.order.qrDataUrl;
    els.paymentOrderNo.textContent = `订单号 ${payload.order.outTradeNo}`;
    els.paymentQrWrap.hidden = false;
    els.confirmPayment.hidden = true;
    setCheckoutStatus("等待支付结果，付款后会自动到账...");
    startPaymentPolling();
  } catch (error) {
    setCheckoutStatus(error.message || "付款入口打开失败。", true);
  } finally {
    els.confirmPayment.disabled = false;
  }
}

function startPaymentPolling() {
  stopPaymentPolling();
  paymentPollTimer = window.setInterval(checkPaymentStatus, 2200);
}

function stopPaymentPolling() {
  if (!paymentPollTimer) return;
  window.clearInterval(paymentPollTimer);
  paymentPollTimer = 0;
}

async function checkPaymentStatus() {
  if (!currentPaymentOrder?.id || !authToken) return;
  try {
    const response = await apiFetch(`/v1/billing/orders/${currentPaymentOrder.id}`);
    const payload = await response.json();
    if (!response.ok)
      throw apiResponseError(response, payload.error || "订单状态读取失败。");
    currentPaymentOrder = payload.order;
    if (payload.order?.status === "paid") {
      stopPaymentPolling();
      checkoutVisible = false;
      selectedCheckoutProduct = null;
      currentPaymentOrder = null;
      applyAccount(payload.account);
      await loadLedger();
      showToast("支付成功，点数已到账。");
      return;
    }
    if (["closed", "failed"].includes(payload.order?.status)) {
      stopPaymentPolling();
      els.paymentQrWrap.hidden = true;
      els.confirmPayment.hidden = false;
      els.confirmPayment.textContent = "重新生成付款码";
      setCheckoutStatus("订单已失效，请重新生成付款码。", true);
    }
  } catch (error) {
    setCheckoutStatus(cleanDesktopError(error), true);
  }
}

function setCheckoutStatus(text, isError = false) {
  els.checkoutStatus.textContent = text;
  els.checkoutStatus.classList.toggle("error", isError);
}

function renderLedger(entries) {
  els.ledgerList.innerHTML = "";
  if (!entries.length) {
    els.ledgerList.innerHTML = '<p class="drawer-empty">暂无点数流水</p>';
    return;
  }
  const names = {
    trial_bonus: "体验点数",
    purchase: "点数入账",
    credit: "CDK 兑换",
    reserve: "任务消费",
    refund: "失败退回",
  };
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "ledger-row";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.note || names[entry.type] || "点数变动";
    const time = document.createElement("span");
    time.textContent = formatLedgerTime(entry.createdAt);
    copy.append(title, time);
    const amount = document.createElement("b");
    amount.className = entry.amount >= 0 ? "is-credit" : "is-debit";
    amount.textContent = `${entry.amount >= 0 ? "+" : ""}${entry.amount}`;
    row.append(copy, amount);
    els.ledgerList.append(row);
  }
}

async function signOutAccount() {
  els.signOutAccount.disabled = true;
  try {
    await window.desktopAPI.logoutAccount();
    clearSession();
    closeAccountDrawer();
    showToast("已退出账户。");
  } catch (error) {
    showToast(cleanDesktopError(error), true);
  } finally {
    els.signOutAccount.disabled = false;
  }
}

function clearSession() {
  currentAccount = null;
  chrome.storage.local.set({ currentJobId: "" });
  currentJobId = "";
  renderAccount();
}

function setLoginStatus(text, isError = false) {
  els.loginStatus.textContent = text;
  els.loginStatus.classList.toggle("error", isError);
}

function setCdkStatus(text, isError = false) {
  els.cdkStatus.textContent = text;
  els.cdkStatus.classList.toggle("error", isError);
}

function setAccountSecurityStatus(text, isError = false) {
  els.accountSecurityStatus.textContent = text;
  els.accountSecurityStatus.classList.toggle("error", isError);
}

function cleanDesktopError(error) {
  const message = String(error?.message || "请求失败。");
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "");
}

function showToast(text, isError = false) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.classList.toggle("is-error", isError);
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("is-visible"));
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
    window.setTimeout(() => {
      els.toast.hidden = true;
    }, 180);
  }, 2600);
}

function compactName(value) {
  const text = String(value || "账户");
  return text.length > 8 ? `${text.slice(0, 8)}…` : text;
}

function formatLedgerTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function apiResponseError(response, message) {
  const error = new Error(message);
  error.statusCode = response.status;
  return error;
}

// ── 产品库 ──

function loadProductSelect() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const products = result[STORAGE_KEY] || {};
    const select = els.productSelect;
    select.innerHTML = '<option value="">— 选择已保存产品 —</option>';
    for (const [name, product] of Object.entries(products)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = product.name || name;
      select.append(opt);
    }
  });
}

function onProductSelect() {
  const name = els.productSelect.value;
  if (!name) {
    clearProductForm();
    return;
  }
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const products = result[STORAGE_KEY] || {};
    const product = products[name];
    if (!product) return;
    applyProductToForm(product);
  });
}

async function onSaveProduct() {
  const product = {
    ...collectProduct(),
    id: currentProductId || crypto.randomUUID(),
  };
  const name = product.name;
  if (!name) {
    setRewriteStatus("请先填写产品名再保存。", true);
    return;
  }
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const products = result[STORAGE_KEY] || {};
    products[name] = product;
    chrome.storage.local.set({ [STORAGE_KEY]: products }, () => {
      currentProductId = product.id;
      loadProductSelect();
      els.productSelect.value = name;
      setRewriteStatus(`已保存产品：${name}`);
      window.desktopAPI
        ?.saveLibraryProduct?.(product)
        .then((sync) => {
          if (sync?.synced) showToast("产品已同步到我的飞书素材库。");
        })
        .catch((error) =>
          showToast(
            `产品已本地保存，飞书同步失败：${error?.message || "未知错误"}`,
            true,
          ),
        );
    });
  });
}

function onDeleteProduct() {
  const name = els.productSelect.value;
  if (!name) return;
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const products = result[STORAGE_KEY] || {};
    delete products[name];
    chrome.storage.local.set({ [STORAGE_KEY]: products }, () => {
      loadProductSelect();
      clearProductForm();
      setRewriteStatus(`已删除产品：${name}`);
    });
  });
}

function applyProductToForm(product) {
  currentProductId = product.id || "";
  els.productName.value = product.name || "";
  els.productCategory.value = product.category || "";
  els.productAudience.value = product.audience || "";
  els.productOffer.value = product.offer || "";
  els.productSellingPoints.value = product.sellingPoints || "";
  els.productScenes.value = product.scenes || "";
  els.productMustSay.value = product.mustSay || "";
  els.productMustAvoid.value = product.mustAvoid || "";
  els.productTone.value = product.tone || "";
  els.productDuration.value = product.duration || "";
}

function clearProductForm() {
  currentProductId = "";
  els.productName.value = "";
  els.productCategory.value = "";
  els.productAudience.value = "";
  els.productOffer.value = "";
  els.productSellingPoints.value = "";
  els.productScenes.value = "";
  els.productMustSay.value = "";
  els.productMustAvoid.value = "";
  els.productTone.value = "";
  els.productDuration.value = "";
}

function collectProduct() {
  return {
    id: currentProductId,
    name: els.productName.value.trim(),
    category: els.productCategory.value.trim(),
    audience: els.productAudience.value.trim(),
    offer: els.productOffer.value.trim(),
    sellingPoints: els.productSellingPoints.value.trim(),
    scenes: els.productScenes.value.trim(),
    mustSay: els.productMustSay.value.trim(),
    mustAvoid: els.productMustAvoid.value.trim(),
    tone: els.productTone.value.trim(),
    duration: els.productDuration.value.trim(),
  };
}

function renderRewriteHtml(html) {
  els.rewriteResult.classList.remove("empty");
  els.rewriteResult.innerHTML = "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<div>${anonymizeServiceNames(html)}</div>`,
    "text/html",
  );
  const wrapper = doc.body.firstElementChild;
  const rewriteRoot = wrapper?.querySelector(".rewrite-doc");
  const renderRoot = rewriteRoot || wrapper;
  sanitizeNode(renderRoot);
  if (rewriteRoot) els.rewriteResult.append(rewriteRoot);
  else if (wrapper) els.rewriteResult.append(...wrapper.childNodes);
}

async function copyRewrite() {
  const text = els.rewriteResult.innerText || "";
  if (!text || text === "暂无仿写") {
    setRewriteStatus("暂无可复制仿写。", true);
    return;
  }
  await navigator.clipboard.writeText(text);
  setRewriteStatus("仿写脚本已复制。");
}

function setRewriteStatus(text, isError = false) {
  els.rewriteStatus.textContent = text;
  els.rewriteStatus.classList.toggle("error", isError);
}

function setStatus(text, isError = false) {
  els.statusText.textContent = anonymizeServiceNames(text);
  els.statusText.classList.toggle("error", isError);
  if (isError) {
    els.statusText.style.color = "var(--danger)";
  } else {
    els.statusText.style.color = "";
  }
}

function anonymizeServiceNames(value) {
  return String(value || "")
    .replace(/MiniMax(?:-M3)?/gi, "视频理解服务")
    .replace(/\bdeepseek(?:[-_ ][a-z0-9._-]+)?\b/gi, "内容分析服务")
    .replace(/\bvolcano(?:\s+ASR)?\b/gi, "语音识别服务")
    .replace(/火山(?:引擎)?(?:\s*ASR)?/gi, "语音识别服务")
    .replace(/volc\.seedasr\.auc/gi, "语音识别服务");
}

function setProgress(value) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  els.progressBar.style.width = `${pct}%`;
  if (els.progressPercent) {
    els.progressPercent.textContent = pct > 0 ? `${Math.round(pct)}%` : "";
  }
}

function formatStatus(status) {
  const names = {
    queued: "排队中",
    resolving: "解析链接中",
    downloading: "下载视频中",
    extracting_frames: "高密度拆帧中",
    extracting_audio: "抽取音频中",
    vision: "理解视频中",
    transcribing: "识别原始口播中",
    analyzing: "生成拆解中",
    saving_material: "整理并写入素材库中",
    done: "完成",
    failed: "失败",
  };
  return names[status] || status || "处理中";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
