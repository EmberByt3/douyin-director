import assert from "node:assert/strict";
import fs from "node:fs";

const renderer = fs.readFileSync("desktop/renderer/app.js", "utf8");
const css = fs.readFileSync("desktop/renderer/popup.css", "utf8");

assert.doesNotMatch(renderer, /groupFramesBySecond\([^)]*\)\.slice\(0,\s*18\)/);
assert.match(renderer, /group\.frames\.map\(\(frame, index\)/);
assert.match(renderer, /addEventListener\("wheel"/);
assert.match(renderer, /event\.deltaY >= 0 \? 1 : -1/);
assert.match(renderer, /frame\.capturedAtSec/);
assert.match(css, /\.frame-stack-image[\s\S]*?object-fit:\s*contain/);
assert.match(css, /\.frame-dots i\.is-active/);
assert.match(css, /aspect-ratio:\s*9\s*\/\s*16/);

console.log("Five-frame stack UI checks passed");
