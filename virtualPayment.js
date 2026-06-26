const crypto = require("crypto");
const fetch = global.fetch || require("node-fetch");

const WECHAT_API = "https://api.weixin.qq.com";
const REQUEST_VIRTUAL_PAYMENT_URI = "requestVirtualPayment";

let accessTokenCache = {
  token: "",
  expiresAt: 0,
};

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function getVirtualPaymentConfig() {
  const env = Number(getEnv("WECHAT_VPAY_ENV", "1"));
  return {
    appid: getEnv("WECHAT_APPID"),
    appSecret: getEnv("WECHAT_APP_SECRET"),
    offerId: getEnv("WECHAT_VPAY_OFFER_ID"),
    env: env === 0 ? 0 : 1,
    appKeySandbox: getEnv("WECHAT_VPAY_APPKEY_SANDBOX"),
    appKeyProd: getEnv("WECHAT_VPAY_APPKEY_PROD"),
    goods: {
      deepReportRegular: getEnv("WECHAT_VPAY_GOODS_DEEP_REPORT_REGULAR"),
      deepReportMember: getEnv("WECHAT_VPAY_GOODS_DEEP_REPORT_MEMBER"),
      membershipOneMonth: getEnv("WECHAT_VPAY_GOODS_MEMBERSHIP_ONE_MONTH"),
      membershipThreeMonths: getEnv("WECHAT_VPAY_GOODS_MEMBERSHIP_THREE_MONTHS"),
      membershipSixMonths: getEnv("WECHAT_VPAY_GOODS_MEMBERSHIP_SIX_MONTHS"),
    },
  };
}

function getActiveAppKey(config = getVirtualPaymentConfig()) {
  return config.env === 0 ? config.appKeyProd : config.appKeySandbox;
}

function assertVirtualPaymentConfig(config = getVirtualPaymentConfig()) {
  const missing = [];
  if (!config.appid) missing.push("WECHAT_APPID");
  if (!config.appSecret) missing.push("WECHAT_APP_SECRET");
  if (!config.offerId) missing.push("WECHAT_VPAY_OFFER_ID");
  if (!getActiveAppKey(config)) {
    missing.push(config.env === 0 ? "WECHAT_VPAY_APPKEY_PROD" : "WECHAT_VPAY_APPKEY_SANDBOX");
  }
  if (missing.length) {
    const error = new Error(`微信虚拟支付未完成配置：${missing.join(", ")}`);
    error.code = "WECHAT_VPAY_CONFIG_MISSING";
    error.missing = missing;
    throw error;
  }
}

function assertVirtualProductConfig(product, config = getVirtualPaymentConfig()) {
  assertVirtualPaymentConfig(config);
  if (!product || !product.virtualProductKey || !config.goods[product.virtualProductKey]) {
    const error = new Error(`微信虚拟支付未配置道具：${product && product.virtualProductKey ? product.virtualProductKey : "unknown"}`);
    error.code = "WECHAT_VPAY_GOODS_MISSING";
    error.missing = [product && product.virtualProductKey ? product.virtualProductKey : "unknown"];
    throw error;
  }
}

function fenFromYuan(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function hmacSha256Hex(key, message) {
  return crypto
    .createHmac("sha256", key)
    .update(message)
    .digest("hex");
}

function calcPaySig(uri, signData, appKey = getActiveAppKey()) {
  return hmacSha256Hex(appKey, `${uri}&${signData}`);
}

function calcSignature(signData, sessionKey) {
  if (!sessionKey) {
    const error = new Error("微信虚拟支付需要有效 session_key，请重新登录后再试");
    error.code = "WECHAT_SESSION_KEY_MISSING";
    throw error;
  }
  return hmacSha256Hex(sessionKey, signData);
}

async function code2Session(jsCode) {
  const config = getVirtualPaymentConfig();
  if (!jsCode) {
    throw new Error("微信登录缺少 code");
  }
  if (!config.appid || !config.appSecret) {
    const error = new Error("微信登录未配置 WECHAT_APPID 或 WECHAT_APP_SECRET");
    error.code = "WECHAT_LOGIN_CONFIG_MISSING";
    throw error;
  }
  const params = new URLSearchParams({
    appid: config.appid,
    secret: config.appSecret,
    js_code: jsCode,
    grant_type: "authorization_code",
  });
  const response = await fetch(`${WECHAT_API}/sns/jscode2session?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode) {
    throw new Error(`微信登录失败：${data.errcode || response.status} ${data.errmsg || ""}`.trim());
  }
  return data;
}

async function getAccessToken(config = getVirtualPaymentConfig()) {
  if (accessTokenCache.token && accessTokenCache.expiresAt > Date.now() + 60000) {
    return accessTokenCache.token;
  }
  if (!config.appid || !config.appSecret) {
    const error = new Error("微信虚拟支付查单未配置 WECHAT_APPID 或 WECHAT_APP_SECRET");
    error.code = "WECHAT_ACCESS_TOKEN_CONFIG_MISSING";
    throw error;
  }
  const params = new URLSearchParams({
    grant_type: "client_credential",
    appid: config.appid,
    secret: config.appSecret,
  });
  const response = await fetch(`${WECHAT_API}/cgi-bin/token?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode || !data.access_token) {
    throw new Error(`微信 access_token 获取失败：${data.errcode || response.status} ${data.errmsg || ""}`.trim());
  }
  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 7200) - 300) * 1000,
  };
  return accessTokenCache.token;
}

