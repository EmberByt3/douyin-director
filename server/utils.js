import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function createId(prefix = "job") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  });
  res.end(body);
}

export function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

export function safeFilename(value, fallback = "video") {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function toPublicPath(jobId, filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const marker = `/${jobId}/`;
  const index = normalized.lastIndexOf(marker);
  const relative =
    index >= 0
      ? normalized.slice(index + 1)
      : `${jobId}/${path.basename(filePath)}`;
  return `/jobs/${relative
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function repairedFramePublicPath(jobId, frame) {
  if (frame?.filePath) return toPublicPath(jobId, frame.filePath);
  if (String(frame?.publicPath || "").includes("/frames/")) {
    return frame.publicPath;
  }
  return `/jobs/${encodeURIComponent(jobId)}/frames/${encodeURIComponent(
    frame?.name || `frame-${Number(frame?.index || 0) + 1}.jpg`,
  )}`;
}
