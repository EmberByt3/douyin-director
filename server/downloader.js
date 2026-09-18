import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { safeFilename } from "./utils.js";

const VIDEO_URL_RE = /(https?:\\?\/\\?\/[^"'<>\s]+?\.(?:mp4|mov|m4v|webm)(?:\?[^"'<>\s]+)?)/ig;
let browserVideoDownloader = null;

export function configureBrowserVideoDownloader(downloader) {
  browserVideoDownloader = typeof downloader === "function" ? downloader : null;
}

export async function resolveVideoUrl(inputUrl, { cookie = "" } = {}) {
  const normalizedInput = extractUsableInput(inputUrl);
  if (isLocalPath(normalizedInput)) {
    const localFilePath = normalizeLocalPath(normalizedInput);
    return {
      videoUrl: `file://${localFilePath.replaceAll("\\", "/")}`,
      pageUrl: "",
      title: path.basename(localFilePath, path.extname(localFilePath)),
      localFilePath
    };
  }

  const url = normalizeUrl(normalizedInput);
  if (isDirectVideoUrl(url)) {
    return { videoUrl: url, pageUrl: url, title: "direct-video" };
  }

  // Desktop uses the logged-in page, including Douyin's current player SDK.
  // Avoid a second HTTP client with a different browser identity first.
  if (browserVideoDownloader && isDouyinUrl(url)) {
    return buildExternalDownloadResult({ sourceUrl: url, pageUrl: url, title: "douyin-video" });
  }

  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      headers: buildRequestHeaders({ referer: url, cookie })
    });
  } catch (error) {
    if (config.download.douyinDownloaderEnabled && isDouyinUrl(url)) {
      return buildExternalDownloadResult({ sourceUrl: url, pageUrl: url, title: "douyin-video" });
    }
    throw error;
  }

  if (!response.ok) {
    if (config.download.douyinDownloaderEnabled && isDouyinUrl(url)) {
      return buildExternalDownloadResult({ sourceUrl: url, pageUrl: response.url || url, title: "douyin-video" });
    }
    throw new Error(`Page fetch failed: HTTP ${response.status}`);
  }

  const finalUrl = response.url || url;
  const html = await response.text();
  const title = extractTitle(html) || "video";
  const videoUrl = extractVideoUrl(html);
  if (!videoUrl) {
    if (config.download.douyinDownloaderEnabled && isDouyinUrl(finalUrl)) {
      return buildExternalDownloadResult({ sourceUrl: url, pageUrl: finalUrl, title });
    }

    throw new Error("No direct video URL was found. Use an mp4/mov/webm URL, local video path, or supported Douyin short link.");
  }

  return {
    videoUrl: absolutize(videoUrl, finalUrl),
    pageUrl: finalUrl,
    title
  };
}

export async function downloadVideo({ videoUrl, targetDir, title, localFilePath, cookie = "" }) {
  if (localFilePath) {
    const extension = path.extname(localFilePath).replace(/^\./, "") || "mp4";
    const filename = `${safeFilename(title, "video")}.${extension}`;
    const filePath = path.join(targetDir, filename);
    await fsp.copyFile(localFilePath, filePath);
    return filePath;
  }

  return withRetry(async () => downloadRemoteVideo({ videoUrl, targetDir, title, cookie }), {
    retryTimes: config.download.retryTimes,
    retryDelaysMs: config.download.retryDelaysMs
  });
}