function buildVirtualPaymentParams(order, product, sessionKey) {
  const config = getVirtualPaymentConfig();
  assertVirtualProductConfig(product, config);
  const amountFen = fenFromYuan(product.amount);
  const signData = JSON.stringify({
    offerId: config.offerId,
    buyQuantity: 1,
    env: config.env,
    currencyType: "CNY",
    productId: config.goods[product.virtualProductKey],
    goodsPrice: amountFen,
    outTradeNo: order.orderId,
    attach: order.orderId,
  });
  const appKey = getActiveAppKey(config);
  return {
    provider: "virtual",
    mode: "short_series_goods",
    signData,
    paySig: calcPaySig(REQUEST_VIRTUAL_PAYMENT_URI, signData, appKey),
    signature: calcSignature(signData, sessionKey),
  };
}

async function xpayRequest(uri, payload, options = {}) {
  const config = getVirtualPaymentConfig();
  assertVirtualPaymentConfig(config);
  const body = JSON.stringify(payload);
  const accessToken = await getAccessToken(config);
  const params = new URLSearchParams({
    access_token: accessToken,
  });
  if (options.withPaySig !== false) {
    params.set("pay_sig", calcPaySig(uri, body, getActiveAppKey(config)));
  }
  const response = await fetch(`${WECHAT_API}${uri}?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode) {
    throw new Error(`微信虚拟支付接口失败：${uri} ${data.errcode || response.status} ${data.errmsg || ""}`.trim());
  }
  return data;
}

async function queryVirtualOrder(order) {
  const config = getVirtualPaymentConfig();
  return xpayRequest("/xpay/query_order", {
    openid: order.openId,
    env: Number(order.virtualEnv !== undefined ? order.virtualEnv : config.env),
    order_id: order.orderId,
  });
}

async function notifyVirtualGoodsProvided(order) {
  const config = getVirtualPaymentConfig();
  return xpayRequest("/xpay/notify_provide_goods", {
    order_id: order.orderId,
    env: Number(order.virtualEnv !== undefined ? order.virtualEnv : config.env),
  }, {
    withPaySig: false,
  });
}

function mapVirtualOrderStatus(status) {
  const value = Number(status);
  if (value === 2 || value === 3 || value === 4) return "paid";
  if (value === 5 || value === 8) return "refunded";
  if (value === 6) return "failed";
  return "pending";
}

function getVirtualPaymentConfigStatus() {
  const config = getVirtualPaymentConfig();
  const goods = Object.keys(config.goods).reduce((memo, key) => {
    memo[key] = Boolean(config.goods[key]);
    return memo;
  }, {});
  return {
    appid: Boolean(config.appid),
    appSecret: Boolean(config.appSecret),
    offerId: Boolean(config.offerId),
    env: config.env,
    appKeySandbox: Boolean(config.appKeySandbox),
    appKeyProd: Boolean(config.appKeyProd),
    activeAppKey: Boolean(getActiveAppKey(config)),
    goods,
  };
}

module.exports = {
  code2Session,
  fenFromYuan,
  buildVirtualPaymentParams,
  queryVirtualOrder,
  notifyVirtualGoodsProvided,
  mapVirtualOrderStatus,
  getVirtualPaymentConfig,
  getVirtualPaymentConfigStatus,
  calcPaySig,
  calcSignature,
};
