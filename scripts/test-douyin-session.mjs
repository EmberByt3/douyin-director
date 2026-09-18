import assert from "node:assert/strict";
import fs from "node:fs";
import { applyEdgeHeaders, buildEdgeIdentity, isSafeLoginNavigation } from "../desktop/douyin-session.js";

const identity = buildEdgeIdentity("138.0.7204.35");
assert.match(identity.userAgent, /Windows NT 10\.0/);
assert.match(identity.userAgent, /Chrome\/138\.0\.0\.0/);
assert.match(identity.userAgent, /Edg\/138\.0\.0\.0/);
assert.doesNotMatch(identity.userAgent, /Electron/i);
assert.match(identity.clientHints["sec-ch-ua"], /Microsoft Edge/);
assert.doesNotMatch(JSON.stringify(identity.clientHints), /Electron/i);

const rewritten = applyEdgeHeaders({
  "user-agent": "Mozilla/5.0 Electron/37.0.0",
  "Sec-CH-UA": `"Electron";v="37"`,
  Accept: "text/html"
}, identity);
assert.equal(rewritten.Accept, "text/html");
assert.equal(rewritten["User-Agent"], identity.userAgent);
assert.equal(rewritten["sec-ch-ua"], identity.clientHints["sec-ch-ua"]);
assert.doesNotMatch(JSON.stringify(rewritten), /Electron/i);

const fallback = buildEdgeIdentity("invalid");
assert.match(fallback.userAgent, /Edg\/138\.0\.0\.0/);

assert.equal(isSafeLoginNavigation("https://www.douyin.com/"), true);
assert.equal(isSafeLoginNavigation("about:blank"), true);
assert.equal(isSafeLoginNavigation("bitbrowser://open?url=douyin"), false);
assert.equal(isSafeLoginNavigation("douyin://scan"), false);
assert.equal(isSafeLoginNavigation("not-a-url"), false);

const desktopMain = fs.readFileSync(
  new URL("../desktop/main.js", import.meta.url),
  "utf8",
);
assert.match(desktopMain, /on\("will-frame-navigate", blockExternalProtocol\)/);
assert.match(desktopMain, /on\("will-navigate", blockExternalProtocol\)/);

console.log("Douyin Edge identity checks passed");
