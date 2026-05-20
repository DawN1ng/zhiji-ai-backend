const { Sequelize, DataTypes } = require("sequelize");

const {
  MYSQL_USERNAME,
  MYSQL_PASSWORD,
  MYSQL_ADDRESS = "",
  MYSQL_DATABASE = "nodejs_demo",
} = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");
const hasMysqlConfig = Boolean(MYSQL_USERNAME && MYSQL_PASSWORD && host);

const sequelize = hasMysqlConfig
  ? new Sequelize(MYSQL_DATABASE, MYSQL_USERNAME, MYSQL_PASSWORD, {
      host,
      port,
      dialect: "mysql",
      logging: false,
      define: {
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci",
      },
    })
  : null;

function defineJsonModel(name, fields) {
  if (!sequelize) return null;
  return sequelize.define(name, {
    ...fields,
    payload: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  });
}

const Counter = sequelize
  ? sequelize.define("Counter", {
      count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    })
  : null;

const User = defineJsonModel("User", {
  userId: { type: DataTypes.STRING(128), primaryKey: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  unionId: { type: DataTypes.STRING(128), allowNull: true },
});

const Profile = defineJsonModel("Profile", {
  profileId: { type: DataTypes.STRING(128), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  nickname: { type: DataTypes.STRING(128), allowNull: true },
  personalityType: { type: DataTypes.STRING(128), allowNull: true },
  personalityName: { type: DataTypes.STRING(128), allowNull: true },
});

const Report = defineJsonModel("Report", {
  reportId: { type: DataTypes.STRING(255), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  profileId: { type: DataTypes.STRING(128), allowNull: true },
  reportType: { type: DataTypes.STRING(64), allowNull: true },
  inputHash: { type: DataTypes.STRING(255), allowNull: true },
  schemaVersion: { type: DataTypes.STRING(255), allowNull: true },
});

const Chat = defineJsonModel("Chat", {
  chatId: { type: DataTypes.STRING(128), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  profileId: { type: DataTypes.STRING(128), allowNull: true },
  scenario: { type: DataTypes.STRING(64), allowNull: true },
  aiSource: { type: DataTypes.STRING(64), allowNull: true },
});

const Order = defineJsonModel("Order", {
  orderId: { type: DataTypes.STRING(128), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  profileId: { type: DataTypes.STRING(128), allowNull: true },
  productType: { type: DataTypes.STRING(64), allowNull: true },
  status: { type: DataTypes.STRING(32), allowNull: true },
});

const Membership = defineJsonModel("Membership", {
  membershipId: { type: DataTypes.STRING(128), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  planType: { type: DataTypes.STRING(64), allowNull: true },
  status: { type: DataTypes.STRING(32), allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
});

const AnalyticsEvent = defineJsonModel("AnalyticsEvent", {
  eventId: { type: DataTypes.STRING(128), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  eventName: { type: DataTypes.STRING(128), allowNull: true },
});

const ErrorLog = defineJsonModel("ErrorLog", {
  errorId: { type: DataTypes.STRING(128), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  message: { type: DataTypes.TEXT, allowNull: true },
});

const AdvisorUsage = defineJsonModel("AdvisorUsage", {
  usageId: { type: DataTypes.STRING(128), primaryKey: true },
  userId: { type: DataTypes.STRING(128), allowNull: true },
  openId: { type: DataTypes.STRING(128), allowNull: true },
  usageDate: { type: DataTypes.STRING(32), allowNull: true },
});

const models = {
  User,
  Profile,
  Report,
  Chat,
  Order,
  Membership,
  AnalyticsEvent,
  ErrorLog,
  AdvisorUsage,
};

async function init() {
  if (!sequelize) {
    console.log("未配置 MySQL，使用内存存储");
    return;
  }
  await sequelize.authenticate();
  await Counter.sync({ alter: true });
  await Promise.all(Object.values(models).filter(Boolean).map((model) => model.sync({ alter: true })));
  console.log(`MySQL 初始化完成：${MYSQL_DATABASE}`);
}

module.exports = {
  sequelize,
  init,
  Counter,
  models,
};
