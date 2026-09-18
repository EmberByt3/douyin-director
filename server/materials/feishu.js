const FEISHU_API = "https://open.feishu.cn/open-apis";

export const MATERIAL_TABLES = [
  {
    name: "视频主表",
    fields: [
      text("素材ID"), url("原链接"), text("平台视频ID"), text("标题"), text("平台"),
      number("视频时长秒"), text("产品"), multi("产品类目"), multi("目标人群"),
      multi("需求场景"), text("不适用条件"), single("视频形式", ["口播种草", "实测测评", "剧情植入", "直播切片", "其他"]),
      text("视频拍摄场景"), text("视频拍摄场景推荐"), text("内容原文"), text("原始口播"), text("完整拆解报告"),
      text("人群"), text("开头文案"), text("开头画面描述"), text("开头表达"), text("开头直接复用原则"),
      text("开头适用条件"), multi("开头适用类目"), text("核心卖点"), text("次要卖点"), text("卖点表达原文"),
      text("卖点可视化表达"), text("卖点表达复用原则"), text("卖点表达适用条件"), multi("卖点表达适用类目"),
      text("痛点"), text("痛点表达原文"), text("痛点可视化表达形式"), text("痛点表达复用原则"),
      text("痛点表达适用条件"), multi("痛点表达适用类目"), text("需求表达原文"), text("深层需求"),
      text("效果可视化表达形式"), text("效果表达复用原则"), text("效果表达适用条件"), multi("效果表达适用类目"),
      text("证明动作表达"), text("视频结构"), text("视频结构复用原则"), text("视频结构适用条件"),
      multi("视频结构适用类目"), text("收口话术"), text("爆款归因"),
      single("证据完整度", ["完整", "部分", "不足"]),
      single("审核状态", ["未审核", "已确认", "需修改"]), text("结构版本"), text("创建时间")
    ]
  },
  {
    name: "素材片段表",
    fields: [
      text("片段ID"), text("素材ID"), single("素材来源", ["平台基础库", "用户素材库"]),
      single("模块类型", ["开头", "痛点", "需求", "卖点", "效果", "证明", "价格锚点", "转场", "互动", "收口", "待审核"]),
      number("开始时间秒"), number("结束时间秒"), text("口播原文"), text("屏幕文字"),
      text("内容原文"), text("产品"), multi("产品类目"), multi("人群"), multi("需求场景"), text("不适用条件"),
      single("视频形式", ["口播种草", "实测测评", "剧情植入", "直播切片", "其他"]),
      text("视频拍摄场景"), text("视频拍摄场景推荐"), text("画面描述"), text("表达方式"), text("可视化表达"), multi("情绪标签"),
      text("心理机制"), text("复用原则"), multi("适用类目"), multi("适用人群"),
      multi("适用场景"), text("适用条件"), text("禁用条件"),
      single("证据来源", ["ASR", "视频理解", "字幕", "人工录入", "AI推断", "混合证据"]),
      single("识别置信度", ["高", "中", "低"]), single("审核状态", ["未审核", "已确认", "需修改"])
    ]
  },
  {
    name: "镜头执行表",
    fields: [
      text("镜头ID"), text("素材ID"), text("片段ID"), number("开始时间秒"), number("结束时间秒"),
      single("景别", ["特写", "近景", "中景", "全景", "未识别"]), text("机位与运镜"),
      text("人物动作"), text("产品动作"), text("核心道具"), text("拍摄场景"),
      text("转场方式"), text("音效与音乐"), text("字幕形式"), text("参考帧")
    ]
  },
  {
    name: "产品表",
    fields: [
      text("产品ID"), text("产品名"), multi("产品类目"), multi("目标人群"), multi("需求场景"),
      text("核心卖点"), text("次要卖点"), text("证明材料"), text("价格活动权益"),
      text("可拍素材"), text("必须强调"), text("禁用限制"), text("表达风格"), text("期望时长"),
      single("审核状态", ["未审核", "已确认", "需修改"])
    ]
  },
  {
    name: "数据复盘表",
    fields: [
      text("复盘ID"), text("素材ID"), text("记录日期"), number("播放量"), number("完播率"),
      number("点赞量"), number("评论量"), number("收藏量"), number("转发量"), number("转化率"),
      number("GMV"), single("流量类型", ["自然流", "投流", "混合", "未知"]),
      text("高赞评论关键词"), text("负面反馈"), single("爆款等级", ["普通", "小爆", "中爆", "大爆"])
    ]
  }
];

