import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = trimmed.split("=");
    if (!Object.hasOwn(process.env, key)) {
      process.env[key] = valueParts.join("=").trim();
    }
  }
}

loadEnvFile();
const localDirect = String(process.env.LOCAL_DIRECT_MODE || "true").toLowerCase() === "true";

export const config = {
  localDirect,
  rootDir,
  port: Number(process.env.PORT || 8789),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8789",
  refreshPublicBaseUrl: null,
  jobsDir: path.resolve(rootDir, process.env.JOBS_DIR || "./jobs"),
  accountDataPath: path.resolve(
    process.env.ACCOUNT_DATA_PATH || path.join(rootDir, "./data/account-store.json")
  ),
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  frameRateFps: Number(process.env.FRAME_RATE_FPS || 5),
  download: {
    retryTimes: Number(process.env.DOWNLOAD_RETRY_TIMES || 3),
    retryDelaysMs: (process.env.DOWNLOAD_RETRY_DELAYS_MS || "1000,2000,5000")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0),
    integrityCheck: String(process.env.DOWNLOAD_INTEGRITY_CHECK || "true").toLowerCase() !== "false",
    cookie: process.env.DOUYIN_COOKIE || "",
    browserFallbackEnabled: String(process.env.BROWSER_FALLBACK_ENABLED || "false").toLowerCase() === "true",
    douyinDownloaderEnabled: String(process.env.DOUYIN_DOWNLOADER_ENABLED || "false").toLowerCase() === "true",
    douyinDownloaderRepo: path.resolve(rootDir, process.env.DOUYIN_DOWNLOADER_REPO || "../external/jiji262-douyin-downloader"),
    douyinDownloaderPython: process.env.DOUYIN_DOWNLOADER_PYTHON || "python",
    douyinDownloaderTimeoutMs: Number(process.env.DOUYIN_DOWNLOADER_TIMEOUT_MS || 180000)
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
  },
  asr: {
    provider: process.env.ASR_PROVIDER || "volcano",
    required: String(process.env.ASR_REQUIRED || "false").toLowerCase() === "true"
  },
  vision: {
    provider: process.env.VISION_PROVIDER || "off",
    batchSize: Number(process.env.VISION_BATCH_SIZE || 19),
    batchConcurrency: Number(process.env.VISION_BATCH_CONCURRENCY || 2)
  },
  keepVideo: String(process.env.KEEP_VIDEO || "true").toLowerCase() !== "false",
  providerGatewayRequired:
    !localDirect && String(process.env.PROVIDER_GATEWAY_REQUIRED || "false").toLowerCase() ===
    "true",
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY || "",
    groupId: process.env.MINIMAX_GROUP_ID || "",
    visionUrl: process.env.MINIMAX_VISION_URL || "https://api.minimaxi.com/v1/chat/completions",
    visionModel: process.env.MINIMAX_VISION_MODEL || "MiniMax-M3",
    serviceTier: process.env.MINIMAX_SERVICE_TIER || "standard"
  },
  volcano: {
    apiKey: process.env.VOLCANO_ASR_API_KEY || "",
    submitUrl: process.env.VOLCANO_ASR_SUBMIT_URL || "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit",
    queryUrl: process.env.VOLCANO_ASR_QUERY_URL || "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query",
    resourceId: process.env.VOLCANO_ASR_RESOURCE_ID || "volc.seedasr.auc",
    language: process.env.VOLCANO_ASR_LANGUAGE || "zh-CN",
    pollIntervalMs: Number(process.env.VOLCANO_ASR_POLL_INTERVAL_MS || 3000),
    timeoutMs: Number(process.env.VOLCANO_ASR_TIMEOUT_MS || 180000),
    publicUrlRetries: Number(process.env.VOLCANO_PUBLIC_URL_RETRIES || 3),
    directUploadMaxMb: Number(process.env.VOLCANO_DIRECT_UPLOAD_MAX_MB || 95)
  },
  billing: {
    enabled: !localDirect && String(process.env.BILLING_ENABLED || "true").toLowerCase() !== "false",
    devMode: String(process.env.BILLING_DEV_MODE || "true").toLowerCase() !== "false",
    trialPoints: Number(process.env.BILLING_TRIAL_POINTS || 30),
    analyzeCost: Number(process.env.BILLING_ANALYZE_COST || 10),
    rewriteCost: Number(process.env.BILLING_REWRITE_COST || 2),
    libraryScriptCost: Number(process.env.BILLING_LIBRARY_SCRIPT_COST || 4),
    sessionDays: Number(process.env.AUTH_SESSION_DAYS || 30),
    checkoutUrlTemplate: String(process.env.PAYMENT_CHECKOUT_URL_TEMPLATE || "").trim()
  },
  materialLibrary: {
    platformApiUrl: localDirect ? "" : String(process.env.PLATFORM_LIBRARY_API_URL || "").replace(/\/+$/, ""),
    platformApiKey: String(process.env.PLATFORM_LIBRARY_API_KEY || "").trim(),
    platformAppId: String(process.env.PLATFORM_FEISHU_APP_ID || "").trim(),
    platformAppSecret: String(process.env.PLATFORM_FEISHU_APP_SECRET || "").trim(),
    platformBaseUrl: String(process.env.PLATFORM_FEISHU_BASE_URL || "").trim()
  }
};
