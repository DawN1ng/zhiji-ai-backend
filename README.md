# wxcloudrun-express

[![GitHub license](https://img.shields.io/github/license/WeixinCloud/wxcloudrun-express)](https://github.com/WeixinCloud/wxcloudrun-express)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/WeixinCloud/wxcloudrun-express/express)
![GitHub package.json dependency version (prod)](https://img.shields.io/github/package-json/dependency-version/WeixinCloud/wxcloudrun-express/sequelize)

微信云托管 Node.js Express 框架模版，实现简单的计数器读写接口，使用云托管 MySQL 读写、记录计数值。

![](https://qcloudimg.tencent-cloud.cn/raw/be22992d297d1b9a1a5365e606276781.png)

## 快速开始

前往 [微信云托管快速开始页面](https://cloud.weixin.qq.com/cloudrun/onekey)，选择相应语言的模板，根据引导完成部署。

## 本地调试
下载代码在本地调试，请参考[微信云托管本地调试指南](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/src/guide/debug/)

## 实时开发
代码变动时，不需要重新构建和启动容器，即可查看变动后的效果。请参考[微信云托管实时开发指南](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/src/guide/debug/dev.html)

## Dockerfile最佳实践
请参考[如何提高项目构建效率](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/src/scene/build/speed.html)

## 项目结构说明

```
.
├── Dockerfile
├── README.md
├── container.config.json
├── db.js
├── index.js
├── index.html
├── package.json
```

- `index.js`：项目入口，实现主要的读写 API
- `db.js`：数据库相关实现，使用 `sequelize` 作为 ORM
- `index.html`：首页代码
- `package.json`：Node.js 项目定义文件
- `container.config.json`：模板部署「服务设置」初始化配置（二开请忽略）
- `Dockerfile`：容器配置文件

## 服务 API 文档

### `GET /api/count`

获取当前计数

#### 请求参数

无

#### 响应结果

- `code`：错误码
- `data`：当前计数值

##### 响应结果示例

```json
{
  "code": 0,
  "data": 42
}
```

#### 调用示例

```
curl https://<云托管服务域名>/api/count
```

### `POST /api/count`

更新计数，自增或者清零

#### 请求参数

- `action`：`string` 类型，枚举值
  - 等于 `"inc"` 时，表示计数加一
  - 等于 `"clear"` 时，表示计数重置（清零）

##### 请求参数示例

```
{
  "action": "inc"
}
```

#### 响应结果

- `code`：错误码
- `data`：当前计数值

##### 响应结果示例

```json
{
  "code": 0,
  "data": 42
}
```

#### 调用示例

```
curl -X POST -H 'content-type: application/json' -d '{"action": "inc"}' https://<云托管服务域名>/api/count
```

## 使用注意
如果不是通过微信云托管控制台部署模板代码，而是自行复制/下载模板代码后，手动新建一个服务并部署，需要在「服务设置」中补全以下环境变量，才可正常使用，否则会引发无法连接数据库，进而导致部署失败。
- MYSQL_ADDRESS
- MYSQL_PASSWORD
- MYSQL_USERNAME
以上三个变量的值请按实际情况填写。如果使用云托管内MySQL，可以在控制台MySQL页面获取相关信息。

## 知己AI 环境变量

上线前请在微信云托管服务设置中配置：

```text
OPENAI_BASE_URL=大模型代理地址
OPENAI_API_KEY=大模型代理 Key
OPENAI_MODEL=gpt-5.4-mini
WECHAT_APPID=小程序 AppID
WECHAT_APP_SECRET=小程序 AppSecret，用于 code2Session、access_token 与虚拟支付查单
WECHAT_VPAY_OFFER_ID=虚拟支付基础配置里的 offerId
WECHAT_VPAY_ENV=1
WECHAT_VPAY_APPKEY_SANDBOX=虚拟支付沙箱 AppKey
WECHAT_VPAY_APPKEY_PROD=虚拟支付现网 AppKey
WECHAT_VPAY_GOODS_DEEP_REPORT_REGULAR=deep_report_regular
WECHAT_VPAY_GOODS_DEEP_REPORT_MEMBER=deep_report_member
WECHAT_VPAY_GOODS_MEMBERSHIP_ONE_MONTH=zj_month_1m
WECHAT_VPAY_GOODS_MEMBERSHIP_THREE_MONTHS=zj_month_3m
WECHAT_VPAY_GOODS_MEMBERSHIP_SIX_MONTHS=zj_month_6m
ENABLE_DEBUG_ROUTES=false
DEBUG_TOKEN=调试接口访问令牌；仅在 ENABLE_DEBUG_ROUTES=true 时生效
MYSQL_ADDRESS=MySQL 连接地址
MYSQL_USERNAME=MySQL 用户名
MYSQL_PASSWORD=MySQL 密码
MYSQL_DATABASE=nodejs_demo
```

如果使用自建数据库名，可将 `MYSQL_DATABASE` 改为实际数据库名，并确保数据库已创建。

同时配置 `ENABLE_DEBUG_ROUTES=true` 和 `DEBUG_TOKEN` 后可访问：

```text
/debug/ai?debug_token=你的DEBUG_TOKEN
/debug/db?debug_token=你的DEBUG_TOKEN
/debug/payment?debug_token=你的DEBUG_TOKEN
```

用于检查环境变量是否被服务读取。生产环境保持 `ENABLE_DEBUG_ROUTES=false` 或不配置时，调试接口默认返回 404。

## 虚拟支付后台配置

进入小程序管理后台的 **虚拟支付** 模块，完成签约后：

1. 在 **基本配置 / 基础配置** 记录 `offerId`、沙箱 `AppKey` 和现网 `AppKey`，分别写入上面的环境变量。
2. 在 **道具管理** 创建并发布以下道具，价格需与代码保持一致：
   - `deep_report_regular`：深度报告，2.88 元
   - `deep_report_member`：月令价深度报告，0.88 元
   - `zj_month_1m`：知己月令 1 个月，16.6 元
   - `zj_month_3m`：知己月令 3 个月，38.8 元
   - `zj_month_6m`：知己月令 6 个月，88.8 元
3. 在发货订阅/消息推送中配置：
   - `https://你的后端域名/virtual-payment/notify`
   - 至少订阅 `xpay_goods_deliver_notify` 和 `xpay_refund_notify`。
4. 沙箱联调时保持 `WECHAT_VPAY_ENV=1`；发布现网前切换为 `WECHAT_VPAY_ENV=0`，并确认现网道具已发布、现网 AppKey 已配置。

## 支付接口

- `POST /orders`：创建深度报告或知己月令订单，返回小程序 `wx.requestVirtualPayment` 所需的 `signData`、`paySig`、`signature` 和 `mode`。
- `POST /orders/verify`：按商户订单号调用虚拟支付 `/xpay/query_order` 查单，并同步本地订单状态。
- `POST /virtual-payment/notify`：虚拟支付发货、退款、投诉消息推送地址。发货推送会幂等更新订单并激活会员权益。
- `POST /membership/activate`：保留给前端支付成功后主动激活会员；接口已做幂等处理，推送已激活时重复调用会返回已有权益。

未配置完整虚拟支付环境变量或道具 ID 时，下单会返回明确错误，不会生成可误用的支付参数。

历史普通微信支付 JSAPI 代码仍保留用于回滚，但深度报告和知己月令的主链路已经切换到虚拟支付。若临时回滚普通微信支付，仍需恢复并配置以下旧变量：

```text
WECHAT_PAY_MCH_ID=微信支付商户号
WECHAT_PAY_SERIAL_NO=商户 API 证书序列号
WECHAT_PAY_PRIVATE_KEY=商户 API 私钥，换行可写成 \n
WECHAT_PAY_API_V3_KEY=微信支付 API v3 密钥
WECHAT_PAY_NOTIFY_URL=https://你的后端域名/orders/notify
WECHAT_PAY_PUBLIC_KEY=微信支付公钥内容，换行可写成 \n
WECHAT_PAY_PUBLIC_KEY_ID=微信支付公钥 ID，通常形如 PUB_KEY_ID_...
WECHAT_PAY_PLATFORM_CERTIFICATE=微信支付平台证书内容，换行可写成 \n
WECHAT_PAY_PLATFORM_SERIAL_NO=微信支付平台证书序列号
```


## License

[MIT](./LICENSE)
