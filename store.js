const store = {
  users: [],
  profiles: [],
  reports: [],
  chats: [],
  orders: [],
  memberships: [],
  analyticsEvents: [],
  errorLogs: [],
  advisorUsage: {}
};

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function upsert(listName, item, idKey) {
  const list = store[listName];
  const idValue = item && item[idKey];
  const nextItem = {
    ...item,
    updatedAt: now()
  };
  if (!nextItem.createdAt) nextItem.createdAt = now();
  const index = idValue ? list.findIndex((current) => current && current[idKey] === idValue) : -1;
  if (index >= 0) {
    list[index] = {
      ...list[index],
      ...nextItem
    };
    return list[index];
  }
  list.unshift(nextItem);
  return nextItem;
}

function filterByUser(listName, userId, openId) {
  return store[listName].filter((item) => (
    (userId && item.userId === userId)
    || (openId && item.openId === openId)
  ));
}

module.exports = {
  store,
  now,
  createId,
  upsert,
  filterByUser
};
