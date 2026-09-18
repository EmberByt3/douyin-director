import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const html = read("desktop/renderer/index.html");
const renderer = read("desktop/renderer/app.js");
const css = read("desktop/renderer/popup.css");
const preload = read("desktop/preload.cjs");
const main = read("desktop/main.js");

for (const id of [
  "openLibraryGuide",
  "libraryGuideOverlay",
  "libraryGuideBackdrop",
  "closeLibraryGuide",
  "copyLibraryPermissions",
  "goToLibraryBinding",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  assert.match(renderer, new RegExp(id), `renderer does not bind #${id}`);
}

for (let step = 1; step <= 7; step += 1) {
  assert.match(
    html,
    new RegExp(`id=["']libraryGuideStep${step}["']`),
    `missing guide step ${step}`,
  );
}

for (const requiredText of [
  "查看、评论、编辑和管理多维表格",
  "bitable:app",
  "wiki:node:read",
  "添加文档应用",
  "可管理",
  "无需机器人",
  "无需事件订阅",
  "无需回调地址",
  "无需公网服务器",
  "视频主表、素材片段表、镜头执行表、产品表、数据复盘表",
]) {
  assert.ok(html.includes(requiredText), `missing guide text: ${requiredText}`);
}

assert.match(css, /\.setup-guide-overlay/);
assert.match(css, /\.setup-guide-drawer/);
assert.match(css, /\.guide-step/);
assert.match(preload, /materials:open-guide-link/);
assert.match(main, /MATERIAL_GUIDE_URLS/);
assert.match(main, /https:\/\/open\.feishu\.cn\/app/);
assert.doesNotMatch(
  main,
  /materials:open-guide-link[\s\S]{0,500}new URL\(String\(key/,
  "guide IPC must not accept an arbitrary URL",
);

console.log("Feishu material library guide checks passed.");
