const { Sequelize, DataTypes } = require("sequelize");

// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");
const hasMysqlConfig = Boolean(MYSQL_USERNAME && MYSQL_PASSWORD && host);

const sequelize = hasMysqlConfig
  ? new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
      host,
      port,
      dialect: "mysql" /* one of 'mysql' | 'mariadb' | 'postgres' | 'mssql' */,
    })
  : null;

// 定义数据模型
const Counter = sequelize
  ? sequelize.define("Counter", {
      count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    })
  : null;

// 数据库初始化方法
async function init() {
  if (!sequelize || !Counter) {
    console.log("未配置 MySQL，跳过数据库初始化");
    return;
  }
  await Counter.sync({ alter: true });
}

// 导出初始化方法和模型
module.exports = {
  init,
  Counter,
};
