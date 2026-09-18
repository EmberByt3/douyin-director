import crypto from "node:crypto";
import { config } from "../config.js";
import { appendMaterialRecords, findVideoMaterial, listMaterialSegments, testFeishuLibrary, upsertProductRecord } from "./feishu.js";
import { getUserLibraryConfig } from "./runtime.js";

export async function getMaterialLibraryStatus({ live = false } = {}) {
  const user = getUserLibraryConfig();
  const platformConfigured = Boolean(
    config.materialLibrary.platformApiUrl ||
    (config.materialLibrary.platformAppId && config.materialLibrary.platformAppSecret && config.materialLibrary.platformBaseUrl)
  );
  const status = {
    platform: {
      configured: platformConfigured,
      available: platformConfigured,
      mode: "readonly",
      label: platformConfigured ? "平台基础素材库" : "平台素材库待发布"
    },
    user: {
      configured: Boolean(user),
      available: Boolean(user),
      mode: "readwrite",
      appId: user?.appId || "",
      baseUrl: user?.baseUrl || "",
      secretConfigured: Boolean(user?.appSecret),
      label: user ? "我的飞书素材库" : "尚未连接"
    }
  };

  if (live && user) {
    try {
      const result = await testFeishuLibrary(user);
      status.user.available = true;
      status.user.label = result.name;
    } catch (error) {
      status.user.available = false;
      status.user.error = publicMessage(error);
    }
  }
  return status;
}

