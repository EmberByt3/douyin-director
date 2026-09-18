import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import {
  resolveVideoUrl,
  downloadExternalVideo,
  downloadVideo,
} from "./downloader.js";
import { extractAudio, extractFrames } from "./ffmpeg.js";
import {
  analyzeWithDeepSeek,
  extractMaterialStructure,
} from "./providers/deepseek.js";
import { transcribeAudio } from "./providers/asr.js";
import { describeFrames } from "./providers/vision.js";
import { createId, ensureDir, toPublicPath } from "./utils.js";
import { refundReservation, settleReservation } from "./billing/runtime.js";
import {
  inspectUserMaterial,
  syncAnalysisToUserLibrary,
} from "./materials/library.js";
import { getUserLibraryConfig } from "./materials/runtime.js";

const jobs = new Map();

export function hasActiveJobs() {
  return [...jobs.values()].some(
    (job) => !["done", "failed"].includes(job.status),
  );
}

export function forgetFinishedJobs() {
  for (const [jobId, job] of jobs) {
    if (["done", "failed"].includes(job.status)) jobs.delete(jobId);
  }
}

export function createVideoJob({
  url,
  options = {},
  userId = "",
  reservationId = "",
}) {
  const jobId = createId("video");
  const job = {
    id: jobId,
    inputUrl: url,
    options,
    userId,
    reservationId,
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: null,
    error: "",
  };
  jobs.set(jobId, job);
  void runJob(job);
  return job;
}

export function getJob(jobId) {
  const existing = jobs.get(jobId);
  if (existing) {
    return existing;
  }

  const resultPath = path.join(config.jobsDir, jobId, "result.json");
  if (!fsSync.existsSync(resultPath)) {
    return undefined;
  }

  try {
    const result = JSON.parse(fsSync.readFileSync(resultPath, "utf8"));
    const restored = {
      id: jobId,
      inputUrl: result.inputUrl || "",
      title: result.title || "",
      pageUrl: result.pageUrl || "",
      status: "done",
      progress: 100,
      createdAt: new Date(
        fsSync.statSync(resultPath).birthtimeMs,
      ).toISOString(),
      updatedAt: new Date(fsSync.statSync(resultPath).mtimeMs).toISOString(),
      result,
      error: "",
      userId: result.userId || "",
    };
    jobs.set(jobId, restored);
    return restored;
  } catch {
    return undefined;
  }
}

export async function retryMaterialSync(job) {
  if (!job?.result) throw new Error("该任务没有可重新入库的分析结果。");
  if (!getUserLibraryConfig())
    throw new Error("请先连接并初始化我的飞书素材库。");
  if (job.materialSyncPromise) return job.materialSyncPromise;

  const resultPath = path.join(config.jobsDir, job.id, "result.json");
  job.materialSyncPromise = (async () => {
    job.error = "";
    await synchronizeMaterial(job, job.result, resultPath);
    await update(job, "done", 100);
    return job;
  })();
  try {
    return await job.materialSyncPromise;
  } finally {
    job.materialSyncPromise = null;
  }
}

