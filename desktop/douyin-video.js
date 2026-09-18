import { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { validateDouyinPage, mediaFromDetail } from "./douyin-video-data.js";

export async function resolveDouyinVideo({ sourceUrl, douyinSession, userAgent, timeoutMs = 45000, log = () => {} }) {
  validateDouyinPage(sourceUrl);
  const window = new BrowserWindow({
    show: false,
    width: 1180,
    height: 820,
    webPreferences: {
      session: douyinSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setAudioMuted(true);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const guard = (event, url) => {
    try { validateDouyinPage(url); } catch { event.preventDefault(); }
  };
  window.webContents.on("will-navigate", guard);
  window.webContents.on("will-redirect", guard);
  let expectedId = new URL(sourceUrl).pathname.match(/\/(?:video|note)\/(\d+)/)?.[1] || "";
  let media = null;
  let bridgeStarted = false;
  let pageLoaded = false;
  let lastState = "loading";
  try {
    log("page-video-start", "opening");
    window.webContents.on("dom-ready", () => { pageLoaded = true; log("page-video-ready", "dom-ready"); });
    void window.loadURL(sourceUrl, { userAgent }).catch((error) => {
      lastState = `navigation:${error.code || "failed"}`;
    });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !window.isDestroyed()) {
      if (media) return media;
      const pageUrl = window.webContents.getURL();
      try {
        const url = validateDouyinPage(pageUrl);
        expectedId ||= url.pathname.match(/\/(?:video|note)\/(\d+)/)?.[1] || url.searchParams.get("modal_id") || "";
      } catch { /* Initial about:blank has no video identity. */ }
      if (pageLoaded && expectedId) {
        const state = await Promise.race([
          window.webContents.executeJavaScript(`(() => {
            const videos = [...document.querySelectorAll('video')];
            const video = videos.filter(v => v.videoWidth > 0 && v.readyState >= 1)
              .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
            return { title: document.title, src: video?.currentSrc || '', duration: video?.duration || 0, count: videos.length };
          })()`),
          new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
        ]).catch(() => null);
        if (state) {
          lastState = `videos=${state.count} duration=${state.duration}`;
          if (state.src.startsWith("https://")) return { videoUrl: state.src, title: state.title, awemeId: expectedId };
        }
        if (!bridgeStarted && new URL(pageUrl).hostname === "www.douyin.com") {
          bridgeStarted = true;
          // Use the page's normal fetch implementation so Douyin's own SDK supplies
          // its current session/signature headers. No cookies or signatures are exported.
          void window.webContents.executeJavaScript(`(async () => {
            await new Promise(resolve => setTimeout(resolve, 2500));
            const params = new URLSearchParams({ aweme_id: ${JSON.stringify(expectedId)}, aid: '6383', device_platform: 'webapp', channel: 'channel_pc_web' });
            const response = await fetch('/aweme/v1/web/aweme/detail/?' + params, { credentials: 'include' });
            return { status: response.status, data: response.ok ? await response.json() : null };
          })()`).then((result) => {
            log("page-detail", `http=${result.status}`);
            media ||= mediaFromDetail(result.data, expectedId);
          }).catch(() => {});
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    log("page-video-timeout", lastState);
    throw new Error("抖音作品页暂未返回视频。请打开“登录抖音”确认这条作品能够播放后重试。");
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}

export async function downloadDouyinVideo({ sourceUrl, targetDir, douyinSession, userAgent, log }) {
  const media = await resolveDouyinVideo({ sourceUrl, douyinSession, userAgent, log });
  const target = path.join(targetDir, `douyin-${media.awemeId}.mp4`);
  const partial = `${target}.download`;
  await fs.mkdir(targetDir, { recursive: true });
  try {
    const response = await douyinSession.fetch(media.videoUrl, {
      headers: { Referer: "https://www.douyin.com/", "User-Agent": userAgent },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok || !response.body || /text\/html|application\/json/i.test(response.headers.get("content-type") || "")) {
      throw new Error(`抖音视频下载失败：HTTP ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    const stat = await fs.stat(partial);
    const expected = Number(response.headers.get("content-length") || 0);
    if (stat.size < 1024 || (expected && stat.size !== expected)) throw new Error("抖音视频下载不完整，请重试。");
    await fs.rename(partial, target);
    log?.("page-video-downloaded", `id=${media.awemeId} bytes=${stat.size}`);
    return target;
  } catch (error) {
    await fs.rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}
