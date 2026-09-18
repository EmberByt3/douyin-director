import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { createId, ensureDir } from "../utils.js";

const PRODUCTS = [
  { id: "starter", name: "轻量包", points: 50, priceCents: 990 },
  { id: "creator", name: "创作包", points: 300, priceCents: 4990, recommended: true },
  { id: "studio", name: "团队包", points: 800, priceCents: 9990 }
];

let loaded = false;
let data = emptyStore();
let writeQueue = Promise.resolve();

export async function signInDevelopment({ email, name, deviceId }) {
  if (!config.billing.devMode) {
    throw apiError(503, "当前未配置正式登录服务。");
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw apiError(400, "请输入有效邮箱。");
  }

  return mutate(async (store) => {
    let user = store.users.find((item) => item.email === normalizedEmail);
    if (!user) {
      user = {
        id: createId("usr"),
        email: normalizedEmail,
        name: cleanName(name) || normalizedEmail.split("@")[0],
        createdAt: now()
      };
      store.users.push(user);
      store.wallets.push({ userId: user.id, balance: 0, updatedAt: now() });
      if (config.billing.trialPoints > 0) {
        credit(store, user.id, config.billing.trialPoints, {
          type: "trial_bonus",
          referenceType: "account",
          referenceId: user.id,
          note: "新账户体验点数"
        });
      }
    } else if (cleanName(name)) {
      user.name = cleanName(name);
    }

    const token = crypto.randomBytes(32).toString("base64url");
    store.sessions = store.sessions.filter((session) => (
      session.userId !== user.id || session.deviceId !== cleanDeviceId(deviceId)
    ));
    store.sessions.push({
      id: createId("ses"),
      tokenHash: hashToken(token),
      userId: user.id,
      deviceId: cleanDeviceId(deviceId),
      createdAt: now(),
      expiresAt: new Date(Date.now() + config.billing.sessionDays * 86_400_000).toISOString()
    });

    return { token, account: accountView(store, user) };
  });
}

export async function authenticateRequest(req) {
  await load();
  const authorization = String(req.headers.authorization || "");
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) throw apiError(401, "请先登录账户。");

  const session = data.sessions.find((item) => item.tokenHash === hashToken(token));
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    throw apiError(401, "登录状态已失效，请重新登录。");
  }
  const user = data.users.find((item) => item.id === session.userId);
  if (!user) throw apiError(401, "账户不存在。");
  return user;
}

export async function getAccount(userId) {
  await load();
  const user = data.users.find((item) => item.id === userId);
  if (!user) throw apiError(404, "账户不存在。");
  return accountView(data, user);
}

export async function listLedger(userId, limit = 30) {
  await load();
  return data.ledger
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 30)));
}

export function listProducts() {
  return {
    mode: config.billing.devMode ? "development" : "production",
    checkoutAvailable: config.billing.devMode || Boolean(config.billing.checkoutUrlTemplate),
    products: PRODUCTS,
    costs: {
      analyze: config.billing.analyzeCost,
      rewrite: config.billing.rewriteCost,
      libraryScript: config.billing.libraryScriptCost
    }
  };
}

export async function createOrder(userId, { productId, idempotencyKey, paymentMethod }) {
  const product = PRODUCTS.find((item) => item.id === productId);
  if (!product) throw apiError(400, "点数套餐不存在。");
  const method = normalizePaymentMethod(paymentMethod);
  if (!config.billing.devMode && !config.billing.checkoutUrlTemplate) {
    throw apiError(503, "正式收银台尚未配置，请联系管理员配置支付商户服务。");
  }

  return mutate(async (store) => {
    const cleanKey = String(idempotencyKey || "").trim().slice(0, 120);
    const existing = cleanKey
      ? store.orders.find((item) => item.userId === userId && item.idempotencyKey === cleanKey)
      : undefined;
    if (existing) return orderView(existing);

    const order = {
      id: createId("ord"),
      userId,
      productId: product.id,
      points: product.points,
      amountCents: product.priceCents,
      provider: config.billing.devMode ? "sandbox" : method,
      paymentMethod: method,
      status: config.billing.devMode ? "paid" : "pending",
      idempotencyKey: cleanKey,
      createdAt: now(),
      paidAt: config.billing.devMode ? now() : "",
      checkoutUrl: ""
    };
    if (!config.billing.devMode) {
      order.checkoutUrl = buildCheckoutUrl(config.billing.checkoutUrlTemplate, order);
    }
    store.orders.push(order);

    if (config.billing.devMode) {
      credit(store, userId, product.points, {
        type: "purchase",
        referenceType: "order",
        referenceId: order.id,
        note: `${product.name}（支付测试）`
      });
    }
    return orderView(order);
  });
}

