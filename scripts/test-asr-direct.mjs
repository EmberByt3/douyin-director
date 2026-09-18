import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../server/config.js";
import { transcribeAudio } from "../server/providers/asr.js";

const audioPath = path.join(os.tmpdir(), `douyin-director-asr-${Date.now()}.wav`);
const originalFetch = global.fetch;
const originalKey = config.volcano.apiKey;
const originalRequired = config.asr.required;
const requests = [];

await fs.writeFile(audioPath, Buffer.from("RIFF-test-audio"));
config.volcano.apiKey = "test-key";
config.asr.required = true;

global.fetch = async (_url, options = {}) => {
  requests.push(JSON.parse(options.body || "{}"));
  if (requests.length === 1) {
    return response({}, "20000000", "OK");
  }
  return response({
    result: {
      text: "直传识别成功",
      utterances: [{ text: "直传识别成功", start_time: 0, end_time: 1000 }]
    }
  }, "20000000", "OK");
};

try {
  const result = await transcribeAudio({ audioPath });
  assert.equal(result.available, true);
  assert.equal(result.fullText, "直传识别成功");
  assert.ok(requests[0].audio.data);
  assert.equal(requests[0].audio.url, undefined);
  assert.equal(requests[0].audio.format, "wav");
  assert.equal(requests.length, 2);
  console.log("Direct audio ASR tests passed");
} finally {
  global.fetch = originalFetch;
  config.volcano.apiKey = originalKey;
  config.asr.required = originalRequired;
  await fs.rm(audioPath, { force: true });
}

function response(payload, statusCode, message) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-api-status-code": statusCode,
      "x-api-message": message
    }
  });
}
