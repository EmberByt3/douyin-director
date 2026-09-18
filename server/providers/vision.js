import fs from "node:fs/promises";
import { config } from "../config.js";
import { callProvider, hasProviderGateway } from "./gateway.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000];
const MAX_MULTIMODAL_ITEMS = 20;
const MAX_FRAMES_PER_BATCH = MAX_MULTIMODAL_ITEMS - 1;

export async function describeFrames({ frames, reservationId }) {
  const allFrames = Array.isArray(frames) ? frames : [];
  const durationSec = inferDurationSec(allFrames);
  if (config.vision.provider !== "minimax") {
    return buildOffResult(allFrames, durationSec);
  }

  if (!hasProviderGateway() && (!config.minimax.apiKey || !config.minimax.visionUrl)) {
    throw new Error("视频理解未配置，请检查云端能力网关。");
  }
  if (!allFrames.length) {
    throw new Error("没有找到可用于视频理解的关键帧。");
  }

  return describeAllFrames({ frames: allFrames, durationSec, reservationId });
}

async function describeAllFrames({ frames, durationSec, reservationId }) {
  const batches = buildFrameBatches(frames, config.vision.batchSize);
  const results = await mapWithConcurrency(
    batches,
    config.vision.batchConcurrency,
    async (batch, batchIndex) => {
      try {
        return await describeFrameBatch({
          frames: batch,
          batchIndex,
          totalBatches: batches.length,
          reservationId,
        });
      } catch (error) {
        return {
          batchIndex,
          startSec: Number(batch[0]?.capturedAtSec || 0),
          endSec: Number(batch.at(-1)?.capturedAtSec || 0),
          frameCount: batch.length,
          frameNames: batch.map((frame) => frame.name),
          summary: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  const successful = results.filter((item) => item.summary);
  if (!successful.length) {
    const errors = results
      .map((item) => item.error)
      .filter(Boolean)
      .slice(0, 3)
      .join(" | ");
    throw new Error(`视频理解暂时不可用，全部帧批次均识别失败。${errors}`);
  }

  const failedFrameNames = new Set(
    results.filter((item) => item.error).flatMap((item) => item.frameNames),
  );
  const coverage = buildFrameCoverage(results, durationSec, frames.length);
  const frameEvidence = frames.map((frame, index) => ({
    index,
    name: frame.name,
    filePath: frame.filePath,
    publicPath: frame.publicPath,
    capturedAtSec: frame.capturedAtSec,
    analyzed: !failedFrameNames.has(frame.name),
  }));

  return {
    provider: "minimax",
    mode: "all_frames",
    frames: frameEvidence,
    batches: results,
    coverage,
    fullText: [
      `【全帧视觉证据】共 ${frames.length} 帧，按 ${batches.length} 个连续时间批次逐帧检查；相邻重复画面仅在文字结果中合并，原始帧未抽样丢弃。`,
      ...results.map(formatBatchResult),
    ].join("\n\n"),
  };
}

export function buildFrameBatches(frames, requestedBatchSize = 19) {
  const size = Math.min(
    MAX_FRAMES_PER_BATCH,
    Math.max(1, Math.floor(Number(requestedBatchSize) || 19)),
  );
  const batches = [];
  for (let index = 0; index < (frames || []).length; index += size) {
    batches.push(frames.slice(index, index + size));
  }
  return batches;
}

function buildOffResult(frames, durationSec) {
  return {
    provider: "off",
    mode: "off",
    frames: frames.map((frame, index) => ({
      index,
      name: frame.name,
      filePath: frame.filePath,
      publicPath: frame.publicPath,
      capturedAtSec: frame.capturedAtSec,
      analyzed: false,
    })),
    coverage: {
      complete: false,
      source: "off",
      durationSec,
      requestedFrames: frames.length,
      analyzedFrames: 0,
    },
    fullText: "",
    note: "视频理解功能未开启。",
  };
}

async function describeFrameBatch({
  frames,
  batchIndex,
  totalBatches,
  reservationId,
}) {
  const images = await Promise.all(
    frames.map(async (frame) => ({
      frame,
      base64: (await fs.readFile(frame.filePath)).toString("base64"),
    })),
  );
  const payload = buildFrameBatchPayload({ images, batchIndex, totalBatches });
  const raw = await fetchMiniMaxWithRetry(payload, reservationId);
  const summary = stripThinking(extractAssistantText(raw));
  if (!summary) throw new Error("视频理解服务返回了空结果。");

  return {
    batchIndex,
    startSec: Number(frames[0]?.capturedAtSec || 0),
    endSec: Number(frames.at(-1)?.capturedAtSec || 0),
    frameCount: frames.length,
    frameNames: frames.map((frame) => frame.name),
    summary,
  };
}

export function buildFrameBatchPayload({ images, batchIndex = 0, totalBatches = 1 }) {
  const frameMap = images.map(({ frame }, index) => {
    const time = Number(frame.capturedAtSec || 0).toFixed(1);
    return `图${index + 1}=${time}s (${frame.name})`;
  }).join("；");
  const startSec = Number(images[0]?.frame?.capturedAtSec || 0).toFixed(1);
  const endSec = Number(images.at(-1)?.frame?.capturedAtSec || 0).toFixed(1);

  return {
    model: config.minimax.visionModel,
    service_tier: config.minimax.serviceTier,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "你是短视频编导画面证据记录员。只描述图片中真实可见的内容，禁止脑补声音、价格、品牌或动作。",
              `这是第 ${batchIndex + 1}/${totalBatches} 批连续关键帧，时间范围 ${startSec}s-${endSec}s。`,
              `图片与时间严格对应：${frameMap}`,
              "必须按顺序逐张检查全部图片。相邻图片内容相同可以合并为一个时间段，但任何主体、动作、产品、场景、镜头、字幕、贴片或转场变化都不能跳过。",
              "请用紧凑中文时间线输出，每段包含：时间范围｜画面｜可见文字/贴片｜镜头或动作。读不清的文字写“未识别”，不要推测口播。",
            ].join("\n"),
          },
          ...images.map(({ base64 }) => ({
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64}`,
              detail: "low",
              max_long_side_pixel: 960,
            },
          })),
        ],
      },
    ],
    temperature: 0.1,
    max_completion_tokens: 1200,
  };
}

async function fetchMiniMaxWithRetry(payload, reservationId) {
  if (hasProviderGateway())
    return callProvider("minimax_vision", { request: payload }, reservationId);
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(config.minimax.visionUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${config.minimax.apiKey}`,
        ...(config.minimax.groupId ? { "x-minimax-group-id": config.minimax.groupId } : {}),
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.json().catch(() => ({}));
    if (response.ok) return raw;

    const message = JSON.stringify(raw).slice(0, 800);
    lastError = new Error(`视频理解服务失败：${response.status} ${message}`);
    const retryable = RETRYABLE_STATUS.has(response.status)
      || raw?.error?.type === "overloaded_error"
      || raw?.base_resp?.status_code === 1002;
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw lastError;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
  throw lastError || new Error("视频理解请求失败。");
}

function inferDurationSec(frames) {
  if (!Array.isArray(frames) || !frames.length) return 0;
  const last = Math.max(...frames.map((frame) => Number(frame.capturedAtSec || 0)));
  return Number((last + (1 / Math.max(1, Number(config.frameRateFps) || 5))).toFixed(2));
}

export function buildFrameCoverage(results, durationSec, requestedFrames) {
  const isBatchResult = results.some((item) => Number.isFinite(Number(item.frameCount)));
  const analyzedFrames = isBatchResult
    ? results.filter((item) => item.summary && !item.error)
      .reduce((sum, item) => sum + Number(item.frameCount || 0), 0)
    : results.filter((item) => item.description || item.text || item.shotType).length;
  const totalFrames = Number.isFinite(Number(requestedFrames))
    ? Number(requestedFrames)
    : isBatchResult
      ? results.reduce((sum, item) => sum + Number(item.frameCount || 0), 0)
      : results.length;
  const coveredItems = isBatchResult
    ? results.filter((item) => item.summary && !item.error)
    : results.filter((item) => item.description || item.text || item.shotType);
  const coveredUntilSec = coveredItems.length
    ? Math.max(...coveredItems.map((item) => Number(
      isBatchResult ? item.endSec || 0 : item.capturedAtSec || 0,
    )))
    : 0;
  const failedBatches = isBatchResult
    ? results.filter((item) => item.error).map((item) => item.batchIndex + 1)
    : [];

  return {
    complete: totalFrames > 0 && analyzedFrames === totalFrames,
    source: "all-frames",
    durationSec,
    coveredUntilSec,
    requestedFrames: totalFrames,
    analyzedFrames,
    usableFrames: analyzedFrames,
    batchCount: isBatchResult ? results.length : undefined,
    failedBatches,
  };
}

function formatBatchResult(item) {
  const range = `${Number(item.startSec || 0).toFixed(1)}s-${Number(item.endSec || 0).toFixed(1)}s`;
  if (item.error) {
    return `【${range}｜${item.frameCount} 帧】识别失败：${item.error}`;
  }
  return `【${range}｜${item.frameCount} 帧全部已检查】\n${item.summary}`;
}

async function mapWithConcurrency(items, requestedLimit, worker) {
  const limit = Math.min(
    items.length,
    Math.max(1, Math.floor(Number(requestedLimit) || 2)),
  );
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

function extractAssistantText(payload) {
  const content = payload.choices?.[0]?.message?.content
    || payload.reply
    || payload.text
    || payload.output_text
    || payload.data?.text
    || payload.result?.text
    || "";
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      return item?.text || item?.content || "";
    }).join("\n");
  }
  if (content && typeof content === "object") {
    return content.text || content.content || JSON.stringify(content);
  }
  return content;
}

function stripThinking(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
