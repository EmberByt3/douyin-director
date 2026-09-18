import crypto from "node:crypto";
import * as local from "./store.js";
import { config } from "../config.js";

let cloud = null;

export function configureCloudBilling(adapter) {
  cloud = adapter || null;
}

export const apiError = local.apiError;

export function localDirectAccount() {
  return { id: "local-workbench", name: "本地直连", email: "", emailVerified: true, balance: null, localDirect: true };
}

export async function authenticateRequest(req) {
  if (config.localDirect) {
    assertLocalApiToken(req);
    return localDirectAccount();
  }
  if (!cloud) return local.authenticateRequest(req);
  assertLocalApiToken(req);
  const account = await cloud.getAccount();
  return { id: account.id, email: account.email, name: account.name };
}

export async function signInDevelopment(input) {
  if (config.localDirect) throw local.apiError(410, "本地直连模式无需云端登录。");
  if (cloud) throw local.apiError(410, "请使用桌面端云账户登录入口。");
  return local.signInDevelopment(input);
}

export async function getAccount(userId) {
  if (config.localDirect) return localDirectAccount();
  return cloud ? cloud.getAccount() : local.getAccount(userId);
}

export async function listLedger(userId, limit) {
  if (config.localDirect) return [];
  return cloud
    ? (await cloud.getLedger(limit)).entries || []
    : local.listLedger(userId, limit);
}

export async function listProducts() {
  if (config.localDirect) return { mode: "local", checkoutAvailable: false, products: [], costs: { analyze: 0, rewrite: 0, libraryScript: 0 } };
  return cloud ? cloud.getBillingProducts() : local.listProducts();
}

export async function createOrder(userId, input) {
  if (config.localDirect) throw local.apiError(410, "本地直连模式不提供次数购买。");
  if (cloud) return (await cloud.createBillingOrder(input)).order;
  return local.createOrder(userId, input);
}

export async function getOrder(userId, orderId) {
  if (config.localDirect) throw local.apiError(410, "云端支付通道已停用。");
  if (cloud) return (await cloud.getBillingOrder(orderId)).order;
  throw local.apiError(404, "本地支付订单不存在。");
}

export async function reservePoints(userId, _amount, reference = {}) {
  if (config.localDirect) return null;
  if (!cloud) return local.reservePoints(userId, _amount, reference);
  return cloud.reserveUsage(
    actionForReference(reference.referenceType),
    reference.referenceId,
  );
}

export async function settleReservation(reservationId) {
  if (config.localDirect) return;
  if (!reservationId) return;
  return cloud
    ? cloud.settleUsage(reservationId)
    : local.settleReservation(reservationId);
}

export async function refundReservation(reservationId) {
  if (config.localDirect) return;
  if (!reservationId) return;
  return cloud
    ? cloud.refundUsage(reservationId)
    : local.refundReservation(reservationId);
}

function actionForReference(referenceType) {
  if (referenceType === "video_analysis") return "analyze";
  if (referenceType === "product_rewrite") return "rewrite";
  if (referenceType === "library_script") return "library_script";
  throw local.apiError(400, "未知的任务扣次类型。");
}

function assertLocalApiToken(req) {
  const expected = String(process.env.LOCAL_API_TOKEN || "");
  const candidate =
    String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1] ||
    "";
  const left = Buffer.from(expected);
  const right = Buffer.from(candidate);
  if (
    !expected ||
    left.length !== right.length ||
    !crypto.timingSafeEqual(left, right)
  ) {
    throw local.apiError(401, "本地工作台会话已失效，请重启应用。");
  }
}