export async function testFeishuLibrary(settings) {
  const token = await getTenantToken(settings);
  const appToken = await resolveBaseToken(settings.baseUrl, token);
  const payload = await feishuRequest(`/bitable/v1/apps/${encodeURIComponent(appToken)}`, { token });
  return {
    ok: true,
    appToken,
    name: payload?.data?.app?.name || payload?.data?.name || "飞书素材库"
  };
}

export async function initializeFeishuLibrary(settings) {
  const token = await getTenantToken(settings);
  const appToken = await resolveBaseToken(settings.baseUrl, token);
  const existing = await listTables(appToken, token);
  const tableMap = {};
  const created = [];
  const repaired = [];

  for (const schema of MATERIAL_TABLES) {
    let table = existing.find((item) => item.name === schema.name);
    if (!table) {
      table = await createTable(appToken, token, schema);
      created.push(schema.name);
    }
    tableMap[schema.name] = table.table_id;
    const added = await ensureFields(appToken, table.table_id, token, schema.fields);
    if (added > 0 && !created.includes(schema.name)) repaired.push(`${schema.name} +${added}`);
  }

  return {
    ok: true,
    appToken,
    tableMap,
    created,
    repaired,
    schemaVersion: "2"
  };
}

export async function appendMaterialRecords(settings, { video, segments = [], shots = [] }) {
  const token = await getTenantToken(settings);
  const appToken = await resolveBaseToken(settings.baseUrl, token);
  const tables = await listTables(appToken, token);
  const tableId = (name) => {
    const match = tables.find((item) => item.name === name);
    if (!match) throw new Error(`素材库缺少“${name}”，请先初始化或修复。`);
    return match.table_id;
  };

  const existing = await findRecordInTable(appToken, tableId("视频主表"), token, (fields) => (
    (video["素材ID"] && fields["素材ID"] === video["素材ID"]) ||
    (video["平台视频ID"] && fields["平台视频ID"] === video["平台视频ID"])
  ));
  if (existing) {
    const existingFields = normalizeFields(existing.fields);
    const targetVersion = String(video["结构版本"] || "");
    if (!targetVersion || existingFields["结构版本"] === targetVersion) {
      return { ok: true, exists: true, upgraded: false, recordId: existing.record_id, segmentCount: 0, shotCount: 0 };
    }

    await updateRecord(appToken, tableId("视频主表"), token, existing.record_id, video);
    const segmentResult = await batchUpsertRecords(appToken, tableId("素材片段表"), token, segments, "片段ID");
    const shotResult = await batchUpsertRecords(appToken, tableId("镜头执行表"), token, shots, "镜头ID");
    return {
      ok: true,
      exists: true,
      upgraded: true,
      recordId: existing.record_id,
      segmentCount: segmentResult.written,
      shotCount: shotResult.written
    };
  }

  await createRecord(appToken, tableId("视频主表"), token, video);
  if (segments.length) {
    await batchCreateRecords(appToken, tableId("素材片段表"), token, segments);
  }
  if (shots.length) {
    await batchCreateRecords(appToken, tableId("镜头执行表"), token, shots);
  }
  return { ok: true, exists: false, segmentCount: segments.length, shotCount: shots.length };
}

export async function findVideoMaterial(settings, { materialId = "", videoId = "" } = {}) {
  const token = await getTenantToken(settings);
  const appToken = await resolveBaseToken(settings.baseUrl, token);
  const tables = await listTables(appToken, token);
  const table = tables.find((item) => item.name === "视频主表");
  if (!table) return null;
  const record = await findRecordInTable(appToken, table.table_id, token, (fields) => (
    (materialId && fields["素材ID"] === materialId) ||
    (videoId && fields["平台视频ID"] === videoId)
  ));
  return record ? { recordId: record.record_id, fields: normalizeFields(record.fields) } : null;
}

