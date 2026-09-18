import assert from "node:assert/strict";
import { config } from "../server/config.js";
import { extractMaterialStructure } from "../server/providers/deepseek.js";

const originalFetch = global.fetch;
const originalApiKey = config.deepseek.apiKey;
const originalModel = config.deepseek.model;
const requests = [];

config.deepseek.apiKey = "test-key";
config.deepseek.model = "test-model";

global.fetch = async (_url, options = {}) => {
  const body = JSON.parse(options.body || "{}");
  requests.push(body);
  const index = requests.length;
  if (index === 1) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"video":{"product":"测试产品"' }, finish_reason: "length" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const payloads = [
    { video: { product: "测试产品", categories: ["测试类目"] } },
    { video: { openingCopy: "测试开头", openingExpression: "反差钩子" } },
    { video: { coreSellingPoints: "测试卖点", painPoints: "测试痛点" } },
    { video: { structure: "开头-卖点-证明-收口", closing: "测试收口" } },
    { segments: [{ "片段ID": "MAT-TEST-S01", "模块类型": "开头" }] },
    { shots: [{ "镜头ID": "MAT-TEST-SH01", "片段ID": "MAT-TEST-S01" }] }
  ];
  const content = JSON.stringify(payloads[index - 2]);
  return new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: "stop" }]
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

try {
  const result = await extractMaterialStructure({
    result: {
      jobId: "video_test",
      title: "测试视频",
      inputUrl: "https://example.com/video",
      asr: { available: true, fullText: "真实口播内容" },
      vision: { available: true, fullText: "真实画面内容" },
      analysis: { markdown: "结构拆解" }
    }
  });

  assert.equal(requests.length, 7);
  assert.equal(result.video.product, "测试产品");
  assert.equal(result.video.contentOriginal, "真实口播内容");
  assert.equal(result.video.openingCopy, "测试开头");
  assert.equal(result.video.coreSellingPoints, "测试卖点");
  assert.equal(result.video.structure, "开头-卖点-证明-收口");
  assert.equal(result.segments.length, 1);
  assert.equal(result.shots.length, 1);
  assert.equal(requests[0].max_tokens, 2400);
  assert.deepEqual(requests[0].thinking, { type: "disabled" });
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
  assert.equal(requests[1].max_tokens, 4800);
  assert.equal(requests[5].max_tokens, 8000);
  assert.equal(requests[6].max_tokens, 7000);
  console.log("Material structure split-request tests passed");
} finally {
  global.fetch = originalFetch;
  config.deepseek.apiKey = originalApiKey;
  config.deepseek.model = originalModel;
}
