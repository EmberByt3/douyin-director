import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const testDir = path.resolve(".test-data");
process.env.ACCOUNT_DATA_PATH = path.join(testDir, "account-store.json");
process.env.BILLING_DEV_MODE = "true";
process.env.LOCAL_DIRECT_MODE = "false";
process.env.BILLING_ENABLED = "true";
process.env.BILLING_TRIAL_POINTS = "30";

await fs.rm(testDir, { recursive: true, force: true });

const {
  createOrder,
  getAccount,
  listLedger,
  refundReservation,
  reservePoints,
  settleReservation,
  signInDevelopment
} = await import("../server/billing/store.js");

const session = await signInDevelopment({
  email: "director@example.com",
  name: "编导测试",
  deviceId: "test-device"
});
assert.equal(session.account.balance, 30);

const paidOrder = await createOrder(session.account.id, {
  productId: "starter",
  paymentMethod: "wechat",
  idempotencyKey: "same-order"
});
await createOrder(session.account.id, {
  productId: "starter",
  paymentMethod: "wechat",
  idempotencyKey: "same-order"
});
assert.equal(paidOrder.status, "paid");
assert.equal(paidOrder.provider, "sandbox");
assert.equal(paidOrder.checkoutUrl, "");
assert.equal((await getAccount(session.account.id)).balance, 80, "幂等订单只能入账一次");

const failedTask = await reservePoints(session.account.id, 10, {
  referenceType: "video_analysis",
  referenceId: "failed-task",
  note: "失败任务"
});
assert.equal((await getAccount(session.account.id)).balance, 70);
await refundReservation(failedTask.id);
assert.equal((await getAccount(session.account.id)).balance, 80, "失败任务应退回点数");

const completedTask = await reservePoints(session.account.id, 10, {
  referenceType: "video_analysis",
  referenceId: "completed-task",
  note: "成功任务"
});
await settleReservation(completedTask.id);
assert.equal((await getAccount(session.account.id)).balance, 70, "成功任务应完成扣点");

const ledger = await listLedger(session.account.id);
assert.equal(ledger.filter((entry) => entry.type === "purchase").length, 1);
assert.equal(ledger.filter((entry) => entry.type === "refund").length, 1);

await fs.rm(testDir, { recursive: true, force: true });
console.log("Billing flow passed: login, idempotent order, reserve, settle, refund.");
