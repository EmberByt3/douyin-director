import { config } from "../config.js";
import { callProvider, hasProviderGateway } from "./gateway.js";

export async function analyzeWithDeepSeek({ job, frames, asr, vision }) {
  assertEvidenceReady({ asr, vision });

  if (!hasProviderGateway() && !config.deepseek.apiKey) {
    return buildFallbackAnalysis({ frames, asr, vision });
  }

  const prompt = buildPrompt({ job, frames, asr, vision });
  const payload = await requestDeepSeek({
      model: config.deepseek.model,
      temperature: 0.12,
      thinking: { type: "disabled" },
      max_completion_tokens: 8000,
      messages: [
        {
          role: "system",
          content: [
            "你是公司的短视频编导负责人，只能依据真实采集证据写分析。",
            "原始口播只允许来自 ASR 结果，不允许从画面和字幕推测。",
            "画面、贴片、商品信息只允许来自视频理解和关键帧证据。",
            "缺失的信息必须标注“未识别”，严禁脑补。",
            "输出必须是干净的 HTML 片段，不要 Markdown，不要代码围栏，不要长表格。",
            "严禁输出 style、script、link 标签，严禁输出 CSS、JavaScript 或任何样式定义。"
          ].join("")
        },
        {
          role: "user",
          content: prompt
        }
      ]
    }, "deepseek_analysis", job.reservationId);

  const content = payload.choices?.[0]?.message?.content || "";
  const html = anonymizeServiceNames(sanitizeGeneratedHtml(content));
  if (!htmlToText(html).trim()) {
    throw new Error("内容分析服务返回了空报告，本次任务未扣除次数，请稍后重试。");
  }
  return {
    provider: "deepseek",
    model: config.deepseek.model,
    html,
    markdown: htmlToText(html),
    raw: payload
  };
}

export async function rewriteProductCopy({ job, product, reservationId }) {
  if (!job?.result?.analysis) {
    throw new Error("请先完成视频拆解，再生成产品仿写。");
  }
  if (!hasProviderGateway() && !config.deepseek.apiKey) {
    throw new Error("内容分析服务未配置，无法生成产品仿写。");
  }

  const prompt = buildRewritePrompt({ job, product });
  const payload = await requestDeepSeek({
      model: config.deepseek.model,
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: [
            "你是公司的短视频编导负责人，擅长把爆款视频结构迁移到自家产品。",
            "必须原创表达，只复用结构、节奏和编导逻辑。",
            "不能照抄原视频品牌、句子、价格和功效。",
            "输出必须是干净 HTML 片段，不要 Markdown，不要代码围栏。",
            "严禁输出 style、script、link 标签，严禁输出 CSS、JavaScript 或任何样式定义。"
          ].join("")
        },
        {
          role: "user",
          content: prompt
        }
      ]
    }, "deepseek_rewrite", reservationId);

  const html = anonymizeServiceNames(sanitizeGeneratedHtml(payload.choices?.[0]?.message?.content || ""));
  return {
    provider: "deepseek",
    model: config.deepseek.model,
    html,
    text: htmlToText(html),
    raw: payload
  };
}

export async function extractMaterialStructure({ result, reservationId }) {
  if (!hasProviderGateway() && !config.deepseek.apiKey)
    return { video: {}, segments: [], shots: [] };

  const videoGroups = [];
  for (const group of buildVideoMaterialPrompts(result)) {
    const payload = await requestStructuredJson({ ...group, reservationId });
    videoGroups.push(payload.video && typeof payload.video === "object" ? payload.video : payload);
  }
  const video = {
    contentOriginal: result.asr?.fullText || "",
    ...Object.assign({}, ...videoGroups)
  };

  const segmentPayload = await requestStructuredJson({
    label: "语义片段",
    prompt: buildSegmentMaterialPrompt(result, video),
    maxTokens: 8000,
    reservationId
  });
  const segments = Array.isArray(segmentPayload.segments) ? segmentPayload.segments : [];

  const shotPayload = await requestStructuredJson({
    label: "镜头执行",
    prompt: buildShotMaterialPrompt(result, segments),
    maxTokens: 7000,
    reservationId
  });
  const shots = Array.isArray(shotPayload.shots) ? shotPayload.shots : [];

  return { video, segments, shots };
}

