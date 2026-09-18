import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clearManagedJobsDir,
  customJobsDir,
  getStorageInfo,
  prepareManagedJobsDir,
  readJobsDirSetting,
  saveJobsDirSetting
} from "../desktop/storage.js";
import {
  repairedFramePublicPath,
  toPublicPath,
} from "../server/utils.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-director-storage-test-"));
try {
  const userData = path.join(root, "user-data");
  const parent = path.join(root, "selected-parent");
  fs.mkdirSync(parent, { recursive: true });

  const jobsDir = prepareManagedJobsDir(customJobsDir(parent));
  saveJobsDirSetting(userData, jobsDir);
  assert.equal(readJobsDirSetting(userData), jobsDir);

  const taskDir = path.join(jobsDir, "video-test");
  const framesDir = path.join(taskDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "video.mp4"), Buffer.alloc(4096));
  const framePath = path.join(framesDir, "frame-0001.jpg");
  fs.writeFileSync(framePath, Buffer.alloc(512));
  assert.equal(
    toPublicPath("video-test", framePath),
    "/jobs/video-test/frames/frame-0001.jpg",
  );
  assert.equal(
    repairedFramePublicPath("video-test", {
      name: "frame-0001.jpg",
      publicPath: "/jobs/video-test/frame-0001.jpg",
    }),
    "/jobs/video-test/frames/frame-0001.jpg",
  );

  const before = await getStorageInfo(jobsDir, userData);
  assert.equal(before.isCustom, true);
  assert.equal(before.taskCount, 1);
  assert.ok(before.bytes >= 4096);

  await clearManagedJobsDir(jobsDir);
  const after = await getStorageInfo(jobsDir, userData);
  assert.equal(after.taskCount, 0);
  assert.equal(after.bytes, 0);
  assert.throws(() => prepareManagedJobsDir(path.parse(jobsDir).root), /不安全/);

  const occupiedParent = path.join(root, "occupied");
  const occupiedJobs = customJobsDir(occupiedParent);
  fs.mkdirSync(occupiedJobs, { recursive: true });
  fs.writeFileSync(path.join(occupiedJobs, "personal.txt"), "keep");
  assert.throws(() => prepareManagedJobsDir(occupiedJobs), /非本程序管理/);
  assert.equal(fs.readFileSync(path.join(occupiedJobs, "personal.txt"), "utf8"), "keep");

  console.log("Storage settings checks passed");
} finally {
  const resolved = path.resolve(root);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
