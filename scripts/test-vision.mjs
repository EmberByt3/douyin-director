import assert from "node:assert/strict";
import {
  buildFrameBatchPayload,
  buildFrameBatches,
  buildFrameCoverage,
} from "../server/providers/vision.js";

const frames = Array.from({ length: 261 }, (_, index) => ({
  name: `frame-${String(index + 1).padStart(4, "0")}.jpg`,
  filePath: `/frames/${index + 1}.jpg`,
  publicPath: `/jobs/test/frames/${index + 1}.jpg`,
  capturedAtSec: Number((index / 5).toFixed(1)),
}));
const batches = buildFrameBatches(frames, 19);
assert.equal(batches.length, 14);
assert.ok(batches.every((batch) => batch.length <= 19));
assert.deepEqual(batches.flat().map((frame) => frame.name), frames.map((frame) => frame.name));
assert.equal(batches[0][0].capturedAtSec, 0);
assert.equal(batches.at(-1).at(-1).capturedAtSec, 52);

const payload = buildFrameBatchPayload({
  images: batches[0].map((frame) => ({ frame, base64: "AA==" })),
  batchIndex: 0,
  totalBatches: batches.length,
});
assert.equal(payload.messages[0].content.length, 20);
assert.match(payload.messages[0].content[0].text, /逐张检查全部图片/);
assert.match(payload.messages[0].content[0].text, /图19=3\.6s/);

const completeResults = batches.map((batch, batchIndex) => ({
  batchIndex,
  frameCount: batch.length,
  startSec: batch[0].capturedAtSec,
  endSec: batch.at(-1).capturedAtSec,
  summary: "已检查",
}));
const complete = buildFrameCoverage(completeResults, 52.2, frames.length);
assert.equal(complete.complete, true);
assert.equal(complete.requestedFrames, 261);
assert.equal(complete.analyzedFrames, 261);
assert.deepEqual(complete.failedBatches, []);

const partialResults = completeResults.map((item) => ({ ...item }));
partialResults[4].summary = "";
partialResults[4].error = "timeout";
const partial = buildFrameCoverage(partialResults, 52.2, frames.length);
assert.equal(partial.complete, false);
assert.equal(partial.analyzedFrames, 242);
assert.deepEqual(partial.failedBatches, [5]);

console.log("All-frame vision batching tests passed");
