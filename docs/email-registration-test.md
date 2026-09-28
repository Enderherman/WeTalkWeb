# 邮箱验证码接口验收

日期：2026-09-28

## 本地测试

在部署到 NAS 前，于本机后端仓库执行 `mvn -B -ntp clean verify`。构建成功，101 项测试全部通过。

WeTalkWeb 本地 256 项单测、类型检查和生产构建通过；邮箱发送按钮成功冷却、冷却到期重发以及发送失败后的错误提示和重试状态均已覆盖。

## NAS 实际后端测试

- 使用当前 NAS 后端的真实 `POST /api/account/registerEmailCode` 接口。
- 响应为 HTTP 200、业务码 200，后端的 Java 邮件发送调用成功返回。
- SMTP 发件账户和口令来自 NAS 私有 `.env`；本轮收件邮箱按用户指定，仅放在 `D:/environment/WeTalkBrowserQA/nas-send-registration-code-once.mjs` 本地脚本中，不写入仓库。
- 初始诊断使用一次性 Redis JSON 字符串键，接口请求后确认已删除；随后从 NAS 实际注册页正常解答真实图片验证码并再次成功调用接口，没有加入长期绕过逻辑。
- 后端容器恢复 healthy；MySQL 和 Redis 容器在后端更新期间没有重启。

第一次测试夹具曾以原始文本写入 Redis。项目的 `RedisConfig` 使用 JSON value serializer，原始数字文本会反序列化成数字类型，导致请求在验证码校验阶段报 `ClassCastException`，没有进入 SMTP 发送。修正为 JSON 字符串格式后，接口返回成功。该异常来自测试夹具编码方式，不是邮件发送失败。

## 尚未确认

用户提供了收到的 6 位验证码，确认测试邮件已到达收件箱。之后按用户要求只读检查 Redis 中该邮箱的验证码键；验证码 10 分钟有效期已过，查询时键不存在，因此没有比较数据库值或输出验证码明文。尚未使用邮件验证码创建真实账号，完整注册链路保持待验收。
