import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { createVideoJob, getJob, retryMaterialSync } from "./jobs.js";
import {
  generateLibraryScript,
  rewriteProductCopy,
} from "./providers/deepseek.js";
import {
  createId,
  ensureDir,
  jsonResponse,
  readRequestJson,
  repairedFramePublicPath,
} from "./utils.js";
import {
  apiError,
  authenticateRequest,
  createOrder,
  getAccount,
  getOrder,
  listLedger,
  listProducts,
  refundReservation,
  reservePoints,
  settleReservation,
  signInDevelopment,
} from "./billing/runtime.js";
import {
  getMaterialLibraryStatus,
  searchMaterialLibraries,
} from "./materials/library.js";

await ensureDir(config.jobsDir);

export const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      jsonResponse(res, 204, {});
      return;
    }

    const url = new URL(req.url || "/", config.publicBaseUrl);

    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, {
        ok: true,
        executionMode: config.localDirect ? "local-direct" : "cloud",
        billing: {
          enabled: config.billing.enabled,
          mode: config.localDirect ? "local" : config.billing.devMode ? "development" : "production",
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/auth/login") {
      const body = await readRequestJson(req);
      const session = await signInDevelopment({
        email: body.email,
        name: body.name,
        deviceId: body.deviceId,
      });
      jsonResponse(res, 200, session);
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/account") {
      const user = await authenticateRequest(req);
      jsonResponse(res, 200, { account: await getAccount(user.id) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/wallet/ledger") {
      const user = await authenticateRequest(req);
      jsonResponse(res, 200, {
        entries: await listLedger(user.id, url.searchParams.get("limit")),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/billing/products") {
      jsonResponse(res, 200, await listProducts());
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/v1/material-libraries/status"
    ) {
      await authenticateRequest(req);
      jsonResponse(res, 200, await getMaterialLibraryStatus());
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/billing/orders") {
      const user = await authenticateRequest(req);
      const body = await readRequestJson(req);
      const order = await createOrder(user.id, body);
      jsonResponse(res, 201, { order, account: await getAccount(user.id) });
      return;
    }

    const billingOrderMatch = url.pathname.match(
      /^\/v1\/billing\/orders\/([^/]+)$/,
    );
    if (req.method === "GET" && billingOrderMatch) {
      const user = await authenticateRequest(req);
      const order = await getOrder(
        user.id,
        decodeURIComponent(billingOrderMatch[1]),
      );
      jsonResponse(res, 200, { order, account: await getAccount(user.id) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/video-jobs") {
      const user = await authenticateRequest(req);
      const body = await readRequestJson(req);
      const inputUrl = String(body.url || "").trim();
      if (!inputUrl) {
        jsonResponse(res, 400, { error: "缺少 url。" });
        return;
      }
      const requestId = createId("analysis");
      const reservation = await reservePoints(
        user.id,
        config.billing.analyzeCost,
        {
          referenceType: "video_analysis",
          referenceId: requestId,
          note: "视频拆解",
        },
      );
      let job;
      try {
        job = createVideoJob({
          url: inputUrl,
          options: body.options || {},
          userId: user.id,
          reservationId: reservation?.id || "",
        });
      } catch (error) {
        await refundReservation(reservation?.id);
        throw error;
      }
      jsonResponse(res, 202, publicJob(job));
      return;
    }

    const jobMatch = url.pathname.match(/^\/v1\/video-jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = getJob(jobMatch[1]);
      if (!job) {
        jsonResponse(res, 404, { error: "任务不存在。" });
        return;
      }
      const user = await authenticateRequest(req);
      if (!user.localDirect && job.userId && job.userId !== user.id) {
        jsonResponse(res, 403, { error: "无权查看该任务。" });
        return;
      }
      jsonResponse(res, 200, publicJob(job));
      return;
    }

    const materialSyncMatch = url.pathname.match(
      /^\/v1\/video-jobs\/([^/]+)\/sync-material$/,
    );
    if (req.method === "POST" && materialSyncMatch) {
      const job = getJob(materialSyncMatch[1]);
      if (!job) {
        jsonResponse(res, 404, { error: "任务不存在。" });
        return;
      }
      const user = await authenticateRequest(req);
      if (!user.localDirect && job.userId && job.userId !== user.id) {
        jsonResponse(res, 403, { error: "无权操作该任务。" });
        return;
      }
      await retryMaterialSync(job);
      jsonResponse(res, 200, publicJob(job));
      return;
    }

    const rewriteMatch = url.pathname.match(
      /^\/v1\/video-jobs\/([^/]+)\/rewrite$/,
    );
    if (req.method === "POST" && rewriteMatch) {
      const job = getJob(rewriteMatch[1]);
      if (!job) {
        jsonResponse(res, 404, { error: "任务不存在。" });
        return;
      }
      const user = await authenticateRequest(req);
      if (!user.localDirect && job.userId && job.userId !== user.id) {
        jsonResponse(res, 403, { error: "无权操作该任务。" });
        return;
      }
      if (job.status !== "done" || !job.result) {
        jsonResponse(res, 409, { error: "请先完成视频拆解，再生成产品仿写。" });
        return;
      }
      const body = await readRequestJson(req);
      const referenceId = createId("rewrite");
      const reservation = await reservePoints(
        user.id,
        config.billing.rewriteCost,
        {
          referenceType: "product_rewrite",
          referenceId,
          note: "产品仿写",
        },
      );
      try {
        const rewrite = await rewriteProductCopy({
          job,
          product: normalizeProduct(body.product || {}),
          reservationId: reservation?.id || "",
        });
        await settleReservation(reservation?.id);
        jsonResponse(res, 200, {
          rewrite: {
            html: redactServiceNames(rewrite.html || ""),
            text: redactServiceNames(rewrite.text || ""),
          },
          account: await getAccount(user.id),
        });
      } catch (error) {
        await refundReservation(reservation?.id);
        throw error;
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/library-scripts") {
      const user = await authenticateRequest(req);
      const body = await readRequestJson(req);
      const product = normalizeProduct(body.product || {});
      if (!product.name && !product.sellingPoints) {
        jsonResponse(res, 400, { error: "至少填写产品名或核心卖点。" });
        return;
      }
      const referenceId = createId("library-script");
      const reservation = await reservePoints(
        user.id,
        config.billing.libraryScriptCost,
        {
          referenceType: "library_script",
          referenceId,
          note: "素材库创作",
        },
      );
      try {
        const materials = await searchMaterialLibraries({
          query: clean(body.query),
          product,
          limit: 12,
          source: normalizeLibrarySource(body.source),
        });
        if (!materials.length) {
          const sourceLabel =
            body.source === "platform"
              ? "平台素材库"
              : body.source === "user"
                ? "自建素材库"
                : "所选素材库";
          throw apiError(
            409,
            `${sourceLabel}中暂时没有可用素材，请检查连接状态或更换检索范围。`,
          );
        }
        const rewrite = await generateLibraryScript({
          product,
          materials,
          reservationId: reservation?.id || "",
        });
        await settleReservation(reservation?.id);
        jsonResponse(res, 200, {
          rewrite: {
            html: redactServiceNames(rewrite.html || ""),
            text: redactServiceNames(rewrite.text || ""),
            materialIds: rewrite.materialIds || [],
          },
          materials: materials.map(({ score, ...item }) => item),
          account: await getAccount(user.id),
        });
      } catch (error) {
        await refundReservation(reservation?.id);
        throw error;
      }
      return;
    }

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      url.pathname.startsWith("/jobs/")
    ) {
      serveJobFile(url.pathname, req, res);
      return;
    }

    jsonResponse(res, 404, { error: "Not found" });
  } catch (error) {
    jsonResponse(res, Number(error?.statusCode) || 500, {
      error: publicError(
        error instanceof Error ? error.message : String(error),
      ),
    });
  }
});

await new Promise((resolve, reject) => {
  const onError = (error) => reject(error);
  server.once("error", onError);
  server.listen(config.port, "127.0.0.1", () => {
    server.off("error", onError);
    console.log(
      `Douyin Director prototype API listening on ${config.publicBaseUrl}`,
    );
    resolve();
  });
});

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    inputUrl: job.inputUrl,
    title: job.title || "",
    pageUrl: job.pageUrl || "",
    error: publicError(job.error || ""),
    result: publicResult(job.result),
    billing: job.reservationId
      ? { reservationId: job.reservationId }
      : undefined,
  };
}

function publicResult(result) {
  if (!result) return result;
  return {
    jobId: result.jobId,
    title: result.title,
    inputUrl: result.inputUrl,
    pageUrl: result.pageUrl,
    videoPath: result.videoPath,
    frameRateFps: result.frameRateFps,
    frames: Array.isArray(result.frames)
      ? result.frames.map((frame) => ({
          index: frame.index,
          name: frame.name,
          publicPath: repairedFramePublicPath(result.jobId, frame),
          secondIndex: frame.secondIndex,
          frameInSecond: frame.frameInSecond,
          capturedAtSec: frame.capturedAtSec,
        }))
      : [],
    analysis: {
      html: redactServiceNames(result.analysis?.html || ""),
      markdown: redactServiceNames(result.analysis?.markdown || ""),
    },
    materialSync: result.materialSync
      ? {
          configured: Boolean(result.materialSync.configured),
          synced: Boolean(result.materialSync.synced),
          state: result.materialSync.state || "",
          exists: Boolean(result.materialSync.exists),
          isNew: Boolean(result.materialSync.isNew),
          upgraded: Boolean(result.materialSync.upgraded),
          materialId: result.materialSync.materialId || "",
          segmentCount: Number(result.materialSync.segmentCount || 0),
          shotCount: Number(result.materialSync.shotCount || 0),
          message: publicError(result.materialSync.message || ""),
        }
      : undefined,
  };
}

function publicError(value) {
  return redactServiceNames(value)
    .replace(/内容分析服务\s+analysis failed/gi, "内容分析服务暂时不可用")
    .replace(/内容分析服务\s+rewrite failed/gi, "内容分析服务暂时不可用")
    .replace(
      /视频理解服务\s+(?:failed|request failed)/gi,
      "视频理解服务暂时不可用",
    )
    .replace(
      /语音识别服务\s+(?:submit|query) failed/gi,
      "语音识别服务暂时不可用",
    );
}

function redactServiceNames(value) {
  return String(value || "")
    .replace(/MiniMax(?:-M3)?/gi, "视频理解服务")
    .replace(/\bdeepseek(?:[-_ ][a-z0-9._-]+)?\b/gi, "内容分析服务")
    .replace(/\bvolcano(?:\s+ASR)?\b/gi, "语音识别服务")
    .replace(/火山(?:引擎)?(?:\s*ASR)?/gi, "语音识别服务")
    .replace(/volc\.seedasr\.auc/gi, "语音识别服务");
}

function normalizeProduct(product) {
  return {
    name: clean(product.name),
    category: clean(product.category),
    audience: clean(product.audience),
    sellingPoints: clean(product.sellingPoints),
    scenes: clean(product.scenes),
    offer: clean(product.offer),
    tone: clean(product.tone),
    mustSay: clean(product.mustSay),
    mustAvoid: clean(product.mustAvoid),
    duration: clean(product.duration),
  };
}

function normalizeLibrarySource(value) {
  const source = String(value || "")
    .trim()
    .toLowerCase();
  return ["platform", "user"].includes(source) ? source : "both";
}

function clean(value) {
  return String(value || "")
    .trim()
    .slice(0, 1200);
}

function serveJobFile(requestPath, req, res) {
  const relative = decodeURIComponent(requestPath.replace(/^\/jobs\//, ""));
  const root = path.resolve(config.jobsDir);
  const target = path.resolve(root, relative);
  const relativeTarget = path.relative(root, target);
  if (
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    jsonResponse(res, 403, { error: "Forbidden" });
    return;
  }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    jsonResponse(res, 404, { error: "File not found" });
    return;
  }

  const stat = fs.statSync(target);
  const ext = path.extname(target).toLowerCase();
  const type =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".wav"
        ? "audio/wav"
        : ext === ".mp4"
          ? "video/mp4"
          : "application/octet-stream";

  const baseHeaders = {
    "content-type": type,
    "accept-ranges": "bytes",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-disposition": `inline; filename="${path.basename(target).replace(/"/g, "")}"`,
  };
  const range = parseByteRange(req.headers.range, stat.size);
  if (range === null && req.headers.range) {
    res.writeHead(416, {
      ...baseHeaders,
      "content-range": `bytes */${stat.size}`,
    });
    res.end();
    return;
  }

  if (range) {
    const contentLength = range.end - range.start + 1;
    res.writeHead(206, {
      ...baseHeaders,
      "content-length": contentLength,
      "content-range": `bytes ${range.start}-${range.end}/${stat.size}`,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(target, { start: range.start, end: range.end }).pipe(
      res,
    );
    return;
  }

  res.writeHead(200, {
    ...baseHeaders,
    "content-length": stat.size,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(target).pipe(res);
}


function parseByteRange(header, size) {
  if (!header) return undefined;
  const match = String(header).match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;

  let start = match[1] ? Number(match[1]) : undefined;
  let end = match[2] ? Number(match[2]) : undefined;
  if (start === undefined && end === undefined) return null;

  if (start === undefined) {
    const suffixLength = Math.min(end, size);
    start = size - suffixLength;
    end = size - 1;
  } else {
    end = end === undefined ? size - 1 : Math.min(end, size - 1);
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }
  return { start, end };
}
