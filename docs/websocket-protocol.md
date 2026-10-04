# WeTalk WebSocket 协议与客户端行为

本文对应当前后端和 WeTalkWeb 源码实现（2026-10-04 核对）。示例中的账号、群号、消息编号和会话编号均为虚构值。

## 连接、鉴权与心跳

- WebSocket 路径为 /ws，后端默认监听 5051 端口；开发环境由 Vite 将同源 /ws 代理到后端。
- WeTalkWeb 先通过受 Cookie 保护的 `/account/webSocketTicket` 申请 60 秒有效的一次性票据，再以 `wss://<域名>/ws?ticket=<票据>` 握手；后端从 Redis 原子取出并删除票据。Electron 仍兼容旧 `?token=` 握手。生产部署需使用 HTTPS/WSS，并通过 `WETALK_WEB_AUTH_COOKIE_SECURE=true` 启用 Secure Cookie。
- 浏览器 WebSocket 的 Origin 必须匹配后端 `WETALK_WEB_ALLOWED_ORIGINS`；本地默认包含 Vite 的 localhost/127.0.0.1:5173。生产配置为实际网页 HTTPS Origin。没有 Origin 的原生客户端继续兼容；`Origin: null` 仅兼容旧 token 查询参数，不能用于一次性 ticket。
- 连接打开后立即发送文本帧 heart beat，之后每 5 秒发送一次。心跳是原始文本，不是 JSON。后端读超时为 6 秒，超时会关闭连接；客户端不等待心跳应答。
- 意外断开后按 1、2、5、10、15、30 秒依次重连；次数耗尽后显示离线状态和刷新提示。手动断开或页面销毁时停止心跳及重连计时器。

## 消息外层结构

JSON 消息使用后端 MessageSendDTO。字段随消息类型而变化，常见字段如下：

~~~json
{
  "messageType": 2,
  "messageId": 1002,
  "sessionId": "session-example",
  "sendUserId": "U200",
  "sendUserNickName": "用户乙",
  "contactId": "U100",
  "contactName": "用户甲",
  "messageContent": "你好",
  "lastMessage": "你好",
  "sendTime": 1790000000000,
  "contactType": 0,
  "extentData": null,
  "memberCount": null
}
~~~

联系人类型 0 表示用户，1 表示群。群系统消息可能没有发送人；不要把 sendUserId 为 null 的事件显示成普通成员文本消息。

## 消息类型

| 类型 | 后端含义 | WeTalkWeb 当前处理 |
|---:|---|---|
| 0 | 初始化会话、最近消息和好友申请数 | 用于登录、重连后的状态校准 |
| 1 | 好友添加通知 | 即时创建私聊会话、展示打招呼文字、去重并更新打开的好友目录 |
| 2 | 普通聊天消息 | 接收文字消息、去重并更新会话摘要 |
| 3 | 群创建 | 新增群会话并展示创建系统消息 |
| 4 | 好友或群申请通知 | 增加申请数；收件箱从 REST 接口读取详情 |
| 5 | 图片/视频/普通文件消息 | 展示附件、上传进度与失败重试，支持鉴权下载及图片/音视频预览 |
| 6 | 文件上传完成 | 更新原消息为可下载/预览状态，不新增重复消息 |
| 7 | 强制下线 | 清除登录态并返回登录页 |
| 8 | 群解散 | 展示系统消息、禁用输入并刷新群目录 |
| 9 | 成员加入群 | 创建必要的群会话、更新人数并展示系统消息 |
| 10 | 群名更新 | 更新会话名称并刷新已打开的群目录 |
| 11 | 成员主动退群 | 更新人数并展示系统消息；当事件目标是当前账号时禁用输入 |
| 12 | 群主移出成员 | 更新人数并展示系统消息；当事件目标是当前账号时禁用输入 |
| 13 | 好友添加通知发送给本人 | 后端发送前转换为 type 1 并将 contactId/contactName 改为对方；客户端兼容原始 type 13 |
| 14–16 | AI 初始化、累计流式片段和结束 | 合并为同一条助手消息；恢复时合并服务器历史与本机已收到的文本 |
| 17 | 私聊已读回执，`messageId` 是对端已读到的最大消息 ID | 更新该私聊对端游标和发送状态 |
| 18 | 当前账号自己的好友备注更新 | 读取 `extentData={contactId,remark}`，更新私有显示名称；空字符串清除备注，不创建聊天消息 |

### 类型 18：好友私有备注

`POST /api/contact/saveRemark` 保存当前账号对某位好友的备注，返回 `{contactId,remark}`。只有当前账号的设备会收到 type 18；对方和其他用户不会收到。INIT 私聊会话带有 `remark`，网页以 `remark || contactName` 显示，保留原始昵称供资料查看与搜索。联系人目录可按备注、原昵称或编号筛选；全站联系人发现接口仍按邮箱、原昵称或编号搜索。

### 类型 17：私聊已读回执

接收方的 `POST /api/chat/markRead` 游标向前推进时，后端将回执发给私聊对端。`sendUserId` 和 `contactId` 是已读方，`messageId` 是其已读到的最大服务端消息 ID。相同或较旧的游标不会重复发送；群聊不发送个人已读回执。