export async function downloadExternalVideo({ sourceUrl, targetDir, cookie = "" }) {
  if (!sourceUrl) {
    throw new Error("Missing source URL for external downloader.");
  }

  await ensureDirectory(targetDir);
  const logPath = path.join(targetDir, "downloader.log");
  const diagnostics = [];
  const log = (event, detail = "") => diagnostics.push(`${new Date().toISOString()} ${event} ${detail}`);
  const saveLog = () => fsp.writeFile(logPath, sanitizeDownloaderLog(diagnostics.join("\n"), cookie), "utf8").catch(() => {});
  if (browserVideoDownloader && isDouyinUrl(sourceUrl)) {
    try {
      return await browserVideoDownloader({ sourceUrl, targetDir, log });
    } catch (error) {
      log("browser-download-failed", error.message || String(error));
      throw error;
    } finally {
      await saveLog();
    }
  }
  const configPath = path.join(targetDir, "jiji262.config.yml");
  const startedAt = Date.now();
  await fsp.writeFile(configPath, buildJiji262Config({ sourceUrl, targetDir, cookie }), "utf8");

  let processResult;
  try {
    processResult = await runProcess({
    command: config.download.douyinDownloaderPython,
    args: ["run.py", "-c", configPath, "-u", sourceUrl, "-p", targetDir, "--show-warnings"],
    cwd: config.download.douyinDownloaderRepo,
    timeoutMs: config.download.douyinDownloaderTimeoutMs
    });
    log("external-output", `${processResult.stderr || ""}\n${processResult.stdout || ""}`);
  } catch (error) {
    log("external-download-failed", error.message || String(error));
    throw new Error(sanitizeDownloaderLog(error.message || String(error), cookie));
  } finally {
    await saveLog();
  }

  const mediaPath = await findNewestMediaFile(targetDir, startedAt);
  if (!mediaPath) {
    const output = `${processResult.stderr || ""}\n${processResult.stdout || ""}`.trim();
    throw new Error(`jiji262/douyin-downloader finished but no media file was found. ${summarizeDownloaderOutput(output)}`);
  }

  return mediaPath;
}

export function sanitizeDownloaderLog(value, cookie = "") {
  let text = String(value || "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  const secrets = [cookie, ...String(cookie).split(";").map(part => part.slice(part.indexOf("=") + 1).trim())]
    .filter(secret => secret.length >= 4).sort((a, b) => b.length - a.length);
  for (const secret of secrets) {
    text = text.replaceAll(secret, "[REDACTED]").replaceAll(encodeURIComponent(secret), "[REDACTED]");
  }
  return text.replace(/(https?:\/\/[^\s?'"<>]+)\?[^\s'"<>]+/g, "$1?[REDACTED_QUERY]")
    .replace(/((?:authorization|cookie|set-cookie)\s*[:=])[^\r\n]*/ig, "$1 [REDACTED]")
    .replace(/Bearer\s+\S+/ig, "Bearer [REDACTED]");
}

async function downloadRemoteVideo({ videoUrl, targetDir, title, cookie = "" }) {
  const extension = getExtension(videoUrl) || "mp4";
  const filename = `${safeFilename(title, "video")}.${extension}`;
  const filePath = path.join(targetDir, filename);
  const tempPath = `${filePath}.download`;
  await fsp.rm(tempPath, { force: true }).catch(() => {});

  const response = await fetch(videoUrl, {
    redirect: "follow",
    headers: buildRequestHeaders({ referer: videoUrl, cookie })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Video download failed: HTTP ${response.status}`);
  }

  await streamResponseToFile(response, tempPath);
  await verifyDownloadIntegrity(response, tempPath);
  await fsp.rename(tempPath, filePath);
  return filePath;
}

async function streamResponseToFile(response, filePath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    response.body.pipeTo(new WritableStream({
      write(chunk) {
        output.write(Buffer.from(chunk));
      },
      close() {
        output.end(resolve);
      },
      abort(error) {
        output.destroy(error);
        reject(error);
      }
    })).catch((error) => {
      output.destroy(error);
      reject(error);
    });
  });
}

async function verifyDownloadIntegrity(response, filePath) {
  if (!config.download.integrityCheck) {
    return;
  }

  const expectedLength = Number(response.headers.get("content-length") || 0);
  if (!expectedLength) {
    return;
  }

  const stat = await fsp.stat(filePath);
  if (stat.size !== expectedLength) {
    throw new Error(`Download integrity check failed: expected ${expectedLength} bytes, got ${stat.size} bytes.`);
  }
}

async function withRetry(task, { retryTimes, retryDelaysMs }) {
  let lastError = null;
  const attempts = Math.max(1, Number(retryTimes || 1));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      await sleep(retryDelaysMs[attempt - 1] ?? retryDelaysMs.at(-1) ?? 1000);
    }
  }
  throw lastError;
}

function buildRequestHeaders({ referer, cookie = "" } = {}) {
  const requestCookie = cookie || config.download.cookie;
  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 DouyinDirectorPrototype/0.1",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(referer ? { "referer": referer } : {}),
    ...(requestCookie ? { "cookie": requestCookie } : {})
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runProcess({ command, args, cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      }
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`External downloader timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`External downloader failed with code ${code}: ${(stderr || stdout).slice(-2000)}`));
    });
  });
}