async function requestStructuredJson({ label, prompt, maxTokens, reservationId }) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let payload;
    try {
      payload = await requestDeepSeek({
        model: config.deepseek.model,
        temperature: 0.04,
        max_tokens: attempt === 1 ? maxTokens : Math.min(8000, maxTokens * 2),
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              `你负责生成${label}结构化 JSON 数据。`,
              "口播原文只能逐字引用ASR；画面和字幕只能来自视频理解。",
              "缺失字段使用空字符串或空数组。只输出一个合法 JSON 对象，不要Markdown代码围栏。",
              attempt > 1 ? "上一次结果无法解析，本次必须缩短文字并确保所有括号、引号完整闭合。" : ""
            ].join("")
          },
          { role: "user", content: prompt }
        ]
      }, "deepseek_material", reservationId);
    } catch (error) {
      lastError = error;
      continue;
    }
    const choice = payload.choices?.[0] || {};
    try {
      return parseJsonObject(choice.message?.content || "", `${label}结构化`);
    } catch (error) {
      const finishReason = choice.finish_reason ? `，结束原因：${choice.finish_reason}` : "";
      lastError = new Error(`${label}返回格式不完整${finishReason}。`);
    }
  }
  throw lastError || new Error(`${label}结构化失败。`);
}

export async function generateLibraryScript({ product, materials, reservationId }) {
  if (!hasProviderGateway() && !config.deepseek.apiKey)
    throw new Error("内容分析服务未配置，无法生成素材库脚本。");
  const selectedMaterials = materials.slice(0, 8);
  const payload = await requestDeepSeek({
      model: config.deepseek.model,
      temperature: 0.38,
      thinking: { type: "disabled" },
      max_completion_tokens: 3600,
      messages: [
        {
          role: "system",
          content: [
            "你是公司的短视频编导负责人。",
            "根据素材库片段组合新的原创拍摄脚本，只借鉴结构和表达机制，不能拼接照抄原文。",
            "不得编造产品参数、价格、功效和证明。输出干净HTML片段。"
          ].join("")
        },
        { role: "user", content: buildLibraryScriptPrompt(product, selectedMaterials) }
      ]
    }, "deepseek_library_script", reservationId);
  const html = anonymizeServiceNames(sanitizeGeneratedHtml(payload.choices?.[0]?.message?.content || ""));
  return { html, text: htmlToText(html), materialIds: selectedMaterials.map((item) => item.id).filter(Boolean) };
}

async function requestDeepSeek(request, operation, reservationId) {
  if (hasProviderGateway())
    return callProvider(operation, { request }, reservationId);

  const response = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.deepseek.apiKey}`,
    },
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`内容分析服务暂时不可用（HTTP ${response.status}）。请稍后重试。`);
  return payload;
}

function assertEvidenceReady({ asr, vision }) {
  const hasAsr = Boolean(asr?.fullText?.trim()) && asr.available !== false;
  const hasVision = Boolean(vision?.fullText?.trim()) && vision.provider !== "off";

  if (hasAsr || hasVision) {
    return;
  }

  throw new Error([
    "真实证据不足，已阻止生成假报告。",
    "当前语音识别和视频理解都没有真实结果，内容分析服务不能只靠帧路径编脚本。",
    "请确认语音识别或视频理解服务可用。"
  ].join(" "));
}

function buildPrompt({ job, frames, asr, vision }) {
  const frameList = sampleEvenly(frames, 24).map((frame, index) => {
    const time = Number.isFinite(Number(frame.capturedAtSec)) ? `${frame.capturedAtSec}s` : "";
    return `${index + 1}. ${frame.name} ${time} ${frame.publicPath}`;
  }).join("\n");

  const asrSegments = Array.isArray(asr?.segments)
    ? asr.segments.slice(0, 80).map((item, index) => {
      return `${index + 1}. ${formatMs(item.startMs)}-${formatMs(item.endMs)} ${item.text || ""}`;
    }).join("\n")
    : "";

  const evidenceMode = vision?.mode === "all_frames"
    ? `5帧/秒全帧批量理解（${vision?.coverage?.analyzedFrames || 0}/${vision?.coverage?.requestedFrames || frames.length} 帧）`
    : "关键帧视觉理解";
  const visualCoverage = vision?.coverage?.complete
    ? `全部 ${vision.coverage.analyzedFrames || vision.coverage.requestedFrames || frames.length} 帧均已送入并完成理解，覆盖完整时间轴（视频约 ${vision.coverage.durationSec || "未知"} 秒）`
    : `全帧理解未完整完成（${vision?.coverage?.analyzedFrames || 0}/${vision?.coverage?.requestedFrames || frames.length} 帧；失败批次：${vision?.coverage?.failedBatches?.join("、") || "未知"}）`;
  const asrStatus = asr?.fullText?.trim()
    ? "可用"
    : `不可用：${asr?.note || asr?.error || "未获取到原始口播"}`;

  return `请基于真实证据拆解这条短视频，并输出适合公司编导阅读的 HTML 报告。
