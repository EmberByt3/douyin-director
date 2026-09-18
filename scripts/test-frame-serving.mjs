import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "编导关键帧预览-"));
const jobsDir = path.join(root, "文件存储", "DouyinDirectorTasks");
const jobId = "video_custom_path_test";
const framesDir = path.join(jobsDir, jobId, "frames");
const frameName = "frame-0001.jpg";
const frameBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
fs.mkdirSync(framesDir, { recursive: true });
fs.writeFileSync(path.join(framesDir, frameName), frameBytes);

const port = await availablePort();
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    JOBS_DIR: jobsDir,
    ACCOUNT_DATA_PATH: path.join(root, "account-store.json"),
    BILLING_DEV_MODE: "true",
    PROVIDER_GATEWAY_REQUIRED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForReady(child, 15_000);
  const response = await fetch(
    `http://127.0.0.1:${port}/jobs/${jobId}/frames/${frameName}`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), frameBytes);
  console.log("Custom Chinese-path frame serving checks passed");
} finally {
  child.kill();
  const resolved = path.resolve(root);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function waitForReady(processHandle, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for local frame server."));
    }, timeoutMs);
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (!output.includes("prototype API listening")) return;
      clearTimeout(timeout);
      resolve();
    };
    processHandle.stdout.on("data", onData);
    processHandle.stderr.on("data", onData);
    processHandle.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local frame server exited early with code ${code}.`));
    });
  });
}
