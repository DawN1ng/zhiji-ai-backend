const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, Counter, dbStatus } = require("./db");
const { now, createId, upsert, findById, findOneByFields, filterByUser, removeByUser } = require("./store");
const { callOpenAICompatible, buildLocalDeepReport, getAIConfigStatus, buildAdvisorFallback } = require("./ai");
const {
  createJsapiPayment,
  queryOrder,
  mapTradeStateToOrderStatus,
  decryptResource,
  verifyNotifySignature,
  getPaymentConfigStatus,
} = require("./payment");

const logger = morgan("tiny");
const isProduction = process.env.NODE_ENV === "production";

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({
  verify(req, res, buf) {
    req.rawBody = buf.toString("utf8");
  },
}));
app.use(cors());
app.use(logger);

function logInfo(message, detail = {}) {
  if (isProduction && process.env.ENABLE_VERBOSE_LOGS !== "true") return;
  console.log(message, detail);
}

function logWarn(message, detail = {}) {
  console.warn(message, detail);
}

function logError(message, error, detail = {}) {
  const safeError = error ? {
    name: error.name || "Error",
    message: error.message || String(error),
  } : {};
  console.error(message, {
    ...detail,
    error: safeError,
  });
}

const MEMBERSHIP_PLAN_MAP = {
  membership_monthly: { planType: "one_month", durationDays: 30 },
  membership_one_month: { planType: "one_month", durationDays: 30 },
  membership_three_months: { planType: "three_months", durationDays: 90 },
  membership_six_months: { planType: "six_months", durationDays: 180 },
};

function getMembershipPlan(productType) {
  return MEMBERSHIP_PLAN_MAP[productType] || null;
}

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 更新计数
app.post("/api/count", async (req, res) => {
  const { action } = req.body;
  if (!Counter) {
    res.send({
      code: 0,
      data: 0,
      message: "未配置 MySQL，计数接口仅用于连通性测试",
    });
    return;
  }
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({
      truncate: true,
    });
  }
  res.send({
    code: 0,
    data: await Counter.count(),
  });
});

// 获取计数
app.get("/api/count", async (req, res) => {
  if (!Counter) {
    res.send({
      code: 0,
      data: 0,
      message: "未配置 MySQL，计数接口仅用于连通性测试",
    });
    return;
  }
  const result = await Counter.count();
  res.send({
    code: 0,
    data: result,
  });
});

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

function ok(res, data = {}) {
  res.send({
    code: 0,
    data,
  });
}

function getOpenId(req) {
  return req.headers["x-wx-openid"]
    || req.headers["x-wx-from-openid"]
    || req.headers["x-wx-open-id"]
    || req.headers["x-wx-from-open-id"]
    || req.headers["x-zhiji-openid"]
    || "";
}

function getSessionId(req) {
  return req.headers["x-zhiji-session"] || "";
}

function getUserId(req) {
  const openId = getOpenId(req);
  const sessionId = getSessionId(req);
  return openId || sessionId || "guest";
}

function getTodayText() {
  return new Date().toISOString().slice(0, 10);
}

function getMembershipConfig() {
  return {
    freeAdvisorDailyLimit: 3,
    memberAdvisorDailyLimit: 20,
  };
}

async function getActiveMembership(userId, openId) {
  const memberships = await filterByUser("memberships", userId, openId);
  const nowTime = Date.now();
  return memberships
    .filter((item) => (
      item.status === "active"
      && item.expiresAt
      && new Date(item.expiresAt).getTime() > nowTime
    ))
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0] || null;
}

async function getAdvisorUsage(userId, openId) {
  const usageDate = getTodayText();
  const usage = await findOneByFields("advisorUsage", {
    usageId: `${userId}_${usageDate}`,
  });
  return usage || {
    usageId: `${userId}_${usageDate}`,
    userId,
    openId,
    usageDate,
    count: 0,
  };
}