export async function listMaterialSegments(settings, limit = 500) {
  const token = await getTenantToken(settings);
  const appToken = await resolveBaseToken(settings.baseUrl, token);
  const tables = await listTables(appToken, token);
  const table = tables.find((item) => item.name === "素材片段表");
  if (!table) return [];

  const items = [];
  let pageToken = "";
  do {
    const search = new URLSearchParams({ page_size: String(Math.min(500, limit - items.length)) });
    if (pageToken) search.set("page_token", pageToken);
    const payload = await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(table.table_id)}/records?${search}`,
      { token }
    );
    items.push(...(payload?.data?.items || []));
    pageToken = payload?.data?.has_more ? String(payload?.data?.page_token || "") : "";
  } while (pageToken && items.length < limit);

  return items.slice(0, limit).map((item) => ({ recordId: item.record_id, ...normalizeFields(item.fields) }));
}

export async function upsertProductRecord(settings, product) {
  const token = await getTenantToken(settings);
  const appToken = await resolveBaseToken(settings.baseUrl, token);
  const tables = await listTables(appToken, token);
  const table = tables.find((item) => item.name === "产品表");
  if (!table) throw new Error("素材库缺少“产品表”，请先初始化或修复。");
  const payload = await feishuRequest(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(table.table_id)}/records?page_size=500`,
    { token }
  );
  const existing = (payload?.data?.items || []).find((item) => {
    const fields = normalizeFields(item.fields);
    return (product.id && fields["产品ID"] === product.id) || fields["产品名"] === product.name;
  });
  const fields = cleanRecord({
    "产品ID": product.id,
    "产品名": product.name,
    "产品类目": splitTags(product.category),
    "目标人群": splitTags(product.audience),
    "需求场景": splitTags(product.scenes),
    "核心卖点": product.sellingPoints,
    "价格活动权益": product.offer,
    "可拍素材": product.scenes,
    "必须强调": product.mustSay,
    "禁用限制": product.mustAvoid,
    "表达风格": product.tone,
    "期望时长": product.duration,
    "审核状态": "未审核"
  });
  if (existing) {
    await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(table.table_id)}/records/${encodeURIComponent(existing.record_id)}`,
      { token, method: "PUT", body: { fields } }
    );
    return { ok: true, created: false, recordId: existing.record_id };
  }
  const created = await createRecord(appToken, table.table_id, token, fields);
  return { ok: true, created: true, recordId: created?.data?.record?.record_id || "" };
}

export function parseBaseToken(baseUrl) {
  const textValue = String(baseUrl || "").trim();
  const baseMatch = textValue.match(/\/base\/([A-Za-z0-9]+)/);
  if (baseMatch) return { type: "base", token: baseMatch[1] };
  const wikiMatch = textValue.match(/\/wiki\/([A-Za-z0-9]+)/);
  if (wikiMatch) return { type: "wiki", token: wikiMatch[1] };
  if (/^[A-Za-z0-9]{10,}$/.test(textValue)) return { type: "base", token: textValue };
  throw new Error("Base 链接格式不正确，请粘贴飞书多维表格完整链接。");
}

async function resolveBaseToken(baseUrl, token) {
  const parsed = parseBaseToken(baseUrl);
  if (parsed.type === "base") return parsed.token;
  const payload = await feishuRequest(`/wiki/v2/spaces/get_node?token=${encodeURIComponent(parsed.token)}`, { token });
  const node = payload?.data?.node;
  if (node?.obj_type !== "bitable" || !node?.obj_token) {
    throw new Error("该知识库链接不是多维表格，请粘贴 Base 节点链接。");
  }
  return node.obj_token;
}

async function getTenantToken(settings) {
  const appId = String(settings?.appId || "").trim();
  const appSecret = String(settings?.appSecret || "").trim();
  if (!appId || !appSecret) throw new Error("请填写飞书 App ID 和 App Secret。");
  const response = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(feishuError(payload, response.status, "飞书应用认证失败"));
  }
  return payload.tenant_access_token;
}

async function feishuRequest(pathname, { token, method = "GET", body } = {}) {
  const response = await fetch(`${FEISHU_API}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "authorization": `Bearer ${token}`
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || Number(payload.code || 0) !== 0) {
    throw new Error(feishuError(payload, response.status, "飞书素材库请求失败"));
  }
  return payload;
}

async function listTables(appToken, token) {
  const payload = await feishuRequest(`/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?page_size=100`, { token });
  return payload?.data?.items || [];
}

async function createTable(appToken, token, schema) {
  const pathname = `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`;
  let payload;
  try {
    payload = await feishuRequest(pathname, {
      token,
      method: "POST",
      body: { table: { name: schema.name, default_view_name: "全部素材", fields: schema.fields } }
    });
  } catch {
    payload = await feishuRequest(pathname, {
      token,
      method: "POST",
      body: { table: { name: schema.name, default_view_name: "全部素材" } }
    });
  }
  const tableId = payload?.data?.table_id || payload?.data?.table?.table_id;
  if (!tableId) throw new Error(`飞书已返回成功，但没有提供“${schema.name}”的 table_id。`);
  return { ...(payload?.data?.table || {}), table_id: tableId, name: schema.name };
}

