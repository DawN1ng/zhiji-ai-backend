const crypto = require("crypto");
const fetch = require("node-fetch");

const WECHAT_PAY_API = "https://api.mch.weixin.qq.com";

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function getPaymentConfig() {
  return {
    appid: getEnv("WECHAT_APPID"),
    mchid: getEnv("WECHAT_PAY_MCH_ID"),
    serialNo: getEnv("WECHAT_PAY_SERIAL_NO"),
    privateKey: normalizePrivateKey(getEnv("WECHAT_PAY_PRIVATE_KEY")),
    apiV3Key: getEnv("WECHAT_PAY_API_V3_KEY"),
    notifyUrl: getEnv("WECHAT_PAY_NOTIFY_URL"),
    publicKey: normalizePem(getEnv("WECHAT_PAY_PUBLIC_KEY")),
    publicKeyId: getEnv("WECHAT_PAY_PUBLIC_KEY_ID"),
    platformCertificate: normalizePrivateKey(getEnv("WECHAT_PAY_PLATFORM_CERTIFICATE")),
    platformSerialNo: getEnv("WECHAT_PAY_PLATFORM_SERIAL_NO"),
  };
}

function normalizePem(value) {
  return value ? value.replace(/\\n/g, "\n") : "";
}

function normalizePrivateKey(value) {
  return normalizePem(value);
}

function assertConfig(keys, config = getPaymentConfig()) {
  const missing = keys.filter((key) => !config[key]);
  if (missing.length) {
    const error = new Error(`微信支付未完成生产配置：${missing.join(", ")}`);
    error.code = "WECHAT_PAY_CONFIG_MISSING";
    error.missing = missing;
    throw error;
  }
}

function assertPaymentConfig(config = getPaymentConfig()) {
  assertConfig(["appid", "mchid", "serialNo", "privateKey", "notifyUrl"], config);
}

function assertNotifyConfig(config = getPaymentConfig()) {
  assertConfig(["apiV3Key"], config);
  if (!config.publicKey && !config.platformCertificate) {
    const error = new Error("微信支付未完成生产配置：WECHAT_PAY_PUBLIC_KEY 或 WECHAT_PAY_PLATFORM_CERTIFICATE");
    error.code = "WECHAT_PAY_CONFIG_MISSING";
    error.missing = ["WECHAT_PAY_PUBLIC_KEY"];
    throw error;
  }
}

function randomNonce(length = 32) {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function signWithPrivateKey(message, privateKey) {
  return crypto
    .createSign("RSA-SHA256")
    .update(message)
    .end()
    .sign(privateKey, "base64");
}

function buildAuthorization(method, urlPath, body = "", config = getPaymentConfig()) {
  assertPaymentConfig(config);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomNonce();
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = signWithPrivateKey(message, config.privateKey);
  const token = [
    `mchid="${config.mchid}"`,
    `nonce_str="${nonce}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${config.serialNo}"`,
    `signature="${signature}"`,
  ].join(",");
  return `WECHATPAY2-SHA256-RSA2048 ${token}`;
}

function fenFromYuan(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

async function wechatPayRequest(method, urlPath, payload = null) {
  const body = payload ? JSON.stringify(payload) : "";
  const response = await fetch(`${WECHAT_PAY_API}${urlPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: buildAuthorization(method, urlPath, body),
    },
    body: body || undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || data.detail || JSON.stringify(data);
    throw new Error(`微信支付请求失败：${response.status} ${message}`);
  }
  return data;
}

async function createJsapiPayment(order, req) {
  const config = getPaymentConfig();
  assertPaymentConfig(config);
  if (!order.openId) {
    throw new Error("微信支付需要用户 OpenID");
  }

  const payload = {
    appid: config.appid,
    mchid: config.mchid,
    description: order.productName || "知己AI服务",
    out_trade_no: order.orderId,
    notify_url: config.notifyUrl,
    amount: {
      total: fenFromYuan(order.amount),
      currency: order.currency || "CNY",
    },
    payer: {
      openid: order.openId,
    },
    scene_info: {
      payer_client_ip: getClientIp(req),
    },
  };

  const data = await wechatPayRequest("POST", "/v3/pay/transactions/jsapi", payload);
  return buildMiniProgramPaymentParams(data.prepay_id, config);
}

function buildMiniProgramPaymentParams(prepayId, config = getPaymentConfig()) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomNonce();
  const packageValue = `prepay_id=${prepayId}`;
  const signType = "RSA";
  const paySign = signWithPrivateKey(
    `${config.appid}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`,
    config.privateKey
  );
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType,
    paySign,
  };
}

async function queryOrder(orderId) {
  const config = getPaymentConfig();
  assertPaymentConfig(config);
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(config.mchid)}`;
  return wechatPayRequest("GET", path);
}

function mapTradeStateToOrderStatus(tradeState) {
  if (tradeState === "SUCCESS") return "paid";
  if (tradeState === "CLOSED" || tradeState === "REVOKED" || tradeState === "PAYERROR") return "failed";
  return "pending";
}

function decryptResource(resource) {
  const config = getPaymentConfig();
  assertNotifyConfig(config);
  const key = Buffer.from(config.apiV3Key, "utf8");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(resource.nonce, "utf8")
  );
  decipher.setAuthTag(Buffer.from(resource.ciphertext, "base64").slice(-16));
  decipher.setAAD(Buffer.from(resource.associated_data || "", "utf8"));
  const ciphertext = Buffer.from(resource.ciphertext, "base64").slice(0, -16);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function verifyNotifySignature(headers, rawBody) {
  const config = getPaymentConfig();
  assertNotifyConfig(config);
  const timestamp = headers["wechatpay-timestamp"];
  const nonce = headers["wechatpay-nonce"];
  const signature = headers["wechatpay-signature"];
  const serial = headers["wechatpay-serial"];
  if (!timestamp || !nonce || !signature || !serial) {
    throw new Error("微信支付通知缺少签名头");
  }
  const verifierKey = selectNotifyVerifierKey(config, serial);
  if (!verifierKey) {
    throw new Error("微信支付通知签名公钥或平台证书不匹配");
  }
  const message = `${timestamp}\n${nonce}\n${rawBody || ""}\n`;
  const verified = crypto
    .createVerify("RSA-SHA256")
    .update(message)
    .end()
    .verify(verifierKey, signature, "base64");
  if (!verified) {
    throw new Error("微信支付通知签名校验失败");
  }
}

function selectNotifyVerifierKey(config, serial) {
  if (config.publicKey) {
    if (!config.publicKeyId || config.publicKeyId === serial) {
      return config.publicKey;
    }
    return "";
  }
  if (config.platformCertificate) {
    if (!config.platformSerialNo || config.platformSerialNo === serial) {
      return config.platformCertificate;
    }
  }
  return "";
}

function getPaymentConfigStatus() {
  const config = getPaymentConfig();
  return Object.keys(config).reduce((memo, key) => {
    memo[key] = Boolean(config[key]);
    return memo;
  }, {});
}

module.exports = {
  createJsapiPayment,
  queryOrder,
  mapTradeStateToOrderStatus,
  decryptResource,
  verifyNotifySignature,
  getPaymentConfigStatus,
};