视频标题：${job.title || ""}
视频链接：${job.inputUrl || ""}
页面链接：${job.pageUrl || ""}

证据来源：
- 原始口播识别：${asrStatus}
- 视频理解：${evidenceMode}
- 视觉时间覆盖：${visualCoverage}

关键帧文件：
${frameList || "暂无"}

原始口播脚本（语音转写）：
${asr?.fullText || asr?.note || "未识别"}

口播分句时间轴：
${asrSegments || "未提供"}

视频理解证据：
${vision?.fullText || vision?.note || "未识别"}

重要边界：
- 原始口播脚本只能使用语音识别内容。
- 画面、镜头动作、贴片、商品信息只能使用视频理解和关键帧证据。
- 如果语音识别不可用，不要从画面推测口播；必须写清“原始口播未获取”及原因。
- 最终报告禁止出现任何模型名称、模型版本、服务供应商名称或接口名称。
- 证据完整度必须依据“口播覆盖”和“视觉时间覆盖”分别判断；关键帧覆盖全时段时，不得仅因逐帧未全部标注而写成“视频理解部分可用”。

输出要求：
1. 只输出 HTML 片段，不要 <html>、<head>、<body>，不要 Markdown，禁止 Markdown 表格；不要输出 style、script、CSS 或 JavaScript。
2. 使用这些结构和 class：
   - <section class="report-doc">
   - <header class="report-hero">，包含 <h1>、一句短结论、3-5 个 <span class="badge">
   - <section class="report-section evidence-grid">，用卡片说明语音识别、视频理解证据是否可用
   - <section class="report-section script-box">，标题写“原始口播脚本（语音转写）”，完整整理真实口播；转写不可用时只写失败原因
   - <section class="report-section timeline">，逐段用 <article class="shot-card"> 写时间段、画面、可见文字/贴片、原始口播、编导作用
   - <section class="report-section">，输出结构拆解，使用短列表
   - <section class="report-section template-box">，输出可复刻脚本模板
3. 每张 shot-card 控制在 5 行以内，时间线最多 10 段，合并碎片，不要逐帧堆满。
4. 画面、可见文字、原始口播必须基于对应证据；缺失写“未识别”。
5. 不要泛泛评价“视频很好”。每个编导作用都要具体到钩子、卖点、演示、信任、转化。
6. 可复刻模板必须是抽象结构，不要伪造原视频没有的价格、品牌、功效。`;
}

function buildRewritePrompt({ job, product }) {
  const result = job.result || {};
  const analysisText = result.analysis?.markdown || htmlToText(result.analysis?.html || "");
  const asrText = result.asr?.fullText || "";
  const visionText = result.vision?.fullText || "";

  return `请基于【原视频拆解】为【我的产品】生成一版原创短视频脚本。
原视频拆解：
${analysisText || "未提供"}

原视频原始口播：
${asrText || "未识别"}

原视频画面理解证据：
${visionText || "未识别"}