export async function searchMaterialLibraries({ query = "", product = {}, limit = 12, source = "both" } = {}) {
  const candidates = [];
  const normalizedSource = ["platform", "user"].includes(source) ? source : "both";
  if (normalizedSource !== "user") {
    const platform = await searchPlatform({ query, product, limit: Math.max(limit * 3, 30) }).catch(() => []);
    candidates.push(...platform.map((item) => normalizeMaterial(item, "平台基础库")));
  }

  const user = getUserLibraryConfig();
  if (user && normalizedSource !== "platform") {
    const own = await listMaterialSegments(user).catch(() => []);
    candidates.push(...own.map((item) => normalizeMaterial(item, "用户素材库")));
  }

  const searchText = [query, product.name, product.category, product.audience, product.sellingPoints, product.scenes]
    .filter(Boolean).join(" ");
  return dedupe(candidates)
    .map((item) => ({ ...item, score: scoreMaterial(item, searchText) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(30, Number(limit) || 12)));
}

export async function syncAnalysisToUserLibrary({ result, structured }) {
  const settings = getUserLibraryConfig();
  if (!settings) return { configured: false, synced: false, message: "未连接用户素材库" };

  const identity = buildMaterialIdentity(result);
  const existing = await findVideoMaterial(settings, identity);
  const needsUpgrade = Boolean(existing && existing.fields?.["结构版本"] !== "2");
  if (existing && !needsUpgrade) {
    return {
      configured: true,
      synced: true,
      exists: true,
      isNew: false,
      materialId: identity.materialId,
      recordId: existing.recordId,
      segmentCount: 0,
      message: "素材已存在，未重复入库"
    };
  }

  const materialId = identity.materialId;
  const video = structured?.video || {};
  const master = {
    "素材ID": materialId,
    "原链接": { link: result.pageUrl || result.inputUrl, text: result.title || "打开原视频" },
    "平台视频ID": identity.videoId,
    "标题": result.title || "未识别",
    "平台": "抖音",
    "视频时长秒": estimateDuration(result),
    "产品": video.product || "",
    "产品类目": listValue(video.categories),
    "目标人群": listValue(video.audiences),
    "人群": textValue(video.audiences),
    "需求场景": listValue(video.demandScenes),
    "不适用条件": video.unsuitableConditions || "",
    "视频形式": normalizeVideoForm(video.videoForm),
    "视频拍摄场景": video.shootingScene || "",
    "视频拍摄场景推荐": video.shootingSceneRecommendation || "",
    "内容原文": video.contentOriginal || result.asr?.fullText || "未识别",
    "原始口播": result.asr?.fullText || "未识别",
    "完整拆解报告": result.analysis?.markdown || "",
    "开头文案": video.openingCopy || "",
    "开头画面描述": video.openingVisual || "",
    "开头表达": video.openingExpression || "",
    "开头直接复用原则": video.openingReuseRule || "",
    "开头适用条件": video.openingConditions || "",
    "开头适用类目": listValue(video.openingCategories),
    "核心卖点": video.coreSellingPoints || "",
    "次要卖点": video.secondarySellingPoints || "",
    "卖点表达原文": video.sellingOriginal || "",
    "卖点可视化表达": video.sellingVisualization || "",
    "卖点表达复用原则": video.sellingReuseRule || "",
    "卖点表达适用条件": video.sellingConditions || "",
    "卖点表达适用类目": listValue(video.sellingCategories),
    "痛点": video.painPoints || "",
    "痛点表达原文": video.painOriginal || "",
    "痛点可视化表达形式": video.painVisualization || "",
    "痛点表达复用原则": video.painReuseRule || "",
    "痛点表达适用条件": video.painConditions || "",
    "痛点表达适用类目": listValue(video.painCategories),
    "需求表达原文": video.demandOriginal || "",
    "深层需求": video.deepNeeds || "",
    "效果可视化表达形式": video.effectVisualization || "",
    "效果表达复用原则": video.effectReuseRule || "",
    "效果表达适用条件": video.effectConditions || "",
    "效果表达适用类目": listValue(video.effectCategories),
    "证明动作表达": video.proofAction || "",
    "视频结构": video.structure || "",
    "视频结构复用原则": video.structureReuseRule || "",
    "视频结构适用条件": video.structureConditions || "",
    "视频结构适用类目": listValue(video.structureCategories),
    "收口话术": video.closing || "",
    "爆款归因": video.hitReason || "",
    "证据完整度": evidenceCompleteness(result),
    "审核状态": "未审核",
    "结构版本": "2",
    "创建时间": new Date().toISOString()
  };

  const segments = (structured?.segments || []).slice(0, 40).map((item, index) => ({
    "片段ID": `${materialId}-S${String(index + 1).padStart(2, "0")}`,
    "素材ID": materialId,
    "素材来源": "用户素材库",
    "模块类型": normalizeModule(item.moduleType),
    "开始时间秒": numeric(item.startSec),
    "结束时间秒": numeric(item.endSec),
    "口播原文": item.originalText || "",
    "屏幕文字": item.screenText || "",
    "内容原文": item.originalText || "",
    "产品": video.product || "",
    "产品类目": listValue(video.categories),
    "人群": listValue(video.audiences),
    "需求场景": listValue(video.demandScenes),
    "不适用条件": video.unsuitableConditions || "",
    "视频形式": normalizeVideoForm(video.videoForm),
    "视频拍摄场景": video.shootingScene || "",
    "视频拍摄场景推荐": video.shootingSceneRecommendation || "",
    "画面描述": item.visualDescription || "",
    "表达方式": item.expression || "",
    "可视化表达": item.visualization || "",
    "情绪标签": listValue(item.emotions),
    "心理机制": item.psychology || "",
    "复用原则": item.reuseRule || "",
    "适用类目": listValue(item.fitCategories),
    "适用人群": listValue(item.fitAudiences),
    "适用场景": listValue(item.fitScenes),
    "适用条件": item.conditions || "",
    "禁用条件": item.avoidConditions || "",
    "证据来源": normalizeEvidenceSource(item.evidenceSource),
    "识别置信度": normalizeConfidence(item.confidence),
    "审核状态": "未审核"
  }));

  const shots = (structured?.shots || []).slice(0, 30).map((item, index) => {
    const segmentIndex = Math.max(1, Math.min(segments.length || 1, Math.round(numeric(item.segmentIndex) || 1)));
    return {
      "镜头ID": `${materialId}-SH${String(index + 1).padStart(2, "0")}`,
      "素材ID": materialId,
      "片段ID": `${materialId}-S${String(segmentIndex).padStart(2, "0")}`,
      "开始时间秒": numeric(item.startSec),
      "结束时间秒": numeric(item.endSec),
      "景别": normalizeShotType(item.shotType),
      "机位与运镜": item.camera || "",
      "人物动作": item.personAction || "",
      "产品动作": item.productAction || "",
      "核心道具": item.props || "",
      "拍摄场景": item.scene || "",
      "转场方式": item.transition || "",
      "音效与音乐": item.audio || "",
      "字幕形式": item.subtitleStyle || "",
      "参考帧": item.referenceFrame || ""
    };
  });

  const written = await appendMaterialRecords(settings, { video: master, segments, shots });
  const upgraded = Boolean(written.upgraded);
  return {
    configured: true,
    synced: true,
    exists: Boolean(written.exists),
    isNew: !written.exists,
    upgraded,
    materialId,
    segmentCount: written.exists && !upgraded ? 0 : segments.length,
    shotCount: written.exists && !upgraded ? 0 : shots.length,
    message: upgraded
      ? "旧素材已升级为精细编导结构"
      : written.exists
        ? "素材已存在，未重复入库"
        : "新素材已完成拆分并入库"
  };
}

export async function inspectUserMaterial(result) {
  const settings = getUserLibraryConfig();
  if (!settings) return { configured: false, exists: false, identity: buildMaterialIdentity(result) };
  const identity = buildMaterialIdentity(result);
  const existing = await findVideoMaterial(settings, identity);
  return {
    configured: true,
    exists: Boolean(existing),
    needsUpgrade: Boolean(existing && existing.fields?.["结构版本"] !== "2"),
    existing,
    identity
  };
}

export async function syncProductToUserLibrary(product) {
  const settings = getUserLibraryConfig();
  if (!settings) return { configured: false, synced: false };
  const result = await upsertProductRecord(settings, product);
  return { configured: true, synced: true, ...result };
}

async function searchPlatform({ query, product, limit }) {
  if (config.materialLibrary.platformApiUrl) {
    const response = await fetch(`${config.materialLibrary.platformApiUrl}/v1/materials/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.materialLibrary.platformApiKey
          ? { "authorization": `Bearer ${config.materialLibrary.platformApiKey}` }
          : {})
      },
      body: JSON.stringify({ query, product, limit }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`平台素材库暂时不可用（HTTP ${response.status}）`);
    const payload = await response.json();
    return Array.isArray(payload.materials) ? payload.materials : [];
  }

  if (config.materialLibrary.platformAppId && config.materialLibrary.platformAppSecret && config.materialLibrary.platformBaseUrl) {
    return listMaterialSegments({
      appId: config.materialLibrary.platformAppId,
      appSecret: config.materialLibrary.platformAppSecret,
      baseUrl: config.materialLibrary.platformBaseUrl
    }, 500);
  }
  return [];
}

function normalizeMaterial(item, source) {
  return {
    id: String(item.id || item["片段ID"] || item["素材ID"] || item.recordId || ""),
    source,
    moduleType: String(item.moduleType || item["模块类型"] || "待审核"),
    originalText: firstText(item.originalText, item["口播原文"], item["内容原文"], item["开头文案"], item["卖点表达原文"], item["痛点表达原文"], item["需求表达原文"], item["收口话术"]),
    screenText: String(item.screenText || item["屏幕文字"] || ""),
    visualDescription: firstText(item.visualDescription, item["画面描述"], item["开头画面描述"], item["卖点可视化表达"], item["痛点可视化表达形式"], item["效果可视化表达形式"], item["证明动作表达"]),
    expression: firstText(item.expression, item["表达方式"], item["开头表达"]),
    visualization: firstText(item.visualization, item["可视化表达"], item["卖点可视化表达"], item["痛点可视化表达形式"], item["效果可视化表达形式"]),
    reuseRule: firstText(item.reuseRule, item["复用原则"], item["开头直接复用原则"], item["卖点表达复用原则"], item["痛点表达复用原则"], item["效果表达复用原则"], item["视频结构复用原则"]),
    fitCategories: firstText(item.fitCategories, item["适用类目"], item["开头适用类目"], item["卖点表达适用类目"], item["痛点表达适用类目"], item["效果表达适用类目"], item["视频结构适用类目"]),
    fitAudiences: String(item.fitAudiences || item["适用人群"] || ""),
    fitScenes: firstText(item.fitScenes, item["适用场景"], item["需求场景"], item["视频拍摄场景推荐"]),
    avoidConditions: firstText(item.avoidConditions, item["禁用条件"], item["不适用条件"]),
    product: String(item.product || item["产品"] || ""),
    productCategories: String(item.productCategories || item["产品类目"] || ""),
    audience: String(item.audience || item["人群"] || item["目标人群"] || ""),
    deepNeeds: String(item.deepNeeds || item["深层需求"] || ""),
    coreSellingPoints: String(item.coreSellingPoints || item["核心卖点"] || ""),
    proofAction: String(item.proofAction || item["证明动作表达"] || ""),
    hitReason: String(item.hitReason || item["爆款归因"] || "")
  };
}

function firstText(...values) {
  return String(values.find((value) => String(value || "").trim()) || "");
}

function scoreMaterial(item, query) {
  if (!query.trim()) return item.source === "用户素材库" ? 1 : 0.5;
  const haystack = Object.values(item).join(" ").toLowerCase();
  const terms = String(query).toLowerCase().split(/[\s,，、/]+/).filter((term) => term.length > 1);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 3 : 0), 0)
    + (item.source === "用户素材库" ? 0.25 : 0);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || `${item.moduleType}:${item.originalText}:${item.visualDescription}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractVideoId(value) {
  return String(value || "").match(/\/video\/(\d+)/)?.[1] || "";
}

function buildMaterialIdentity(result) {
  const source = result.pageUrl || result.inputUrl || result.videoUrl || result.jobId || "unknown";
  const videoId = extractVideoId(source) || extractVideoId(result.inputUrl);
  const fingerprint = videoId || crypto.createHash("sha256").update(normalizeSource(source)).digest("hex").slice(0, 20);
  return {
    videoId,
    materialId: videoId ? `DY-${videoId}` : `MAT-${fingerprint}`
  };
}

function normalizeSource(value) {
  try {
    const url = new URL(String(value));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|modeFrom|previous_page|enter_from)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return String(value || "").trim();
  }
}

function estimateDuration(result) {
  const frames = Array.isArray(result.frames) ? result.frames : [];
  return frames.length ? Math.ceil(Math.max(...frames.map((item) => Number(item.capturedAtSec || 0)))) : 0;
}

function listValue(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).slice(0, 20);
  return String(value || "").split(/[、,，/]+/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function textValue(value) {
  return listValue(value).join("、");
}

function normalizeVideoForm(value) {
  const allowed = new Set(["口播种草", "实测测评", "剧情植入", "直播切片", "其他"]);
  return allowed.has(value) ? value : "其他";
}

function normalizeEvidenceSource(value) {
  const allowed = new Set(["ASR", "视频理解", "字幕", "人工录入", "AI推断", "混合证据"]);
  return allowed.has(value) ? value : "混合证据";
}

function normalizeConfidence(value) {
  return ["高", "中", "低"].includes(value) ? value : "中";
}

function normalizeShotType(value) {
  return ["特写", "近景", "中景", "全景", "未识别"].includes(value) ? value : "未识别";
}

function evidenceCompleteness(result) {
  const hasAsr = Boolean(result.asr?.fullText?.trim());
  const hasVision = Boolean(result.vision?.fullText?.trim());
  const visualTimelineCovered = result.vision?.coverage?.complete !== false;
  if (hasAsr && hasVision && visualTimelineCovered) return "完整";
  if (hasAsr || hasVision) return "部分";
  return "不足";
}

function normalizeModule(value) {
  const allowed = new Set(["开头", "痛点", "需求", "卖点", "效果", "证明", "价格锚点", "转场", "互动", "收口"]);
  return allowed.has(value) ? value : "待审核";
}

function numeric(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function publicMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
