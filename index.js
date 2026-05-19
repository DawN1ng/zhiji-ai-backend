const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, Counter } = require("./db");
const { store, now, createId, upsert, filterByUser } = require("./store");
const { callOpenAICompatible, buildAdvisorFallback } = require("./ai");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

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
  return req.headers["x-wx-openid"] || req.headers["x-wx-from-openid"] || "";
}

function getSessionId(req) {
  return req.headers["x-zhiji-session"] || "";
}

function getUserId(req) {
  const openId = getOpenId(req);
  const sessionId = getSessionId(req);
  return openId || sessionId || "guest";
}

function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error(error);
      res.status(500).send({
        code: -1,
        message: error.message || "server error",
      });
    });
  };
}

app.post("/auth/wechat/login", asyncRoute(async (req, res) => {
  const openId = getOpenId(req) || `local_${req.body.anonymousId || createId("anon")}`;
  const unionId = req.headers["x-wx-unionid"] || "";
  const user = upsert("users", {
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
  const profile = upsert("profiles", {
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
    profiles: filterByUser("profiles", userId, openId),
  });
}));

app.post("/reports/archive", asyncRoute(async (req, res) => {
  const report = upsert("reports", {
    ...req.body,
    userId: req.body.userId || `user_${getUserId(req)}`,
    openId: req.body.openId || getOpenId(req),
  }, "reportId");
  ok(res, report);
}));

app.post("/account/delete-data", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  ["profiles", "reports", "chats", "orders", "memberships"].forEach((listName) => {
    store[listName] = store[listName].filter((item) => item.userId !== userId && item.openId !== openId);
  });
  ok(res, { deleted: true });
}));

app.post("/orders", asyncRoute(async (req, res) => {
  const product = req.body.product || {};
  const profile = req.body.profile || {};
  const order = upsert("orders", {
    orderId: createId("order"),
    userId: profile.userId || `user_${getUserId(req)}`,
    openId: profile.openId || getOpenId(req),
    profileId: profile.profileId || "",
    productType: product.productType,
    productName: product.title,
    amount: Number(product.amount || 0),
    currency: product.currency || "CNY",
    status: "pending",
    paymentParams: null,
  }, "orderId");
  ok(res, order);
}));

app.post("/orders/verify", asyncRoute(async (req, res) => {
  const order = store.orders.find((item) => item.orderId === req.body.orderId);
  ok(res, order || {
    orderId: req.body.orderId,
    status: "pending",
  });
}));

app.post("/orders/list", asyncRoute(async (req, res) => {
  const openId = getOpenId(req);
  const userId = `user_${getUserId(req)}`;
  ok(res, {
    orders: filterByUser("orders", userId, openId),
  });
}));

app.post("/membership/activate", asyncRoute(async (req, res) => {
  const userId = `user_${getUserId(req)}`;
  const openId = getOpenId(req);
  const startedAt = now();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const membership = upsert("memberships", {
    membershipId: createId("membership"),
    userId,
    openId,
    planType: "monthly",
    status: "active",
    startedAt,
    expiresAt,
    sourceOrderId: req.body.orderId || "",
  }, "membershipId");
  ok(res, membership);
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
    console.error("[advisor/ask] AI fallback:", error.message);
    return {
      ...fallback,
      debugMessage: error.message,
    };
  }) || {
    ...fallback,
    debugMessage: "OPENAI_BASE_URL 或 OPENAI_API_KEY 未配置",
  };
  const chat = upsert("chats", {
    chatId: createId("chat"),
    userId: profile && profile.userId ? profile.userId : `user_${getUserId(req)}`,
    openId: profile && profile.openId ? profile.openId : getOpenId(req),
    profileId: profile && profile.profileId ? profile.profileId : "",
    question,
    scenario,
    answer,
    aiSource,
  }, "chatId");
  console.log("[advisor/ask]", {
    question,
    aiSource,
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    hasBaseUrl: Boolean(process.env.OPENAI_BASE_URL),
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
  ok(res, {
    answer,
    aiSource,
    chatId: chat.chatId,
  });
}));

app.post("/ai/deep-report", asyncRoute(async (req, res) => {
  const report = await callOpenAICompatible("deepReport", req.body, {
    maxTokens: 3200,
  });
  ok(res, report);
}));

app.post("/analytics/events", asyncRoute(async (req, res) => {
  const events = Array.isArray(req.body.events) ? req.body.events : [];
  events.forEach((event) => {
    store.analyticsEvents.unshift({
      ...event,
      receivedAt: now(),
    });
  });
  ok(res, {
    accepted: events.length,
  });
}));

app.post("/errors/report", asyncRoute(async (req, res) => {
  const errors = Array.isArray(req.body.errors) ? req.body.errors : [];
  errors.forEach((error) => {
    store.errorLogs.unshift({
      ...error,
      receivedAt: now(),
    });
  });
  ok(res, {
    accepted: errors.length,
  });
}));

app.get("/debug/ai", asyncRoute(async (req, res) => {
  ok(res, {
    hasOpenAIBaseUrl: Boolean(process.env.OPENAI_BASE_URL),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    nodeVersion: process.version,
  });
}));

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