我的产品信息：
- 产品名：${product.name || "未填写"}
- 品类/场景：${product.category || "未填写"}
- 目标人群：${product.audience || "未填写"}
- 核心卖点：${product.sellingPoints || "未填写"}
- 使用场景/拍摄素材：${product.scenes || "未填写"}
- 价格/活动/权益：${product.offer || "未填写"}
- 语气风格：${product.tone || "自然口播、抖音带货"}
- 必须强调：${product.mustSay || "无"}
- 禁止/限制：${product.mustAvoid || "不能照抄原视频文案，不能承诺无证据功效"}
- 期望时长：${product.duration || "30秒以内"}

输出要求：
1. 只输出 HTML 片段，不要 <html>、<head>、<body>，不要 Markdown；不要输出 style、script、CSS 或 JavaScript。
2. 使用这些结构和 class：
   - <section class="rewrite-doc">
   - <header class="rewrite-hero">：一句话说明本次仿写策略，附 3-5 个 <span class="badge">
   - <section class="rewrite-section script-box">：输出“可直接口播脚本”
   - <section class="rewrite-section timeline">：用 <article class="shot-card"> 输出分镜脚本，包含时间、画面、口播、可见文字/贴片、拍摄要点
   - <section class="rewrite-section">：输出“从原片借鉴了什么”，只写结构/节奏/转化逻辑
   - <section class="rewrite-section template-box">：输出 5 条可替换钩子
3. 必须原创，不能出现原视频品牌、原产品名、原价格、原功效，除非我的产品信息里明确填写。
4. 如果我的产品信息缺失，不要编造具体参数，写成可替换占位，如【活动价】、【核心成分】。
5. 脚本要能直接给编导拍摄：镜头动作要具体，口播要顺口，转化结尾要明确。`;
}

function materialEvidence(result) {
  const segments = Array.isArray(result.asr?.segments)
    ? result.asr.segments.slice(0, 80).map((item) => `${formatMs(item.startMs)}-${formatMs(item.endMs)} ${item.text || ""}`).join("\n")
    : "";
  return {
    asr: truncate(result.asr?.fullText || "未识别", 16000),
    timeline: truncate(segments || "未提供", 14000),
    vision: truncate(result.vision?.fullText || "未识别", 24000),
    report: truncate(result.analysis?.markdown || "", 16000)
  };
}

function buildVideoMaterialPrompts(result) {
  const evidence = materialEvidence(result);
  const conciseRule = "每个分析文本不超过80个汉字，原文引用不超过160个汉字，数组最多5项；缺失留空，禁止补写无证据信息。";
  return [
    {
      label: "视频身份与场景",
      maxTokens: 2400,
      prompt: `请提取视频身份、产品和拍摄场景。${conciseRule}

ASR：${truncate(evidence.asr, 8000)}
视频理解：${truncate(evidence.vision, 10000)}

只输出：
{"video":{"product":"","categories":[],"audiences":[],"demandScenes":[],"unsuitableConditions":"","videoForm":"口播种草/实测测评/剧情植入/直播切片/其他","shootingScene":"","shootingSceneRecommendation":""}}`
    },
    {
      label: "视频开头",
      maxTokens: 2400,
      prompt: `请只拆解视频开头。${conciseRule}

ASR：${truncate(evidence.asr, 6000)}
视频理解：${truncate(evidence.vision, 8000)}
报告：${truncate(evidence.report, 5000)}

只输出：
{"video":{"openingCopy":"","openingVisual":"","openingExpression":"","openingReuseRule":"","openingConditions":"","openingCategories":[]}}`
    },
    {
      label: "视频卖点与痛点",
      maxTokens: 3200,
      prompt: `请拆解视频的卖点、痛点和需求。${conciseRule} sellingOriginal、painOriginal、demandOriginal只能逐字引用ASR。

ASR：${truncate(evidence.asr, 10000)}
视频理解：${truncate(evidence.vision, 10000)}
报告：${truncate(evidence.report, 6000)}

只输出：
{"video":{"coreSellingPoints":"","secondarySellingPoints":"","sellingOriginal":"","sellingVisualization":"","sellingReuseRule":"","sellingConditions":"","sellingCategories":[],"painPoints":"","painOriginal":"","painVisualization":"","painReuseRule":"","painConditions":"","painCategories":[],"demandOriginal":"","deepNeeds":""}}`
    },
    {
      label: "视频效果与结构",
      maxTokens: 3000,
      prompt: `请拆解视频的效果证明、整体结构和收口。${conciseRule} closing只能逐字引用ASR。