async function buildEntitlement(req) {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  const membership = await getActiveMembership(userId, openId);
  const usage = await getAdvisorUsage(userId, openId);
  const config = getMembershipConfig();
  const isMember = Boolean(membership);
  const advisorDailyLimit = isMember ? config.memberAdvisorDailyLimit : config.freeAdvisorDailyLimit;
  const advisorUsedToday = Number(usage.count || 0);
  return {
    membership,
    membershipStatus: isMember ? "active" : "free",
    planTitle: isMember ? "知己月令" : "免费版",
    isMember,
    expiresAt: isMember ? membership.expiresAt : "",
    advisorDailyLimit,
    advisorUsedToday,
    advisorRemainingToday: Math.max(0, advisorDailyLimit - advisorUsedToday),
    canViewAdvancedToday: isMember,
    canSaveTodayHistory: isMember,
    canViewFullEnergyReview: isMember,
    canViewFullSolarTerm: isMember,
    canUseEnhancedCompanion: isMember,
  };
}

function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      logError("[route/error]", error, {
        method: req.method,
        path: req.path,
      });
      res.status(500).send({
        code: -1,
        message: error.message || "server error",
      });
    });
  };
}

function debugRoute(handler) {
  return asyncRoute(async (req, res) => {
    if (process.env.ENABLE_DEBUG_ROUTES !== "true") {
      res.status(404).send({
        code: 404,
        message: "not found",
      });
      return;
    }
    const token = process.env.DEBUG_TOKEN || "";
    const requestToken = req.headers["x-debug-token"] || req.query.debug_token || "";
    if (!token || requestToken !== token) {
      res.status(404).send({
        code: 404,
        message: "not found",
      });
      return;
    }
    await handler(req, res);
  });
}

app.post("/auth/wechat/login", asyncRoute(async (req, res) => {
  const openId = getOpenId(req) || `local_${req.body.anonymousId || createId("anon")}`;
  const unionId = req.headers["x-wx-unionid"] || "";
  const user = await upsert("users", {
    userId: `user_${openId}`,
    openId,
    unionId,
  }, "userId");
  ok(res, {
    openId,
    unionId,
    user,
  });
}));

app.post("/profiles", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = req.body.userId || `user_${getUserId(req)}`;
  const profile = await upsert("profiles", {
    ...req.body,
    userId,
    openId: req.body.openId || openId,
  }, "profileId");
  ok(res, profile);
}));

app.post("/profiles/list", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  ok(res, {
    profiles: await filterByUser("profiles", userId, openId),
  });
}));

app.post("/reports/archive", asyncRoute(async (req, res) => {
  const report = await upsert("reports", {
    reportId: req.body.reportId || createId("report"),
    ...req.body,
    userId: req.body.userId || `user_${getUserId(req)}`,
    openId: req.body.openId || getOpenId(req),
  }, "reportId");
  ok(res, report);
}));

app.post("/reports/delete-history", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  await removeByUser(["profiles", "reports"], userId, openId);
  ok(res, { deleted: true });
}));

app.post("/account/delete-data", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  await removeByUser(["profiles", "reports", "chats", "orders", "memberships"], userId, openId);
  ok(res, { deleted: true });
}));

app.post("/orders", asyncRoute(async (req, res) => {
  const product = req.body.product || {};
  const profile = req.body.profile || {};
  const existingPaid = product.productType === "deep_report" && profile.profileId
    ? await findOneByFields("orders", {
        profileId: profile.profileId,
        productType: product.productType,
        status: "paid",
      })
    : null;
  if (existingPaid) {
    ok(res, existingPaid);
    return;
  }
  const order = await upsert("orders", {
    orderId: createId("order"),
    userId: profile.userId || `user_${getUserId(req)}`,
    openId: profile.openId || getOpenId(req),
    profileId: profile.profileId || "",
    productType: product.productType,
    productName: product.title,
    amount: Number(product.amount || 0),
    currency: product.currency || "CNY",
    planType: product.planType || "",
    durationDays: Number(product.durationDays || 0),
    status: "pending",
    paymentParams: null,
  }, "orderId");
  const paymentParams = await createJsapiPayment(order, req);
  const payableOrder = await upsert("orders", {
    ...order,
    paymentParams,
  }, "orderId");
  ok(res, payableOrder);
}));

