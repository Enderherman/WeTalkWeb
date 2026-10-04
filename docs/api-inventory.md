# REST 接口清单

[首页](../README.md) · [更新日志](../CHANGELOG.md) · [OpenAPI JSON](openapi.web.json)

截至 2026-10-04，七个应用 Controller 与 OpenAPI 共 **55 个唯一 REST 路径**。下表省略 `/api` 上下文前缀。`/chat/streamMedia` 为 GET，其余客户端契约为 POST；Controller 未限定方法的 `RequestMapping` 不重复计数。Actuator、静态资源和 WebSocket 握手不在此清单内。

## 路径全集

| 前缀 | 数量 | 路径后缀 |
|---|---:|---|
| `/account` | 14 | `checkCode`、`registerEmailCode`、`register`、`login`、`webLogin`、`webSocketTicket`、`listSessions`、`revokeSession`、`revokeOtherSessions`、`getUserInfo`、`updatePassword`、`logout`、`getSysSetting`、`saveUserInfo` |
| `/contact` | 11 | `saveRemark`、`search`、`searchByKeyword`、`applyAdd`、`loadApply`、`dealWithApply`、`loadContact`、`getContactInfo`、`getContactUserInfo`、`delContact`、`addContact2BlackList` |
| `/group` | 7 | `saveGroup`、`loadMyGroup`、`getGroupInfo`、`getGroupInfo4Chat`、`leaveGroup`、`addOrRemoveGroupUser`、`dissolutionGroup` |
| `/admin` | 7 | `loadUser`、`updateUserStatus`、`forcedOffOnline`、`loadGroup`、`dissolutionGroup`、`getSystemSetting`、`saveSystemSetting` |
| `/userInfoBeauty` | 3 | `loadBeautyAccountList`、`saveBeautyAccount`、`deleteBeautyAccount` |
| `/app` | 6 | `loadUpdateList`、`saveUpdate`、`deleteUpdate`、`downloadUpdate`、`postUpdate`、`checkUpdate` |
| `/chat` | 7 | `streamMedia`、`uploadFile`、`cancelAiMessage`、`downloadFile`、`sendMessage`、`loadHistory`、`markRead` |

## 请求与权限

- Web 登录使用 `webLogin` 与 HttpOnly `wetalk_session` Cookie；桌面使用 `login` 与 `token` 请求头。受保护接口接受这两类凭据，响应不向 Web 返回 token。
- 管理接口在后端再次校验管理员。版本查询/下载以当前登录用户和发布状态判断可见性，不能通过客户端 `uid` 冒充灰度用户。
- 普通表单使用 `application/x-www-form-urlencoded`，资料/群图片、聊天附件和本地更新包使用 multipart；具体必填项见 JSON schema。
- 业务错误可能放在 HTTP 200 的响应体中；必须读取业务码，`901` 为认证失效，`429` 为频率限制。错误关联头为 `X-Request-Id`。
- 文件下载返回二进制；媒体流支持单区间 Range 的 200/206/416 语义。不要把下载响应按普通 JSON 成功体解析。

## 关键约束

| 对象 | 当前约束 |
|---|---|
| 注册 | 昵称/邮箱/密码及六位邮箱码；请求邮箱码前验证图片验证码；注册密码至少 8 字符 |
| 登录 | 兼容现有 32 位小写 MD5 密码摘要协议，生产传输仍需 HTTPS |
| 普通文本 | 最多 500 字；客户端 UUID 幂等键最长 36 字符；历史页最多 50 条 |
| 联系人 | `loadContact.contactType` 使用 `USER/GROUP`；审批 `status` 为 1 同意、2 拒绝、3 拉黑 |
| 搜索 | 邮箱精确匹配、用户/群昵称子串及 U/G 编号；最多 20 个结果，不返回邮箱 |
| 备注 | 当前用户自己的好友备注，trim 后最多 40 字；空字符串清除，type18 仅本人设备可见 |
| 群资料 | 名称最多 32 字、公告最多 500 字；`joinType=0` 直接加入，`1` 需审批 |
| 资料/群图片 | PNG/JPEG/GIF/BMP/WebP，非空且最多 10 MiB；扩展名、MIME 和签名匹配 |
| 文件消息 | type5 必须提供安全原名、正数大小及 `fileType`；上传者必须是原发送者且关系仍有效 |
| 已完成附件 | 只允许同名同字节重试，不能替换，也不重复广播完成；数值 ID 下载要求 type5/status1 |
| AI | type14/15/16 合并一条回复；只能停止自己的生成；长回复落库，不扩大普通输入上限 |
| 版本 | 三段数字版本号最多 10 字、说明最多 500 字、HTTP/HTTPS 外链最多 200 字；安装包非空且最多 500 MiB |

`.mjpeg` 仅在聊天图片中作为 JPEG 别名；资料与群图片不扩大到 MJPEG MIME。聊天客户端硬上限和系统配额取较小值，服务器继续执行权限与字节校验，详见 [媒体规则](browser-support.md)。

## 契约复核

```sh
npm run test:unit -- --run src/__tests__/openApiContract.spec.ts
```

文档重写时实际运行 **18 项，全部通过、无跳过**，覆盖路径全集、Controller 映射、鉴权、内部 `$ref` 和字段约束。独立克隆没有同级 `backend` 时，仅跨仓库映射用例跳过。该测试读取 JSON/Controller，不直接读取 Markdown；本次未修改 OpenAPI JSON 或产品代码。