ASR：${truncate(evidence.asr, 10000)}
视频理解：${truncate(evidence.vision, 12000)}
报告：${truncate(evidence.report, 10000)}

只输出：
{"video":{"effectVisualization":"","effectReuseRule":"","effectConditions":"","effectCategories":[],"proofAction":"","structure":"","structureReuseRule":"","structureConditions":"","structureCategories":[],"closing":"","hitReason":""}}`
    }
  ];
}

function buildSegmentMaterialPrompt(result, video) {
  const evidence = materialEvidence(result);
  return `请按语义作用拆分视频素材。开头、痛点、需求、卖点、效果、证明、价格、互动、收口不能混成一段。

视频概况：
${truncate(JSON.stringify(video), 10000)}

ASR完整口播：
${evidence.asr}

ASR时间轴：
${evidence.timeline}

视频理解：
${evidence.vision}

只输出以下JSON结构，segments最多18段；原文必须逐字引用，分析字段要短：
{
  "segments": [{
    "moduleType": "开头/痛点/需求/卖点/效果/证明/价格锚点/转场/互动/收口",
    "startSec": 0, "endSec": 0, "originalText": "ASR原文", "screenText": "",
    "visualDescription": "", "expression": "", "visualization": "", "emotions": [],
    "psychology": "", "reuseRule": "", "fitCategories": [], "fitAudiences": [],
    "fitScenes": [], "conditions": "", "avoidConditions": "",
    "evidenceSource": "ASR/视频理解/字幕/AI推断/混合证据", "confidence": "高/中/低"
  }]
}`;
}

function buildShotMaterialPrompt(result, segments) {
  const evidence = materialEvidence(result);
  const outline = segments.slice(0, 18).map((item, index) => ({
    segmentIndex: index + 1,
    moduleType: item.moduleType || "",
    startSec: item.startSec,
    endSec: item.endSec
  }));
  return `请根据视频理解拆分逐镜头执行数据。只写真实可见的景别、动作、道具、转场和字幕；无法确认则留空。

语义片段索引：
${JSON.stringify(outline)}

视频理解：
${evidence.vision}

只输出以下JSON结构，shots最多30个，每个字段使用短语：
{
  "shots": [{
    "segmentIndex": 1, "startSec": 0, "endSec": 0, "shotType": "特写/近景/中景/全景/未识别",
    "camera": "机位和运镜", "personAction": "", "productAction": "", "props": "",
    "scene": "", "transition": "", "audio": "", "subtitleStyle": "", "referenceFrame": "时间点或帧名"
  }]
}`;
}

export function buildLibraryScriptPrompt(product, materials) {
  const materialText = materials.map((item, index) => [
    `${index + 1}. 素材ID=${materialValue(item.id, 80) || "未标识"} 来源=${materialValue(item.source, 30) || "素材库"} 模块=${materialValue(item.moduleType, 40)}`,
    `原文=${materialValue(item.originalText, 220)}`,
    `画面=${materialValue(item.visualDescription, 160)}`,
    `表达=${materialValue(item.expression, 100)} 可视化=${materialValue(item.visualization, 120)}`,
    `产品=${materialValue(item.product, 60)} 类目=${materialValue(item.productCategories || item.fitCategories, 100)} 人群=${materialValue(item.audience || item.fitAudiences, 100)}`,
    `深层需求=${materialValue(item.deepNeeds, 120)} 核心卖点=${materialValue(item.coreSellingPoints, 140)} 证明动作=${materialValue(item.proofAction, 120)}`,
    `复用原则=${materialValue(item.reuseRule, 140)} 适用场景=${materialValue(item.fitScenes, 100)} 禁用条件=${materialValue(item.avoidConditions, 100)}`,
    `爆款归因=${materialValue(item.hitReason, 120)}`
  ].join("\n")).join("\n\n");

  return `请利用候选素材为我的产品生成一条全新的短视频拍摄脚本。

