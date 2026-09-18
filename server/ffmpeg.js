import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "./config.js";
import { ensureDir } from "./utils.js";

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-1600)}`));
    });
  });
}

export async function extractFrames({ videoPath, framesDir, frameRateFps }) {
  await ensureDir(framesDir);
  const fps = Math.max(1, Number(frameRateFps) || 5);
  const outputPattern = path.join(framesDir, "frame-%05d.jpg");
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-vf",
    `fps=${fps},scale=720:-1`,
    "-q:v",
    "3",
    outputPattern
  ]);
}

export async function extractAudio({ videoPath, audioPath }) {
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-acodec",
    "pcm_s16le",
    audioPath
  ]);
}