async function runJob(job) {
  const jobDir = path.join(config.jobsDir, job.id);
  const framesDir = path.join(jobDir, "frames");
  const audioPath = path.join(jobDir, "audio.wav");
  const resultPath = path.join(jobDir, "result.json");

  try {
    await update(job, "resolving", 5);
    await ensureDir(jobDir);

    const douyinCookie =
      typeof job.options.douyinCookie === "string"
        ? job.options.douyinCookie
        : "";
    const resolved = await resolveVideoUrl(job.inputUrl, {
      cookie: douyinCookie,
    });
    Object.assign(job, resolved);

    await update(job, "downloading", 18);
    const videoPath = resolved.externalDownloader
      ? await downloadExternalVideo({
          sourceUrl: resolved.sourceUrl || resolved.pageUrl || job.inputUrl,
          targetDir: jobDir,
          cookie: douyinCookie,
        })
      : await downloadVideo({
          videoUrl: resolved.videoUrl,
          targetDir: jobDir,
          title: resolved.title,
          localFilePath: resolved.localFilePath,
          cookie: douyinCookie,
        });

    await update(job, "extracting_frames", 38);
    const frameRateFps = Number(
      job.options.frameRateFps || config.frameRateFps || 5,
    );
    await extractFrames({
      videoPath,
      framesDir,
      frameRateFps,
    });

    await update(job, "extracting_audio", 48);
    await extractAudio({ videoPath, audioPath });
    const audioPublicPath = toPublicPath(job.id, audioPath);

    const frameFiles = (await fs.readdir(framesDir))
      .filter((name) => /\.(jpg|jpeg|png)$/i.test(name))
      .sort()
      .map((name, index) => {
        const filePath = path.join(framesDir, name);
        return {
          index,
          name,
          filePath,
          publicPath: toPublicPath(job.id, filePath),
          secondIndex: Math.floor(index / frameRateFps),
          frameInSecond: index % frameRateFps,
          capturedAtSec: Number((index / frameRateFps).toFixed(2)),
        };
      });

    await update(job, "vision", 58);
    const vision = await describeFrames({
      frames: frameFiles,
      videoPath,
      reservationId: job.reservationId,
    });

    await update(job, "transcribing", 74);
    const asr = await transcribeAudio({
      audioPath,
      reservationId: job.reservationId,
    });

    await update(job, "analyzing", 88);
    const analysis = await analyzeWithDeepSeek({
      job,
      frames: frameFiles,
      asr,
      vision,
    });

    const result = {
      jobId: job.id,
      userId: job.userId,
      title: resolved.title,
      inputUrl: job.inputUrl,
      pageUrl: resolved.pageUrl,
      videoUrl: resolved.videoUrl,
      videoPath: toPublicPath(job.id, videoPath),
      audioPath: audioPublicPath,
      frameRateFps,
      frames: frameFiles,
      vision,
      asr,
      analysis,
    };

    job.result = result;

    await synchronizeMaterial(job, result, resultPath);

    if (!config.keepVideo) {
      await fs.rm(videoPath, { force: true }).catch(() => {});
      await fs.rm(audioPath, { force: true }).catch(() => {});
    }

    await settleReservation(job.reservationId);
    await update(job, "done", 100);
  } catch (error) {
    job.error = error instanceof Error ? error.message : String(error);
    await refundReservation(job.reservationId);
    await update(job, "failed", job.progress || 0);
  }
}

async function synchronizeMaterial(job, result, resultPath) {
  if (!getUserLibraryConfig()) {
    result.materialSync = {
      configured: false,
      synced: false,
      state: "not_configured",
      message: "未连接用户素材库",
    };
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
    return result.materialSync;
  }

  result.materialSync = {
    configured: true,
    synced: false,
    state: "syncing",
    message: "报告已生成，正在分阶段整理并写入素材库",
  };
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  await update(job, "saving_material", 94);
  try {
    const inspected = await inspectUserMaterial(result);
    if (inspected.exists && !inspected.needsUpgrade) {
      result.materialSync = {
        configured: true,
        synced: true,
        state: "exists",
        exists: true,
        isNew: false,
        materialId: inspected.identity.materialId,
        recordId: inspected.existing?.recordId || "",
        segmentCount: 0,
        shotCount: 0,
        message: "素材已存在，未重复入库",
      };
    } else {
      const structured = await extractMaterialStructure({
        result,
        reservationId: job.reservationId,
      });
      result.materialSync = {
        ...(await syncAnalysisToUserLibrary({ result, structured })),
        state: inspected.needsUpgrade ? "upgraded" : "synced",
      };
    }
  } catch (error) {
    result.materialSync = {
      configured: true,
      synced: false,
      state: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  return result.materialSync;
}

async function update(job, status, progress) {
  job.status = status;
  job.progress = progress;
  job.updatedAt = new Date().toISOString();
  await ensureDir(config.jobsDir);
}