export async function reservePoints(userId, amount, reference) {
  if (!config.billing.enabled || amount <= 0) return null;
  return mutate(async (store) => {
    const existing = store.reservations.find((item) => (
      item.userId === userId && item.referenceId === reference.referenceId
    ));
    if (existing) return existing;

    const wallet = requireWallet(store, userId);
    if (wallet.balance < amount) {
      throw apiError(402, `点数不足：本次需要 ${amount} 点，当前剩余 ${wallet.balance} 点。`);
    }

    wallet.balance -= amount;
    wallet.updatedAt = now();
    const reservation = {
      id: createId("rsv"),
      userId,
      amount,
      status: "reserved",
      referenceType: reference.referenceType,
      referenceId: reference.referenceId,
      note: reference.note || "",
      createdAt: now(),
      updatedAt: now()
    };
    store.reservations.push(reservation);
    appendLedger(store, userId, {
      type: "reserve",
      amount: -amount,
      balanceAfter: wallet.balance,
      referenceType: reference.referenceType,
      referenceId: reference.referenceId,
      note: reference.note || "任务预扣"
    });
    return reservation;
  });
}

export async function settleReservation(reservationId) {
  if (!reservationId) return;
  await mutate(async (store) => {
    const reservation = store.reservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status !== "reserved") return;
    reservation.status = "settled";
    reservation.updatedAt = now();
  });
}

export async function refundReservation(reservationId, note = "任务失败，点数退回") {
  if (!reservationId) return;
  await mutate(async (store) => {
    const reservation = store.reservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status !== "reserved") return;
    const wallet = requireWallet(store, reservation.userId);
    wallet.balance += reservation.amount;
    wallet.updatedAt = now();
    reservation.status = "refunded";
    reservation.updatedAt = now();
    appendLedger(store, reservation.userId, {
      type: "refund",
      amount: reservation.amount,
      balanceAfter: wallet.balance,
      referenceType: reservation.referenceType,
      referenceId: reservation.referenceId,
      note
    });
  });
}

export function apiError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function mutate(operation) {
  const task = writeQueue.then(async () => {
    await load();
    const result = await operation(data);
    await persist();
    return result;
  });
  writeQueue = task.catch(() => {});
  return task;
}

async function load() {
  if (loaded) return;
  await ensureDir(path.dirname(config.accountDataPath));
  try {
    const parsed = JSON.parse(await fs.readFile(config.accountDataPath, "utf8"));
    data = { ...emptyStore(), ...parsed };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  data.sessions = data.sessions.filter((item) => new Date(item.expiresAt).getTime() > Date.now());
  loaded = true;
}

async function persist() {
  const tempPath = `${config.accountDataPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, config.accountDataPath);
}

function emptyStore() {
  return { users: [], sessions: [], wallets: [], ledger: [], reservations: [], orders: [] };
}

function accountView(store, user) {
  const wallet = requireWallet(store, user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    balance: wallet.balance
  };
}

function orderView(order) {
  return {
    id: order.id,
    productId: order.productId,
    points: order.points,
    amountCents: order.amountCents,
    provider: order.provider,
    paymentMethod: order.paymentMethod,
    status: order.status,
    checkoutUrl: order.checkoutUrl || "",
    createdAt: order.createdAt,
    paidAt: order.paidAt
  };
}

function credit(store, userId, amount, detail) {
  const wallet = requireWallet(store, userId);
  wallet.balance += amount;
  wallet.updatedAt = now();
  appendLedger(store, userId, { ...detail, amount, balanceAfter: wallet.balance });
}

function appendLedger(store, userId, entry) {
  store.ledger.push({ id: createId("txn"), userId, createdAt: now(), ...entry });
}

function requireWallet(store, userId) {
  const wallet = store.wallets.find((item) => item.userId === userId);
  if (!wallet) throw apiError(404, "点数账户不存在。");
  return wallet;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function cleanDeviceId(value) {
  return String(value || "desktop").trim().slice(0, 120) || "desktop";
}

function normalizePaymentMethod(value) {
  const method = String(value || "wechat").trim().toLowerCase();
  if (!new Set(["wechat", "alipay"]).has(method)) {
    throw apiError(400, "不支持该支付方式。");
  }
  return method;
}

function buildCheckoutUrl(template, order) {
  const rendered = template
    .replaceAll("{orderId}", encodeURIComponent(order.id))
    .replaceAll("{productId}", encodeURIComponent(order.productId))
    .replaceAll("{paymentMethod}", encodeURIComponent(order.paymentMethod));
  let url;
  try {
    url = new URL(rendered);
  } catch {
    throw apiError(500, "支付收银台地址配置无效。");
  }
  if (url.protocol !== "https:") {
    throw apiError(500, "支付收银台必须使用 HTTPS 地址。");
  }
  return url.toString();
}

function now() {
  return new Date().toISOString();
}