app.post("/orders/notify", asyncRoute(async (req, res) => {
  verifyNotifySignature(req.headers, req.rawBody);
  const resource = req.body && req.body.resource;
  if (!resource) {
    res.status(400).send({ code: "FAIL", message: "缺少支付通知资源" });
    return;
  }
  const transaction = decryptResource(resource);
  const orderId = transaction.out_trade_no;
  const existingOrder = await findById("orders", orderId);
  logInfo("[orders/notify]", {
    orderId,
    tradeState: transaction.trade_state,
    hasExistingOrder: Boolean(existingOrder),
  });
  if (existingOrder) {
    await upsert("orders", {
      ...existingOrder,
      status: mapTradeStateToOrderStatus(transaction.trade_state),
      transactionId: transaction.transaction_id || "",
      paidAt: transaction.success_time || existingOrder.paidAt || "",
      paymentNotify: transaction,
    }, "orderId");
  }
  res.send({ code: "SUCCESS", message: "成功" });
}));

app.post("/orders/verify", asyncRoute(async (req, res) => {
  const order = await findById("orders", req.body.orderId);
  if (!order) {
    ok(res, {
      orderId: req.body.orderId,
      status: "pending",
    });
    return;
  }
  const transaction = await queryOrder(order.orderId).catch((error) => {
    logWarn("[orders/verify] query failed", {
      orderId: order.orderId,
      error: {
        name: error.name || "Error",
        message: error.message || String(error),
      },
    });
    return null;
  });
  if (!transaction) {
    ok(res, order);
    return;
  }
  const verifiedOrder = await upsert("orders", {
    ...order,
    status: mapTradeStateToOrderStatus(transaction.trade_state),
    transactionId: transaction.transaction_id || order.transactionId || "",
    paidAt: transaction.success_time || order.paidAt || "",
    paymentQuery: transaction,
  }, "orderId");
  ok(res, verifiedOrder);
}));

app.post("/orders/list", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  ok(res, {
    orders: await filterByUser("orders", userId, openId),
  });
}));

app.post("/entitlements/status", asyncRoute(async (req, res) => {
  ok(res, await buildEntitlement(req));
}));

app.post("/membership/activate", asyncRoute(async (req, res) => {
  const userId = `user_${getUserId(req)}`;
  const openId = getOpenId(req);
  const order = req.body.orderId ? await findById("orders", req.body.orderId) : null;
  const membershipPlan = order ? getMembershipPlan(order.productType) : null;
  if (!order || order.status !== "paid" || !membershipPlan) {
    res.status(400).send({
      code: 400,
      message: "会员订单未完成支付",
    });
    return;
  }
  const memberships = await filterByUser("memberships", userId, openId);
  const usedMembership = memberships.find((item) => item.sourceOrderId === order.orderId);
  if (usedMembership) {
    res.status(409).send({
      code: 409,
      message: "该会员订单已使用，请重新支付开通",
    });
    return;
  }
  const startedAt = now();
  const latestActive = memberships
    .filter((item) => item.status === "active" && item.expiresAt)
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];
  const baseTime = latestActive && new Date(latestActive.expiresAt).getTime() > Date.now()
    ? new Date(latestActive.expiresAt).getTime()
    : Date.now();
  const durationDays = Number(membershipPlan.durationDays || 30);
  const expiresAt = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const membership = await upsert("memberships", {
    membershipId: createId("membership"),
    userId,
    openId,
    planType: membershipPlan.planType,
    productType: order.productType,
    durationDays,
    status: "active",
    startedAt,
    expiresAt,
    sourceOrderId: order.orderId,
  }, "membershipId");
  ok(res, membership);
}));

app.post("/advisor/usage/consume", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  const entitlement = await buildEntitlement(req);
  if (entitlement.advisorRemainingToday <= 0) {
    res.status(403).send({
      code: 403,
      message: "今日 AI 顾问次数已用完",
      data: entitlement,
    });
    return;
  }
  const usage = await getAdvisorUsage(userId, openId);
  await upsert("advisorUsage", {
    ...usage,
    count: Number(usage.count || 0) + 1,
  }, "usageId");
  ok(res, await buildEntitlement(req));
}));

