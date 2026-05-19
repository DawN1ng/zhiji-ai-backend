const { Op } = require("sequelize");
const { models } = require("./db");

const memory = {
  users: [],
  profiles: [],
  reports: [],
  chats: [],
  orders: [],
  memberships: [],
  analyticsEvents: [],
  errorLogs: [],
  advisorUsage: [],
};

const MODEL_MAP = {
  users: { model: models.User, idKey: "userId" },
  profiles: { model: models.Profile, idKey: "profileId" },
  reports: { model: models.Report, idKey: "reportId" },
  chats: { model: models.Chat, idKey: "chatId" },
  orders: { model: models.Order, idKey: "orderId" },
  memberships: { model: models.Membership, idKey: "membershipId" },
  analyticsEvents: { model: models.AnalyticsEvent, idKey: "eventId" },
  errorLogs: { model: models.ErrorLog, idKey: "errorId" },
  advisorUsage: { model: models.AdvisorUsage, idKey: "usageId" },
};

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function pickColumns(listName, item) {
  if (listName === "users") {
    return { userId: item.userId, openId: item.openId, unionId: item.unionId };
  }
  if (listName === "profiles") {
    return {
      profileId: item.profileId,
      userId: item.userId,
      openId: item.openId,
      nickname: item.nickname,
      personalityType: item.personalityType,
      personalityName: item.personalityName,
    };
  }
  if (listName === "reports") {
    return {
      reportId: item.reportId,
      userId: item.userId,
      openId: item.openId,
      profileId: item.profileId,
      reportType: item.reportType,
    };
  }
  if (listName === "chats") {
    return {
      chatId: item.chatId,
      userId: item.userId,
      openId: item.openId,
      profileId: item.profileId,
      scenario: item.scenario,
      aiSource: item.aiSource,
    };
  }
  if (listName === "orders") {
    return {
      orderId: item.orderId,
      userId: item.userId,
      openId: item.openId,
      profileId: item.profileId,
      productType: item.productType,
      status: item.status,
    };
  }
  if (listName === "memberships") {
    return {
      membershipId: item.membershipId,
      userId: item.userId,
      openId: item.openId,
      planType: item.planType,
      status: item.status,
      expiresAt: item.expiresAt || null,
    };
  }
  if (listName === "analyticsEvents") {
    return {
      eventId: item.eventId,
      userId: item.userId,
      openId: item.openId,
      eventName: item.eventName,
    };
  }
  if (listName === "errorLogs") {
    return {
      errorId: item.errorId,
      userId: item.userId,
      openId: item.openId,
      message: item.message,
    };
  }
  if (listName === "advisorUsage") {
    return {
      usageId: item.usageId,
      userId: item.userId,
      openId: item.openId,
      usageDate: item.usageDate,
    };
  }
  return {};
}

function serialize(record) {
  if (!record) return null;
  const json = typeof record.toJSON === "function" ? record.toJSON() : record;
  return {
    ...(json.payload || {}),
    ...json,
    payload: undefined,
  };
}

function memoryUpsert(listName, item, idKey) {
  const list = memory[listName];
  const idValue = item && item[idKey];
  const nextItem = { ...item, updatedAt: now() };
  if (!nextItem.createdAt) nextItem.createdAt = now();
  const index = idValue ? list.findIndex((current) => current && current[idKey] === idValue) : -1;
  if (index >= 0) {
    list[index] = { ...list[index], ...nextItem };
    return list[index];
  }
  list.unshift(nextItem);
  return nextItem;
}

async function upsert(listName, item, idKey) {
  const config = MODEL_MAP[listName] || {};
  const primaryKey = idKey || config.idKey;
  const model = config.model;
  if (!model) {
    return memoryUpsert(listName, item, primaryKey);
  }
  const idValue = item && item[primaryKey];
  const data = {
    ...pickColumns(listName, item),
    [primaryKey]: idValue,
    payload: item,
  };
  const existing = idValue ? await model.findByPk(idValue) : null;
  if (existing) {
    await existing.update(data);
    return serialize(existing);
  }
  const created = await model.create(data);
  return serialize(created);
}

async function findById(listName, idValue) {
  const config = MODEL_MAP[listName] || {};
  const model = config.model;
  const idKey = config.idKey;
  if (!model) {
    return memory[listName].find((item) => item && item[idKey] === idValue) || null;
  }
  return serialize(await model.findByPk(idValue));
}

async function filterByUser(listName, userId, openId) {
  const config = MODEL_MAP[listName] || {};
  const model = config.model;
  if (!model) {
    return memory[listName].filter((item) => (
      (userId && item.userId === userId) || (openId && item.openId === openId)
    ));
  }
  const rows = await model.findAll({
    where: {
      [Op.or]: [
        userId ? { userId } : null,
        openId ? { openId } : null,
      ].filter(Boolean),
    },
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
  return rows.map(serialize);
}

async function findOneByFields(listName, fields = {}) {
  const config = MODEL_MAP[listName] || {};
  const model = config.model;
  const entries = Object.keys(fields).filter((key) => fields[key] !== undefined && fields[key] !== "");
  if (!entries.length) return null;
  if (!model) {
    return memory[listName].find((item) => entries.every((key) => item[key] === fields[key])) || null;
  }
  const row = await model.findOne({
    where: entries.reduce((memo, key) => {
      memo[key] = fields[key];
      return memo;
    }, {}),
    order: [["createdAt", "DESC"]],
  });
  return serialize(row);
}

async function removeByUser(listNames, userId, openId) {
  await Promise.all(listNames.map(async (listName) => {
    const config = MODEL_MAP[listName] || {};
    const model = config.model;
    if (!model) {
      memory[listName] = memory[listName].filter((item) => item.userId !== userId && item.openId !== openId);
      return;
    }
    await model.destroy({
      where: {
        [Op.or]: [
          userId ? { userId } : null,
          openId ? { openId } : null,
        ].filter(Boolean),
      },
    });
  }));
}

module.exports = {
  memory,
  now,
  createId,
  upsert,
  findById,
  findOneByFields,
  filterByUser,
  removeByUser,
};