```json
{
  "messageType": 17,
  "messageId": 1052,
  "sessionId": "direct-session-example",
  "sendUserId": "U200",
  "contactId": "U200",
  "sendTime": 1790000001000
}
```


### AI 类型 14–16

- 向 `Urobot` 发送 `POST /api/chat/sendMessage` 后，后端先保存用户问题和空的 AI 回复，WebSocket 用类型 14 通知客户端开始等待。
- 类型 15 携带同一个 `messageId` 和当前累计全文。前端用新全文替换同一条气泡，不能把每一帧追加成多条消息。
- 类型 16 表示本次生成已结束：`status=1` 为完成，`status=2` 为用户停止，`status=3` 为提供方错误。结束状态和已生成文本写入消息历史。
- 用户可通过受登录态保护的 `POST /api/chat/cancelAiMessage` 停止自己的 AI 消息；后端取消提供方订阅并保存已输出文本。其他用户的 AI 消息不能被停止。
- 提供方错误会以类型 16、`status=3` 结束，界面显示通用错误提示，不显示提供方异常。若客户端 30 秒未收到新帧，会标为连接中断，并可请求后端停止仍在运行的生成。
- 普通聊天默认不启用 AI。启用时同时设置 `WETALK_AI_ENABLED=true`、`WETALK_AI_MODEL=openai` 和提供方的 `OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_KEY`。

### 类型 0：初始化

extentData 包含会话列表、最近消息和未处理申请数。每个一对一会话的 `peerReadMessageId` 表示对端持久已读游标，群聊不设置该值。`noReadCount` 由后端按本人 `last_read_message_id` 计算；打开会话后，网页通过 `POST /api/chat/markRead` 推进游标。最近消息受后端离线时间窗口限制；完整历史由分页 REST 接口读取。

~~~json
{
  "messageType": 0,
  "contactId": "U100",
  "extentData": {
    "chatSessionList": [
      {
        "userId": "U100",
        "contactId": "G300",
        "sessionId": "group-session-example",
        "contactName": "项目讨论组",
        "lastMessage": "用户乙加入了群组",
        "lastReceiveTime": 1790000000000,
        "memberCount": 2,
        "noReadCount": 2
      }
    ],
    "chatMessageList": [
      {
        "messageId": 1001,
        "sessionId": "group-session-example",
        "messageType": 9,
        "messageContent": "用户乙加入了群组",
        "sendUserId": null,
        "sendUserNickName": null,
        "sendTime": 1790000000000,
        "contactId": "G300"
      }
    ],
    "applyCount": 1
  }
}
~~~

### 类型 3：群创建

extentData 是新建的会话摘要，包含 sessionId、contactName、lastMessage、lastReceiveTime 和 memberCount。

~~~json
{
  "messageType": 3,
  "messageId": 1003,
  "sessionId": "group-session-example",
  "contactId": "G300",
  "contactType": 1,
  "messageContent": "群组已经创建好，可以和好友一起畅聊了",
  "extentData": {
    "userId": "U100",
    "contactId": "G300",
    "sessionId": "group-session-example",
    "contactName": "项目讨论组",
    "lastMessage": "群创建成功",
    "lastReceiveTime": 1790000000000,
    "memberCount": 1
  }
}
~~~

### 类型 9：成员加入

~~~json
{
  "messageType": 9,
  "messageId": 1004,
  "sessionId": "group-session-example",
  "contactId": "G300",
  "contactName": "项目讨论组",
  "messageContent": "用户乙加入了群组",
  "sendTime": 1790000001000,
  "memberCount": 2
}
~~~

### 类型 10：群名更新

后端用 extentData 传新群名；此类型不包含持久化系统消息编号。

~~~json
{
  "messageType": 10,
  "contactId": "G300",
  "contactType": 1,
  "extentData": "毕业设计讨论组"
}
~~~

### 类型 11/12：退群与移出

extentData 是离开或被移出成员的账号编号；memberCount 是操作后的群人数。

~~~json
{
  "messageType": 12,
  "messageId": 1005,
  "sessionId": "group-session-example",
  "contactId": "G300",
  "messageContent": "用户乙被管理员移出了群聊",
  "sendTime": 1790000002000,
  "extentData": "U200",
  "memberCount": 1
}
~~~

## 前端同步规则

- 系统消息按 messageId 去重。群创建、加入、退群、移出和解散事件会更新对应会话并显示为居中的系统消息。
- 成员数优先采用事件携带的 memberCount；群名来自类型 10 的 extentData。
- 当前账号退出/被移出后，或收到群解散事件后，保留当前页面已有的系统消息并禁用输入框。
- 后端在退群/移出时删除该成员的活动群会话索引；解散时删除所有成员的群会话索引。群消息历史记录仍保留，后续 INIT 不会重新列出失效群聊。
- 前端单测验证状态转换和去重；双账号真实后端验证类型 3、8、9、10、11、12，成员人数及退群/移出/解散后的重连结果。