app.post("/advisor/ask", asyncRoute(async (req, res) => {
  const { question, profile, scenario } = req.body;
  const fallback = buildAdvisorFallback(question, profile);
  let aiSource = "remote";
  const answer = await callOpenAICompatible("advisor", {
    question,
    profile,
    scenario,
  }, {
    maxTokens: 1200,
  }).catch((error) => {
    aiSource = "fallback";
    logWarn("[advisor/ask] AI fallback", {
      scenario,
      profileId: profile && profile.profileId ? profile.profileId : "",
      error: {
        name: error.name || "Error",
        message: error.message || String(error),
      },
    });
    return fallback;
  }) || {
    ...fallback,
  };
  if (!answer || aiSource !== "remote") {
    aiSource = "fallback";
  }
  const chat = await upsert("chats", {
    chatId: createId("chat"),
    userId: profile && profile.userId ? profile.userId : `user_${getUserId(req)}`,
    openId: profile && profile.openId ? profile.openId : getOpenId(req),
    profileId: profile && profile.profileId ? profile.profileId : "",
    question,
    scenario,
    answer,
    aiSource,
  }, "chatId");
  logInfo("[advisor/ask]", {
    aiSource,
    scenario,
    profileId: profile && profile.profileId ? profile.profileId : "",
  });
  ok(res, {
    answer,
    aiSource,
    chatId: chat.chatId,
  });
}));

app.post("/ai/daily-companion", asyncRoute(async (req, res) => {
  let aiSource = "remote";
  const fallback = req.body && req.body.payload ? req.body.payload.fallback : null;
  const answer = await callOpenAICompatible("dailyCompanion", req.body, {
    model: req.body.model,
    temperature: req.body.temperature,
    maxTokens: Math.min(Number(req.body.maxTokens || 480), 700),
    useJsonResponseFormat: req.body.useJsonResponseFormat !== false,
  }).catch((error) => {
    aiSource = "fallback";
    logWarn("[ai/daily-companion] AI fallback", {
      error: {
        name: error.name || "Error",
        message: error.message || String(error),
      },
    });
    return fallback || {
      response: "今天先把自己放回心里。能记录下此刻状态，就已经是在温柔地照看自己。",
      action: "只做一件最小的小事。",
      focus: "照看自己",
      review: "",
    };
  }) || fallback || {
    response: "今天先把自己放回心里。能记录下此刻状态，就已经是在温柔地照看自己。",
    action: "只做一件最小的小事。",
    focus: "照看自己",
    review: "",
  };
  ok(res, {
    ...answer,
    aiSource,
  });
}));

app.post("/ai/deep-report", asyncRoute(async (req, res) => {
  const profile = req.body && req.body.payload && req.body.payload.profile
    ? req.body.payload.profile
    : req.body.profile;
  const profileId = profile && profile.profileId ? profile.profileId : "";
  const inputHash = req.body && req.body.inputHash ? req.body.inputHash : "";
  const schemaVersion = req.body && req.body.schemaVersion ? req.body.schemaVersion : "deep_report_v4_action_handbook";
  const reportId = inputHash ? `deep_${inputHash}` : `deep_${profileId}_${schemaVersion}`;
  if (profileId || inputHash) {
    const existingReport = await findOneByFields("reports", {
      reportId,
      reportType: "deep_report",
    });
    if (existingReport && existingReport.report) {
      ok(res, existingReport.report);
      return;
    }
  }
  let aiSource = "remote";
  const report = await callOpenAICompatible("deepReport", req.body, {
    model: req.body.model,
    temperature: req.body.temperature,
    maxTokens: Math.min(Number(req.body.maxTokens || 3600), 4200),
    useJsonResponseFormat: req.body.useJsonResponseFormat !== false,
  }).catch((error) => {
    aiSource = "fallback";
    logWarn("[ai/deep-report] AI fallback", {
      profileId,
      inputHash: inputHash ? inputHash.slice(0, 12) : "",
      error: {
        name: error.name || "Error",
        message: error.message || String(error),
      },
    });
    return buildLocalDeepReport(req.body);
  }) || {
    ...buildLocalDeepReport(req.body),
  };
  if (profileId) {
    await upsert("reports", {
      reportId,
      userId: profile.userId || `user_${getUserId(req)}`,
      openId: profile.openId || getOpenId(req),
      profileId,
      reportType: "deep_report",
      inputHash,
      schemaVersion,
      report,
      aiSource,
    }, "reportId").catch((error) => {
      logError("[ai/deep-report] save report failed", error, {
        errors: Array.isArray(error.errors)
          ? error.errors.map((item) => ({
              message: item.message,
              path: item.path,
            }))
          : [],
        reportId,
        profileId,
        inputHash: inputHash ? inputHash.slice(0, 12) : "",
      });
    });
  }
  ok(res, report);
}));

