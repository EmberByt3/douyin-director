import assert from "node:assert/strict";
import {
  MATERIAL_TABLES,
  appendMaterialRecords,
  initializeFeishuLibrary,
  parseBaseToken,
  testFeishuLibrary
} from "../server/materials/feishu.js";
import { searchMaterialLibraries } from "../server/materials/library.js";
import { clearUserLibraryConfig, setUserLibraryConfig } from "../server/materials/runtime.js";

assert.deepEqual(parseBaseToken("https://demo.feishu.cn/base/AppToken123456?table=tbl1"), {
  type: "base",
  token: "AppToken123456"
});
assert.deepEqual(parseBaseToken("https://demo.feishu.cn/wiki/WikiToken123456"), {
  type: "wiki",
  token: "WikiToken123456"
});
assert.equal(MATERIAL_TABLES.length, 5);
assert.ok(MATERIAL_TABLES.every((table) => table.fields.length >= 15));
const videoFields = new Set(MATERIAL_TABLES.find((table) => table.name === "视频主表").fields.map((field) => field.field_name));
for (const required of [
  "内容原文", "开头文案", "开头画面描述", "核心卖点", "卖点表达原文",
  "痛点", "深层需求", "证明动作表达", "视频结构复用原则", "爆款归因"
]) {
  assert.ok(videoFields.has(required), `Missing director field: ${required}`);
}

const tables = [];
const fields = new Map();
const records = [];
const recordsByTable = new Map();
const originalFetch = global.fetch;

global.fetch = async (url, options = {}) => {
  const parsed = new URL(String(url));
  const pathname = parsed.pathname;
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : {};

  if (pathname.endsWith("/auth/v3/tenant_access_token/internal")) {
    return json({ code: 0, tenant_access_token: "token" });
  }
  if (pathname.endsWith("/bitable/v1/apps/AppToken123456") && method === "GET") {
    return json({ code: 0, data: { app: { name: "测试素材库" } } });
  }
  if (pathname.endsWith("/bitable/v1/apps/AppToken123456/tables") && method === "GET") {
    return json({ code: 0, data: { items: tables } });
  }
  if (pathname.endsWith("/bitable/v1/apps/AppToken123456/tables") && method === "POST") {
    const table = { table_id: `tbl${tables.length + 1}`, name: body.table.name };
    tables.push(table);
    fields.set(table.table_id, [...(body.table.fields || [])]);
    recordsByTable.set(table.table_id, []);
    return json({ code: 0, data: { table_id: table.table_id } });
  }

  const fieldMatch = pathname.match(/\/tables\/(tbl\d+)\/fields$/);
  if (fieldMatch && method === "GET") {
    return json({ code: 0, data: { items: fields.get(fieldMatch[1]) || [] } });
  }
  if (fieldMatch && method === "POST") {
    fields.get(fieldMatch[1]).push(body);
    return json({ code: 0, data: { field: body } });
  }

  if (/\/records\/batch_create$/.test(pathname) && method === "POST") {
    records.push(...body.records);
    const tableId = pathname.match(/\/tables\/(tbl\d+)\/records/)?.[1];
    recordsByTable.get(tableId).push(...body.records.map((record, index) => ({
      record_id: `rec-batch-${records.length}-${index}`,
      fields: record.fields
    })));
    return json({ code: 0, data: { records: body.records } });
  }
  if (/\/records\/batch_update$/.test(pathname) && method === "POST") {
    const tableId = pathname.match(/\/tables\/(tbl\d+)\/records/)?.[1];
    const tableRecords = recordsByTable.get(tableId);
    for (const update of body.records) {
      const existing = tableRecords.find((record) => record.record_id === update.record_id);
      if (existing) existing.fields = { ...existing.fields, ...update.fields };
    }
    return json({ code: 0, data: { records: body.records } });
  }
  if (/\/records$/.test(pathname) && method === "GET") {
    const tableId = pathname.match(/\/tables\/(tbl\d+)\/records/)?.[1];
    return json({ code: 0, data: { items: recordsByTable.get(tableId) || [], has_more: false } });
  }
  if (/\/records$/.test(pathname) && method === "POST") {
    records.push(body);
    const tableId = pathname.match(/\/tables\/(tbl\d+)\/records/)?.[1];
    const record = { record_id: `rec-${records.length}`, fields: body.fields };
    recordsByTable.get(tableId).push(record);
    return json({ code: 0, data: { record } });
  }
  const recordMatch = pathname.match(/\/tables\/(tbl\d+)\/records\/([^/]+)$/);
  if (recordMatch && method === "PUT") {
    const tableRecords = recordsByTable.get(recordMatch[1]);
    const existing = tableRecords.find((record) => record.record_id === recordMatch[2]);
    if (existing) existing.fields = { ...existing.fields, ...body.fields };
    return json({ code: 0, data: { record: existing } });
  }
  throw new Error(`Unhandled mock request: ${method} ${pathname}`);
};

