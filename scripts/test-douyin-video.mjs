import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateDouyinPage, mediaFromDetail } from "../desktop/douyin-video-data.js";
import { configureBrowserVideoDownloader, resolveVideoUrl, downloadExternalVideo, sanitizeDownloaderLog } from "../server/downloader.js";

for (const url of ["https://v.douyin.com/abc/", "https://www.douyin.com/video/123"]) assert.ok(validateDouyinPage(url));
for (const url of ["file:///tmp/test", "https://evil-douyin.com/video/123", "https://douyin.com.evil.test/", "https://user:secret@www.douyin.com/"]) {
  assert.throws(() => validateDouyinPage(url));
}
const detail = { aweme_detail: { aweme_id: "123", desc: "作品", video: { play_addr: { url_list: ["http://cdn.test/a", "https://cdn.test/a"] } } } };
assert.equal(mediaFromDetail(detail, "456"), null, "Never return a recommended video's media");
assert.equal(mediaFromDetail({ aweme_detail: null }, "123"), null);
assert.deepEqual(mediaFromDetail(detail, "123"), {videoUrl:"https://cdn.test/a",title:"作品",awemeId:"123"});
const privateValue = "session/private+value";
const redacted = sanitizeDownloaderLog(`session=${privateValue}\nencoded=${encodeURIComponent(privateValue)}\nhttps://cdn.test/video?signature=secret\nAuthorization: Bearer token`, `sessionid=${privateValue}`);
assert.ok(!redacted.includes(privateValue) && !redacted.includes("signature=secret") && !redacted.includes("Bearer token"));

const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "douyin-browser-download-"));
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = () => { throw new Error("Desktop must use its browser session without prefetching in Node"); };
  configureBrowserVideoDownloader(async ({sourceUrl, targetDir, log}) => {
    assert.equal(sourceUrl, "https://v.douyin.com/abc/");
    log("test-video", "bytes=2048");
    const file = path.join(targetDir, "test.mp4");
    await fs.writeFile(file, Buffer.alloc(2048));
    return file;
  });
  const result = await resolveVideoUrl("复制这个链接 https://v.douyin.com/abc/ 打开抖音");
  assert.equal(result.sourceUrl, "https://v.douyin.com/abc/");
  assert.equal(result.externalDownloader, "jiji262");
  const downloaded = await downloadExternalVideo({sourceUrl:result.sourceUrl,targetDir:testDir});
  assert.equal((await fs.stat(downloaded)).size, 2048);
  assert.match(await fs.readFile(path.join(testDir,"downloader.log"),"utf8"), /test-video/);
  await assert.rejects(fs.stat(path.join(testDir,"jiji262.config.yml")), {code:"ENOENT"});
  configureBrowserVideoDownloader(async () => { throw new Error("作品页不可用"); });
  await assert.rejects(downloadExternalVideo({sourceUrl:result.sourceUrl,targetDir:testDir}), /作品页不可用/);
  assert.match(await fs.readFile(path.join(testDir,"downloader.log"),"utf8"), /browser-download-failed/);
  assert.equal((await resolveVideoUrl("https://cdn.test/movie.mp4")).videoUrl, "https://cdn.test/movie.mp4");
} finally {
  globalThis.fetch = originalFetch;
  configureBrowserVideoDownloader(null);
  await fs.rm(testDir, {recursive:true,force:true});
}
console.log("Douyin browser download routing, identity and diagnostics checks passed");