app.post("/analytics/events", asyncRoute(async (req, res) => {
  const events = Array.isArray(req.body.events) ? req.body.events : [];
  await Promise.all(events.map((event) => upsert("analyticsEvents", {
      eventId: event.eventId || createId("event"),
      ...event,
      receivedAt: now(),
    }, "eventId")));
  if (events.length) {
    logInfo("[analytics/events]", {
      accepted: events.length,
      firstEventName: events[0] && events[0].eventName,
    });
  }
  ok(res, {
    accepted: events.length,
  });
}));

app.post("/errors/report", asyncRoute(async (req, res) => {
  const errors = Array.isArray(req.body.errors) ? req.body.errors : [];
  await Promise.all(errors.map((error) => upsert("errorLogs", {
      errorId: error.errorId || createId("error"),
      ...error,
      receivedAt: now(),
    }, "errorId")));
  if (errors.length) {
    logWarn("[errors/report]", {
      accepted: errors.length,
      firstContextSource: errors[0] && errors[0].context ? errors[0].context.source || errors[0].context.page || "" : "",
    });
  }
  ok(res, {
    accepted: errors.length,
  });
}));

app.get("/debug/ai", debugRoute(async (req, res) => {
  ok(res, {
    ...getAIConfigStatus(),
    nodeVersion: process.version,
  });
}));

app.get("/debug/db", debugRoute(async (req, res) => {
  ok(res, {
    hasMysqlAddress: Boolean(process.env.MYSQL_ADDRESS),
    hasMysqlUsername: Boolean(process.env.MYSQL_USERNAME),
    hasMysqlPassword: Boolean(process.env.MYSQL_PASSWORD),
    database: process.env.MYSQL_DATABASE || "nodejs_demo",
    status: dbStatus,
  });
}));

app.get("/debug/payment", debugRoute(async (req, res) => {
  ok(res, {
    wechatPay: getPaymentConfigStatus(),
  });
}));

app.get("/debug/report-store", debugRoute(async (req, res) => {
  const reportId = createId("debug_report");
  const saved = await upsert("reports", {
    reportId,
    userId: `user_${getUserId(req)}`,
    openId: getOpenId(req),
    profileId: "debug_profile",
    reportType: "debug",
    inputHash: "debug_input_hash",
    schemaVersion: "debug_schema",
    report: { ok: true, createdAt: now() },
  }, "reportId");
  ok(res, {
    saved: Boolean(saved),
    reportId,
  });
}));

app.get("/debug/openid", debugRoute(async (req, res) => {
  ok(res, {
    hasOpenId: Boolean(getOpenId(req)),
    openIdPrefix: getOpenId(req) ? getOpenId(req).slice(0, 8) : "",
    source: req.headers["x-wx-source"] || "",
    hasWxOpenIdHeader: Boolean(req.headers["x-wx-openid"]),
    hasZhijiOpenIdHeader: Boolean(req.headers["x-zhiji-openid"]),
  });
}));

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    logInfo("[server/start]", { port });
  });
}

bootstrap();
