# WebSocket 协议

[首页](../README.md) · [更新日志](../CHANGELOG.md) · [多端消息](multi-device-messages.md)

本文按当前代码说明连接与事件语义；REST schema 见 [OpenAPI](openapi.web.json)。WebSocket 事件不计入 55 个 REST 路径。

## 连接与会话

浏览器先通过 Cookie 保护的 `POST /api/account/webSocketTicket` 申请 60 秒一次性票据，再连接当前页面同源 `/ws?ticket=…`；HTTPS 页面使用 WSS。后端从 Redis 原子消费票据，浏览器不把长期 token 放进 URL。桌面仍支持 token 握手。

后端默认 WS 端口为 5051。开发由 Vite 代理，部署由 Nginx 代理。浏览器 Origin 必须匹配 `WETALK_WEB_ALLOWED_ORIGINS`；`Origin: null` 不能用于 ticket。每账号最多一个浏览器会话加一个桌面会话，同类新登录撤销旧凭据、票据和连接，异类保留。

连接打开后立即发送原始文本 `heart beat`，此后每 5 秒一次；它不是 JSON，也不等待应答。后端读超时为 6 秒。意外断开按 1/2/5/10/15/30 秒重试；断开或页面销毁停止计时器，成功连接重置重试次数。后台票据可用性错误由实时状态处理，详见 [离线策略](realtime-offline-errors.md)。

## 消息外层

事件采用 `MessageSendDTO`。常见字段为 `messageType/messageId/sessionId/sendUserId/contactId/contactType/messageContent/sendTime/extentData/memberCount`；并非每种事件都包含全部字段。`contactType=0` 为用户，`1` 为群。系统消息允许没有发送人。

```json
{
  "messageType": 2,
  "messageId": 1002,
  "sessionId": "example-session",
  "sendUserId": "U200",
  "contactId": "U100",
  "contactType": 0,
  "messageContent": "你好",
  "sendTime": 1790000000000
}
```

示例编号为虚构值。客户端真实会话编号只使用服务器返回值。

## 事件表

| type | 含义 | Web 行为 |
|---:|---|---|
| 0 | INIT | 校准会话、最近消息、申请数和已读状态 |
| 1 | 好友添加 | 创建私聊、合并打招呼消息、刷新打开的目录 |
| 2 | 文字 | 按消息 ID 去重并更新摘要；本人回显不加未读 |
| 3 | 创建群 | 从 `extentData` 会话摘要新增群会话和系统消息 |
| 4 | 申请通知 | 更新申请数，详情通过 REST 分页获取 |
| 5 | 附件消息 | 展示上传状态、进度、重试及下载/预览 |
| 6 | 附件完成 | 合并原 type5 最终元数据，不新增气泡 |
| 7 | 强制下线 | 清除当前认证并返回登录 |
| 8 | 群解散 | 系统消息、禁用输入、刷新目录 |
| 9 | 加入群 | 必要时创建会话，更新人数及系统消息 |
| 10 | 群改名 | 用 `extentData` 新名称更新会话和目录 |
| 11 | 主动退群 | 更新人数；目标为本人则失权 |
| 12 | 移出群成员 | `extentData` 为被移出用户编号；本人则失权 |
| 13 | 本人好友添加通知 | 后端通常转换为 type1；前端兼容原始 type13 |
| 14 | AI 初始化 | 创建或恢复一条助手回复 |
| 15 | AI 累计文本 | 用累计全文替换同一气泡，不逐帧追加 |
| 16 | AI 终态 | 保存全文和完成/停止/失败状态 |
| 17 | 私聊已读回执 | 推进对端已读游标，不创建聊天消息 |
| 18 | 本人私有备注 | 更新备注或清除，不创建聊天消息 |

## 初始化与权限恢复

type0 的 `extentData` 包含 `chatSessionList`、`chatMessageList`、`applyCount`。私聊摘要可包含 `remark` 和 `peerReadMessageId`；`noReadCount` 由服务端个人已读游标计算。INIT 最近消息受离线时间窗口限制，完整历史通过 `/chat/loadHistory` 分页读取。

当前账号退群、被移出或群解散后，保留页面已有系统消息并禁用输入。后端撤销活动群索引，重连不重新列出失效群。若在其他端重新加入，新的有效 INIT 清除本页旧失权状态。

## 附件、已读与备注

- type6 合并 `fileName/fileSize/fileType/status`，保留原 `messageType=5`；兼容旧服务器只带 ID/状态的帧，不清空缺失字段。原文件大小可因桌面转码变化，以最终服务器元数据为准。
- `/chat/markRead` 前进时向私聊对端发送 type17，`messageId` 为已读到的最大服务端消息编号，`sendUserId/contactId` 为已读方；旧游标不回退，群不发送个人回执。
- `/contact/saveRemark` 返回 `{contactId,remark}`，type18 通过 `extentData` 仅发送给当前账号的设备；空字符串清除。显示优先用备注，真实昵称保留；全站发现仍按邮箱/原昵称/编号。

## AI

向 `Urobot` 发普通问题后，服务端持久化问题与回复并通过 type14/15/16 推送。type16 的 `status=1/2/3` 分别为完成/用户停止/提供方失败，部分文本和终态保存在历史中。只能通过 `/chat/cancelAiMessage` 停止自己的生成。30 秒无新帧时 Web 提示中断，并可请求停止仍在运行的生成。

AI 开关、模型、地址和密钥只由后端配置。实际多端验证使用本机协议兼容提供方，不证明外部服务当前可用。

## 合并原则与证据

同一消息的 HTTP 返回、WS 回显和历史按服务端 ID 合并；本人回显可确认匹配的待发 UUID，迟到 HTTP 不得恢复旧草稿。type6/17/18 是控制事件，不可误变成普通文字。相关源码测试与真实交付顺序证据见 [多端消息](multi-device-messages.md)、[功能验收表](feature-parity-audit.md)。
