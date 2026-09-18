import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { callProvider, hasProviderGateway } from "./gateway.js";

const VOLCANO_SUCCESS = "20000000";
const VOLCANO_PROCESSING = new Set(["20000001", "20000002"]);
const VOLCANO_SILENCE = "20000003";
const VOLCANO_AUDIO_DOWNLOAD_FAILED = "45000006";

export async function transcribeAudio({ audioPath, reservationId }) {
  if (config.asr.provider !== "volcano") {
    return unavailableAsr(`ASR_PROVIDER=${config.asr.provider} is not supported in this build.`);
  }

  try {
    if (hasProviderGateway())
      return await transcribeWithGateway({ audioPath, reservationId });
    return await transcribeWithVolcano({ audioPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "语音转写失败。");
    if (hasProviderGateway() || config.asr.required) throw error;
    return unavailableAsr(message);
  }
}

async function transcribeWithGateway({ audioPath, reservationId }) {
  const audioBuffer = await fs.readFile(audioPath);
  const maxBytes = Math.max(1, Number(config.volcano.directUploadMaxMb || 64)) * 1024 * 1024;
  if (audioBuffer.length > maxBytes)
    throw new Error(`音频文件超过云端识别上限（${Math.ceil(audioBuffer.length / 1024 / 1024)} MB）。`);
  return callProvider(
    "volcano_asr",
    {
      audioBase64: audioBuffer.toString("base64"),
      language: config.volcano.language,
      format: inferAudioFormat(audioPath),
    },
    reservationId,
  );
}

async function transcribeWithVolcano({ audioPath }) {
  if (!config.volcano.apiKey) {
    throw new Error("Volcano ASR is missing VOLCANO_ASR_API_KEY.");
  }

  const audioBuffer = await fs.readFile(audioPath);
  const maxBytes = Math.max(1, Number(config.volcano.directUploadMaxMb || 95)) * 1024 * 1024;
  if (audioBuffer.length > maxBytes) {
    throw new Error(`音频文件超过直传上限（${Math.ceil(audioBuffer.length / 1024 / 1024)} MB）。`);
  }

  const requestId = crypto.randomUUID();
  const submitResponse = await fetch(config.volcano.submitUrl, {
    method: "POST",
    headers: buildVolcanoHeaders(requestId, true),
    body: JSON.stringify({
      user: {
        uid: "douyin-director-prototype"
      },
      audio: {
        data: audioBuffer.toString("base64"),
        language: config.volcano.language,
        format: inferAudioFormat(audioPath)
      },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
        enable_ddc: true,
        show_utterances: true
      }
    })
  });
  await assertVolcanoAccepted(submitResponse, "submit");

  const startedAt = Date.now();
  while (Date.now() - startedAt < config.volcano.timeoutMs) {
    await sleep(config.volcano.pollIntervalMs);

    const queryResponse = await fetch(config.volcano.queryUrl, {
      method: "POST",
      headers: buildVolcanoHeaders(requestId, false),
      body: "{}"
    });

    const statusCode = queryResponse.headers.get("x-api-status-code") || "";
    const message = queryResponse.headers.get("x-api-message") || "";
    const payload = await queryResponse.json().catch(() => ({}));

    if (statusCode === VOLCANO_SUCCESS) {
      return normalizeVolcanoResult(payload, requestId);
    }

    if (VOLCANO_PROCESSING.has(statusCode)) {
      continue;
    }

    if (statusCode === VOLCANO_SILENCE) {
      return {
        provider: "volcano",
        available: false,
        fullText: "",
        segments: [],
        requestId,
        raw: payload,
        note: "Volcano ASR detected silent audio or no human speech."
      };
    }

    if (statusCode === VOLCANO_AUDIO_DOWNLOAD_FAILED && /audio download failed|Invalid audio URI/i.test(message)) {
      const error = new Error("火山 ASR 无法下载当前公网音频地址，准备自动更换通道。");
      error.code = "VOLCANO_AUDIO_DOWNLOAD_FAILED";
      throw error;
    }

    throw new Error(`Volcano ASR query failed: ${statusCode || queryResponse.status} ${message} ${JSON.stringify(payload).slice(0, 600)}`);
  }

  throw new Error(`Volcano ASR timed out after ${Math.round(config.volcano.timeoutMs / 1000)}s.`);
}

async function assertVolcanoAccepted(response, phase) {
  const statusCode = response.headers.get("x-api-status-code") || "";
  const message = response.headers.get("x-api-message") || "";
  if (response.ok && statusCode === VOLCANO_SUCCESS) {
    return;
  }

  const payloadText = await response.text().catch(() => "");
  throw new Error(`Volcano ASR ${phase} failed: ${statusCode || response.status} ${message} ${payloadText.slice(0, 600)}`);
}

function buildVolcanoHeaders(requestId, includeSequence) {
  return {
    "content-type": "application/json",
    "X-Api-Key": config.volcano.apiKey,
    "X-Api-Resource-Id": config.volcano.resourceId,
    "X-Api-Request-Id": requestId,
    ...(includeSequence ? { "X-Api-Sequence": "-1" } : {})
  };
}

function normalizeVolcanoResult(payload, requestId) {
  const result = payload.result || {};
  const utterances = Array.isArray(result.utterances) ? result.utterances : [];
  const segments = utterances.map((item) => ({
    text: item.text || "",
    startMs: item.start_time,
    endMs: item.end_time,
    definite: item.definite
  })).filter((item) => item.text);

  const fullText = result.text || segments.map((item) => item.text).join("");
  return {
    provider: "volcano",
    available: Boolean(fullText),
    fullText,
    segments,
    requestId,
    audioInfo: payload.audio_info || null,
    raw: payload
  };
}

function inferAudioFormat(audioPath) {
  const ext = path.extname(audioPath || "").replace(".", "").toLowerCase();
  return ext || "wav";
}

function unavailableAsr(note) {
  return {
    provider: config.asr.provider || "unknown",
    available: false,
    fullText: "",
    segments: [],
    note
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