async function ensureFields(appToken, tableId, token, fields) {
  const payload = await feishuRequest(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?page_size=100`,
    { token }
  );
  const names = new Set((payload?.data?.items || []).map((item) => item.field_name));
  let added = 0;
  for (const field of fields) {
    if (names.has(field.field_name)) continue;
    await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
      { token, method: "POST", body: field }
    );
    added += 1;
  }
  return added;
}

async function createRecord(appToken, tableId, token, fields) {
  return feishuRequest(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
    { token, method: "POST", body: { fields: cleanRecord(fields) } }
  );
}

async function updateRecord(appToken, tableId, token, recordId, fields) {
  return feishuRequest(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
    { token, method: "PUT", body: { fields: cleanRecord(fields) } }
  );
}

async function batchCreateRecords(appToken, tableId, token, rows) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const records = rows.slice(offset, offset + 500).map((fields) => ({ fields: cleanRecord(fields) }));
    await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_create`,
      { token, method: "POST", body: { records } }
    );
  }
}

async function batchUpsertRecords(appToken, tableId, token, rows, idField) {
  if (!rows.length) return { written: 0 };
  const existing = await listRecords(appToken, tableId, token);
  const byId = new Map(existing.map((item) => [String(normalizeFields(item.fields)[idField] || ""), item]));
  const updates = [];
  const creates = [];
  for (const fields of rows) {
    const match = byId.get(String(fields[idField] || ""));
    if (match) updates.push({ record_id: match.record_id, fields: cleanRecord(fields) });
    else creates.push(fields);
  }
  for (let offset = 0; offset < updates.length; offset += 500) {
    await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_update`,
      { token, method: "POST", body: { records: updates.slice(offset, offset + 500) } }
    );
  }
  if (creates.length) await batchCreateRecords(appToken, tableId, token, creates);
  return { written: updates.length + creates.length };
}

async function listRecords(appToken, tableId, token) {
  const items = [];
  let pageToken = "";
  do {
    const search = new URLSearchParams({ page_size: "500" });
    if (pageToken) search.set("page_token", pageToken);
    const payload = await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?${search}`,
      { token }
    );
    items.push(...(payload?.data?.items || []));
    pageToken = payload?.data?.has_more ? String(payload?.data?.page_token || "") : "";
  } while (pageToken);
  return items;
}

async function findRecordInTable(appToken, tableId, token, predicate) {
  let pageToken = "";
  do {
    const search = new URLSearchParams({ page_size: "500" });
    if (pageToken) search.set("page_token", pageToken);
    const payload = await feishuRequest(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?${search}`,
      { token }
    );
    const match = (payload?.data?.items || []).find((item) => predicate(normalizeFields(item.fields)));
    if (match) return match;
    pageToken = payload?.data?.has_more ? String(payload?.data?.page_token || "") : "";
  } while (pageToken);
  return null;
}

function cleanRecord(fields) {
  return Object.fromEntries(Object.entries(fields || {}).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    return !Array.isArray(value) || value.length > 0;
  }));
}

function normalizeFields(fields) {
  const normalized = {};
  for (const [key, value] of Object.entries(fields || {})) {
    normalized[key] = Array.isArray(value)
      ? value.map((item) => item?.text ?? item?.name ?? item).filter(Boolean).join("、")
      : value;
  }
  return normalized;
}

function splitTags(value) {
  return String(value || "").split(/[、,，/]+/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function feishuError(payload, status, prefix) {
  const code = payload?.code ? `（${payload.code}）` : "";
  const message = payload?.msg || payload?.message || `HTTP ${status}`;
  if ([91403, 1254302, 1254303].includes(Number(payload?.code))) {
    return `${prefix}${code}：应用没有该 Base 的编辑权限，请在多维表格“添加文档应用”中授权后重试。`;
  }
  return `${prefix}${code}：${message}`;
}

function text(field_name) { return { field_name, type: 1 }; }
function number(field_name) { return { field_name, type: 2 }; }
function url(field_name) { return { field_name, type: 15 }; }
function single(field_name, options) {
  return { field_name, type: 3, property: { options: options.map((name) => ({ name })) } };
}
function multi(field_name) { return { field_name, type: 4 }; }
