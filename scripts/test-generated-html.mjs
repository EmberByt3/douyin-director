import assert from "node:assert/strict";
import { sanitizeGeneratedHtml } from "../server/providers/deepseek.js";

const dirty = `\`\`\`html
<style>.report-doc{color:red}</style>
<script>alert("x")</script>
<section class="report-doc"><h1>正常报告</h1><p>真实内容</p></section>
\`\`\``;

const clean = sanitizeGeneratedHtml(dirty);
assert.ok(clean.includes("正常报告"));
assert.ok(clean.includes("真实内容"));
assert.ok(!clean.includes("report-doc{color:red}"));
assert.ok(!clean.includes("alert"));
assert.ok(!clean.includes("```"));
console.log("Generated HTML sanitization tests passed");