产品信息：
- 产品名：${product.name || "未填写"}
- 品类/场景：${product.category || "未填写"}
- 目标人群：${product.audience || "未填写"}
- 核心卖点：${product.sellingPoints || "未填写"}
- 可拍素材：${product.scenes || "未填写"}
- 价格/活动：${product.offer || "未填写"}
- 必须强调：${product.mustSay || "无"}
- 禁用/限制：${product.mustAvoid || "不能虚构参数和功效"}
- 风格：${product.tone || "自然口播"}
- 时长：${product.duration || "30秒以内"}

候选素材：
${materialText || "没有可用素材"}

要求：
1. 只输出HTML片段，根节点使用 <section class="rewrite-doc">。
2. 包含 rewrite-hero、script-box、timeline、template-box；分镜使用 shot-card。
3. 输出完整口播、逐镜头画面、贴片和拍摄要点。
4. 增加“素材依据”小节，只列采用的素材ID、来源和借鉴机制，不复述原文。
5. 至少组合开头、痛点或需求、卖点、证明、收口五个作用节点。
6. 必须原创，严禁直接拼接候选素材原文。`;
}

function materialValue(value, maxLength) {
  if (Array.isArray(value)) return truncate(value.join("、"), maxLength);
  if (value && typeof value === "object") return truncate(JSON.stringify(value), maxLength);
  return truncate(value || "", maxLength);
}

function parseJsonObject(value, label = "素材结构化") {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${label}返回格式不正确。`);
  return JSON.parse(text.slice(start, end + 1));
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n[内容过长，已截断]`;
}

function sampleEvenly(items, limit) {
  if (!Array.isArray(items) || items.length <= limit) return items || [];
  const selected = [];
  const last = items.length - 1;
  for (let index = 0; index < limit; index += 1) {
    selected.push(items[Math.round((index * last) / (limit - 1))]);
  }
  return selected;
}

function buildFallbackAnalysis({ frames, asr, vision }) {
  const html = `
<section class="report-doc">
  <header class="report-hero">
    <h1>视频拆解报告</h1>
    <p>内容分析服务未配置，以下只展示已采集到的真实证据。</p>
    <span class="badge">语音识别：${escapeHtml(asr?.available === false ? "不可用" : "可用")}</span>
    <span class="badge">视频理解：${escapeHtml(vision?.fullText ? "可用" : "不可用")}</span>
  </header>
  <section class="report-section script-box">
    <h2>原始口播脚本（语音识别）</h2>
    <p>${escapeHtml(asr?.fullText || asr?.note || "未识别")}</p>
  </section>
  <section class="report-section">
    <h2>视频理解证据</h2>
    <p>${escapeHtml(vision?.fullText || vision?.note || "未识别")}</p>
  </section>
  <section class="report-section">
    <h2>关键帧</h2>
    <ol>${frames.slice(0, 24).map((frame) => `<li>${escapeHtml(frame.publicPath)}</li>`).join("")}</ol>
  </section>
</section>`.trim();

  return {
    provider: "fallback",
    model: "",
    html,
    markdown: htmlToText(html)
  };
}

function formatMs(value) {
  if (!Number.isFinite(Number(value))) {
    return "?";
  }
  return `${(Number(value) / 1000).toFixed(1)}s`;
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|li|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeGeneratedHtml(value) {
  return String(value || "")
    .replace(/```(?:html|css|javascript|js)?\s*/gi, "")
    .replace(/```/g, "")
    .replace(/<(style|script|noscript|template|iframe|object|embed|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(style|script|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function anonymizeServiceNames(value) {
  return String(value || "")
    .replace(/MiniMax(?:-M3)?/gi, "视频理解服务")
    .replace(/\bdeepseek(?:[-_ ][a-z0-9._-]+)?\b/gi, "内容分析服务")
    .replace(/\bvolcano(?:\s+ASR)?\b/gi, "语音识别服务")
    .replace(/火山(?:引擎)?(?:\s*ASR)?/gi, "语音识别服务")
    .replace(/volc\.seedasr\.auc/gi, "语音识别服务");
}