try {
  const settings = {
    appId: "cli_test",
    appSecret: "secret",
    baseUrl: "https://demo.feishu.cn/base/AppToken123456"
  };
  const tested = await testFeishuLibrary(settings);
  assert.equal(tested.name, "测试素材库");

  const initialized = await initializeFeishuLibrary(settings);
  assert.equal(initialized.schemaVersion, "2");
  assert.equal(initialized.created.length, 5);
  assert.equal(tables.length, 5);
  assert.equal(Object.keys(initialized.tableMap).length, 5);

  fields.get("tbl1").pop();
  const repaired = await initializeFeishuLibrary(settings);
  assert.equal(repaired.created.length, 0);
  assert.equal(repaired.repaired.length, 1);
  assert.equal(tables.length, 5);

  const material = {
    video: { "素材ID": "MAT-001", "标题": "测试视频", "结构版本": "2" },
    segments: [{ "片段ID": "MAT-001-S01", "素材ID": "MAT-001", "模块类型": "开头" }],
    shots: [{ "镜头ID": "MAT-001-SH01", "素材ID": "MAT-001", "片段ID": "MAT-001-S01" }]
  };
  const firstWrite = await appendMaterialRecords(settings, material);
  const secondWrite = await appendMaterialRecords(settings, material);
  assert.equal(firstWrite.exists, false);
  assert.equal(secondWrite.exists, true);
  assert.equal(firstWrite.segmentCount, 1);
  assert.equal(firstWrite.shotCount, 1);
  assert.equal(records.length, 3);

  await appendMaterialRecords(settings, {
    video: { "素材ID": "MAT-LEGACY", "标题": "旧素材", "结构版本": "1" }
  });
  const upgraded = await appendMaterialRecords(settings, {
    video: { "素材ID": "MAT-LEGACY", "标题": "旧素材已升级", "结构版本": "2" },
    segments: [{ "片段ID": "MAT-LEGACY-S01", "素材ID": "MAT-LEGACY", "模块类型": "开头" }],
    shots: [{ "镜头ID": "MAT-LEGACY-SH01", "素材ID": "MAT-LEGACY", "片段ID": "MAT-LEGACY-S01" }]
  });
  assert.equal(upgraded.exists, true);
  assert.equal(upgraded.upgraded, true);
  assert.equal(upgraded.segmentCount, 1);
  assert.equal(upgraded.shotCount, 1);

  setUserLibraryConfig(settings);
  const ownOnly = await searchMaterialLibraries({ source: "user", limit: 10 });
  const platformOnly = await searchMaterialLibraries({ source: "platform", limit: 10 });
  const both = await searchMaterialLibraries({ source: "both", limit: 10 });
  assert.equal(ownOnly.length, 2);
  assert.equal(platformOnly.length, 0);
  assert.equal(both.length, 2);
  console.log("Material library tests passed");
} finally {
  clearUserLibraryConfig();
  global.fetch = originalFetch;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
