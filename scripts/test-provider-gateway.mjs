import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

process.env.VISION_PROVIDER = "minimax";
process.env.LOCAL_DIRECT_MODE = "false";

const {
  analyzeWithDeepSeek,
  extractMaterialStructure,
  generateLibraryScript,
  rewriteProductCopy,
} = await import("../server/providers/deepseek.js");
const { transcribeAudio } = await import("../server/providers/asr.js");
const { configureProviderGateway } = await import(
  "../server/providers/gateway.js"
);
const { describeFrames } = await import("../server/providers/vision.js");

const calls = [];
const reservationId = "reservation-gateway-test";
const adapter = {
  configured: true,
  async callProvider(operation, payload, receivedReservationId) {
    assert.equal(receivedReservationId, reservationId);
    calls.push({ operation, payload });
    if (operation === "volcano_asr")
      return {
        provider: "cloud",
        available: true,
        fullText: "真实口播",
        segments: [{ text: "真实口播", startMs: 0, endMs: 800 }],
      };
    if (operation === "minimax_vision")
      return {
        choices: [
          {
            message: {
              content:
                '{"description":"产品特写","subtitle":"真实字幕","shot_type":"近景"}',
            },
          },
        ],
      };
    if (operation === "deepseek_material")
      return { choices: [{ message: { content: "{}" } }] };
    return {
      choices: [
        {
          message: {
            content:
              '<section class="report-doc"><h1>网关结果</h1><p>真实口播</p></section>',
          },
        },
      ],
    };
  },
};
configureProviderGateway(adapter);

const testRoot = path.resolve("artifacts", "provider-gateway-test");
await fs.rm(testRoot, { recursive: true, force: true });
await fs.mkdir(testRoot, { recursive: true });
const audioPath = path.join(testRoot, "audio.wav");
const framePath = path.join(testRoot, "frame.jpg");
await fs.writeFile(audioPath, Buffer.from("RIFF-test-audio"));
await fs.writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

const asr = await transcribeAudio({ audioPath, reservationId });
assert.equal(asr.fullText, "真实口播");
const allFrames = Array.from({ length: 261 }, (_, index) => ({
  name: `frame-${String(index + 1).padStart(4, "0")}.jpg`,
  filePath: framePath,
  publicPath: `/jobs/test/frame-${index + 1}.jpg`,
  capturedAtSec: Number((index / 5).toFixed(1)),
}));
const vision = await describeFrames({
  frames: allFrames,
  reservationId,
});
assert.match(vision.fullText, /产品特写/);
assert.equal(vision.coverage.complete, true);
assert.equal(vision.coverage.requestedFrames, 261);
assert.equal(vision.coverage.analyzedFrames, 261);

const job = {
  id: "job-1",
  reservationId,
  inputUrl: "https://www.douyin.com/video/test",
  result: null,
};
const analysis = await analyzeWithDeepSeek({ job, frames: [], asr, vision });
job.result = { analysis, asr, vision };
assert.match(analysis.html, /网关结果/);

const rewrite = await rewriteProductCopy({
  job,
  product: { name: "测试产品", sellingPoints: "真实卖点" },
  reservationId,
});
assert.match(rewrite.html, /网关结果/);

await generateLibraryScript({
  product: { name: "测试产品", sellingPoints: "真实卖点" },
  materials: Array.from({ length: 12 }, (_, index) => ({
    id: `material-${index + 1}`,
    originalText: `素材原文${index + 1}${"很长的原文".repeat(120)}`,
    visualDescription: "画面描述".repeat(80),
    reuseRule: "复用规则".repeat(80),
  })),
  reservationId,
});
await extractMaterialStructure({ result: job.result, reservationId });

assert.ok(calls.some((item) => item.operation === "volcano_asr"));
assert.equal(
  calls.filter((item) => item.operation === "minimax_vision").length,
  14,
);
assert.ok(calls.some((item) => item.operation === "deepseek_analysis"));
assert.ok(calls.some((item) => item.operation === "deepseek_rewrite"));
assert.ok(calls.some((item) => item.operation === "deepseek_library_script"));
const libraryCall = calls.find((item) => item.operation === "deepseek_library_script");
const libraryRequest = libraryCall.payload.request;
const libraryPrompt = libraryRequest.messages.at(-1).content;
assert.equal(libraryRequest.max_completion_tokens, 3600);
assert.deepEqual(libraryRequest.thinking, { type: "disabled" });
assert.match(libraryPrompt, /material-8/);
assert.doesNotMatch(libraryPrompt, /material-9/);
assert.ok(libraryPrompt.length < 15_000, `Library prompt too long: ${libraryPrompt.length}`);
assert.equal(
  calls.filter((item) => item.operation === "deepseek_material").length,
  6,
);

configureProviderGateway({
  configured: true,
  async callProvider() {
    throw Object.assign(new Error("无法连接云端账户服务：fetch failed"), {
      statusCode: 503,
      transportFailure: true,
    });
  },
});
await assert.rejects(
  transcribeAudio({ audioPath, reservationId }),
  /fetch failed/,
);

configureProviderGateway(null);
await fs.rm(testRoot, { recursive: true, force: true });
console.log("All AI provider paths use the authenticated cloud gateway");
