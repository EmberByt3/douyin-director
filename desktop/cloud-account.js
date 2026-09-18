import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class CloudAccountClient {
  constructor({
    baseUrl,
    statePath,
    encryptionAvailable,
    encrypt,
    decrypt,
    fetchImpl = fetch,
    allowInsecureLocalhost = false,
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl, allowInsecureLocalhost);
    this.statePath = statePath;
    this.encryptionAvailable = encryptionAvailable;
    this.encrypt = encrypt;
    this.decrypt = decrypt;
    this.fetchImpl = fetchImpl;
    this.state = this.readState();
    this.accountCache = null;
    this.accountCacheAt = 0;
  }

  get configured() {
    return Boolean(this.baseUrl);
  }

  async getSession() {
    if (!this.configured) return { configured: false, account: null };
    if (!this.state.token) return { configured: true, account: null };
    try {
      const payload = await this.request("/v1/account", {
        authenticated: true,
      });
      this.updateAccountCache(payload.account);
      return { configured: true, account: payload.account };
    } catch (error) {
      if (error.statusCode === 401) return { configured: true, account: null };
      throw error;
    }
  }

  async register({ email, name, password, inviteCode }) {
    const registration = await this.request("/v1/auth/register", {
      method: "POST",
      body: { email, name, password, inviteCode },
    });
    return {
      ...(await this.login({ email, password })),
      verificationEmailSent: Boolean(registration.verificationEmailSent),
    };
  }

  async login({ email, password }) {
    this.assertSecureStorage();
    const payload = await this.request("/v1/auth/login", {
      method: "POST",
      body: { email, password, deviceId: this.state.deviceId },
    });
    this.state.token = payload.token;
    this.writeState();
    this.updateAccountCache(payload.account);
    return { account: payload.account };
  }

  async logout() {
    try {
      if (this.state.token) {
        await this.request("/v1/auth/logout", {
          method: "POST",
          authenticated: true,
        });
      }
    } finally {
      this.clearToken();
    }
    return { ok: true };
  }

  async forgotPassword(email) {
    return this.request("/v1/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  }

  async resendEmailVerification() {
    return this.request("/v1/account/resend-verification", {
      method: "POST",
      authenticated: true,
    });
  }

  async changePassword(currentPassword, newPassword) {
    const result = await this.request("/v1/account/password", {
      method: "POST",
      authenticated: true,
      body: { currentPassword, newPassword },
    });
    this.clearToken();
    return result;
  }

  async getAccount() {
    if (this.accountCache && Date.now() - this.accountCacheAt < 15_000) {
      return this.accountCache;
    }
    const session = await this.getSession();
    if (!session.account) throw cloudError(401, "请先登录云端账户。");
    return session.account;
  }

  async getLedger(limit = 30) {
    return this.request(
      `/v1/wallet/ledger?limit=${encodeURIComponent(limit)}`,
      {
        authenticated: true,
      },
    );
  }

  async getBillingProducts() {
    return this.request("/v1/billing/products");
  }

  async createBillingOrder(input) {
    const result = await this.request("/v1/billing/orders", {
      method: "POST",
      authenticated: true,
      body: input,
    });
    if (result.account) this.updateAccountCache(result.account);
    return result;
  }

  async getBillingOrder(orderId) {
    const result = await this.request(
      `/v1/billing/orders/${encodeURIComponent(orderId)}`,
      { authenticated: true },
    );
    if (result.account) this.updateAccountCache(result.account);
    return result;
  }

  async redeemCdk(code) {
    const result = await this.request("/v1/cdk/redeem", {
      method: "POST",
      authenticated: true,
      body: { code },
    });
    this.updateCachedBalance(result.balance);
    return result;
  }

  async reserveUsage(action, idempotencyKey) {
    const result = await this.request("/v1/usage/reserve", {
      method: "POST",
      authenticated: true,
      body: { action, idempotencyKey },
    });
    this.updateCachedBalance(result.balance);
    return result;
  }

  async settleUsage(reservationId) {
    return this.request(
      `/v1/usage/${encodeURIComponent(reservationId)}/settle`,
      {
        method: "POST",
        authenticated: true,
      },
    );
  }

  async refundUsage(reservationId) {
    const result = await this.request(
      `/v1/usage/${encodeURIComponent(reservationId)}/refund`,
      {
        method: "POST",
        authenticated: true,
      },
    );
    this.accountCacheAt = 0;
    return result;
  }

  async callProvider(operation, payload, reservationId) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.request("/v1/providers/call", {
          method: "POST",
          authenticated: true,
          body: { operation, payload, reservationId },
          timeoutMs: 290_000,
        });
        return result.result;
      } catch (error) {
        lastError = error;
        if (!error?.transportFailure || attempt > 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    throw lastError;
  }

  async request(
    resource,
    {
      method = "GET",
      body,
      authenticated = false,
      timeoutMs = 20_000,
    } = {},
  ) {
    if (!this.configured) {
      throw cloudError(503, "云端账户服务尚未配置，请联系测试管理员。");
    }
    if (authenticated && !this.state.token) {
      throw cloudError(401, "请先登录云端账户。");
    }
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (authenticated) headers.authorization = `Bearer ${this.state.token}`;
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${resource}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError"
        || /(?:aborted.*timeout|operation was aborted|timed?\s*out|timeout)/i.test(
          String(error?.message || ""),
        );
      const wrapped = cloudError(
        503,
        timedOut
          ? "云端生成等待超时，请稍后重试。"
          : `无法连接云端账户服务：${error.message || "网络错误"}`,
      );
      wrapped.transportFailure = true;
      throw wrapped;
    }
    const text = await response.text();
    const payload = text ? safeJson(text) : {};
    if (!response.ok) {
      if (authenticated && response.status === 401) this.clearToken();
      const error = cloudError(
        response.status,
        payload.error || `云端账户请求失败（${response.status}）`,
      );
      error.requestId = payload.requestId || "";
      throw error;
    }
    return payload;
  }

  assertSecureStorage() {
    if (!this.encryptionAvailable()) {
      throw cloudError(503, "Windows 凭据加密当前不可用，已阻止保存登录令牌。");
    }
  }

  clearToken() {
    this.state.token = "";
    this.accountCache = null;
    this.accountCacheAt = 0;
    if (this.encryptionAvailable()) this.writeState();
  }

  updateAccountCache(account) {
    this.accountCache = account || null;
    this.accountCacheAt = account ? Date.now() : 0;
  }

  updateCachedBalance(balance) {
    if (!this.accountCache || !Number.isFinite(Number(balance))) return;
    this.accountCache = { ...this.accountCache, balance: Number(balance) };
    this.accountCacheAt = Date.now();
  }

  readState() {
    const fallback = { token: "", deviceId: crypto.randomUUID() };
    if (
      !this.statePath ||
      !fs.existsSync(this.statePath) ||
      !this.encryptionAvailable()
    ) {
      return fallback;
    }
    try {
      const value = JSON.parse(this.decrypt(fs.readFileSync(this.statePath)));
      return {
        token: typeof value.token === "string" ? value.token : "",
        deviceId:
          typeof value.deviceId === "string"
            ? value.deviceId
            : fallback.deviceId,
      };
    } catch {
      return fallback;
    }
  }

  writeState() {
    this.assertSecureStorage();
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, this.encrypt(JSON.stringify(this.state)));
    fs.rmSync(this.statePath, { force: true });
    fs.renameSync(temporary, this.statePath);
  }
}

function normalizeBaseUrl(value, allowInsecureLocalhost) {
  const text = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!text) return "";
  const url = new URL(text);
  const local = new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname);
  if (url.protocol !== "https:" && !(allowInsecureLocalhost && local)) {
    throw new Error("ACCOUNT_CLOUD_URL must use HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "ACCOUNT_CLOUD_URL must not contain credentials, query or fragment.",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function cloudError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}