function buildJiji262Config({ sourceUrl, targetDir, cookie = "" }) {
  const normalizedTarget = targetDir.replaceAll("\\", "/");
  const requestCookie = cookie || config.download.cookie || "";
  return [
    "link:",
    `  - ${sourceUrl}`,
    `path: ${JSON.stringify(normalizedTarget)}`,
    "music: false",
    "cover: true",
    "avatar: false",
    "json: true",
    "folderstyle: true",
    "filename_template: \"{date}_{title}_{id}\"",
    "folder_template: \"{date}_{title}_{id}\"",
    "author_dir: \"nickname\"",
    "mode:",
    "  - post",
    "number:",
    "  post: 1",
    "  like: 0",
    "  allmix: 0",
    "  mix: 0",
    "  music: 0",
    "  collect: 0",
    "  collectmix: 0",
    "thread: 1",
    "retry_times: 3",
    "proxy: \"\"",
    "database: false",
    "progress:",
    "  quiet_logs: true",
    "transcript:",
    "  enabled: false",
    "comments:",
    "  enabled: false",
    "browser_fallback:",
    `  enabled: ${config.download.browserFallbackEnabled ? "true" : "false"}`,
    "  headless: false",
    "  max_scrolls: 80",
    "  idle_rounds: 6",
    "  wait_timeout_seconds: 300",
    `cookie: ${JSON.stringify(requestCookie)}`,
    ""
  ].join("\n");
}

function buildExternalDownloadResult({ sourceUrl, pageUrl, title }) {
  return {
    videoUrl: "",
    pageUrl,
    title: title || "douyin-video",
    externalDownloader: "jiji262",
    sourceUrl
  };
}

function summarizeDownloaderOutput(output) {
  if (!output) {
    return "No downloader output was captured.";
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(" | ")
    .slice(0, 1200);
}

async function findNewestMediaFile(rootDir, startedAt) {
  const candidates = [];
  await collectMediaFiles(rootDir, candidates);
  return candidates
    .filter((item) => item.stat.mtimeMs >= startedAt - 2000)
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || b.stat.size - a.stat.size)
    .map((item) => item.filePath)[0] || "";
}

async function collectMediaFiles(dir, candidates) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMediaFiles(entryPath, candidates);
      continue;
    }
    if (!/\.(mp4|mov|m4v|webm)$/i.test(entry.name) || /\.download$/i.test(entry.name)) {
      continue;
    }
    const stat = await fsp.stat(entryPath);
    candidates.push({ filePath: entryPath, stat });
  }
}

async function ensureDirectory(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function extractUsableInput(value) {
  const raw = String(value || "").trim();
  const urlMatch = raw.match(/https?:\/\/[^\s，。"'<>]+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[),，。；;]+$/g, "");
  }

  const localMatch = raw.match(/[a-z]:[\\/][^\r\n]+?\.(?:mp4|mov|m4v|webm)/i);
  if (localMatch) {
    return localMatch[0].trim();
  }

  return raw;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error("Please enter an http/https video URL.");
  }
  return new URL(raw).toString();
}

function isLocalPath(value) {
  const raw = String(value || "").trim();
  return /^file:\/\//i.test(raw) || /^[a-z]:[\\/]/i.test(raw);
}

function normalizeLocalPath(value) {
  const raw = String(value || "").trim();
  if (/^file:\/\//i.test(raw)) {
    return new URL(raw).pathname.replace(/^\/([a-z]:)/i, "$1").replaceAll("/", "\\");
  }
  return path.resolve(raw);
}

function isDirectVideoUrl(url) {
  return /\.(mp4|mov|m4v|webm)(?:\?|#|$)/i.test(url);
}

function isDouyinUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ["douyin.com", "iesdouyin.com"].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1]).trim() : "";
}

function extractVideoUrl(html) {
  const videoTag = html.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (videoTag?.[1]) {
    return cleanEscapedUrl(videoTag[1]);
  }

  const sourceTag = html.match(/<source[^>]+src=["']([^"']+)["']/i);
  if (sourceTag?.[1]) {
    return cleanEscapedUrl(sourceTag[1]);
  }

  const matches = [...html.matchAll(VIDEO_URL_RE)].map((match) => cleanEscapedUrl(match[1]));
  return matches[0] || "";
}

function cleanEscapedUrl(value) {
  return String(value || "")
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&")
    .replace(/^http:\\\/\\\//, "http://")
    .replace(/^https:\\\/\\\//, "https://");
}

function absolutize(value, baseUrl) {
  return new URL(value, baseUrl).toString();
}

function getExtension(url) {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : "";
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
