# WeTalk WebSocket 协议与客户端行为

本文对应后端 0.0.2 和 WeTalkWeb 当前实现。示例中的账号、群号、消息编号和会话编号均为虚构值。

## 连接、鉴权与心跳

- WebSocket 路径为 /ws，后端默认监听 5051 端口；开发环境由 Vite 将同源 /ws 代理到后端。
- 当前握手凭证沿用后端 token 查询参数：wss://<域名>/ws?token=<登录令牌>。后端只接受恰好一个 token 参数，并在 Redis 中校验。生产部署需使用 HTTPS/WSS；该查询参数方案属于兼容旧后端的过渡方式。
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
| 1 | 好友添加通知 | 仍需补齐专门的实时状态处理 |
| 2 | 普通聊天消息 | 接收文字消息、去重并更新会话摘要 |
| 3 | 群创建 | 新增群会话并展示创建系统消息 |
| 4 | 好友或群申请通知 | 增加申请数；收件箱从 REST 接口读取详情 |
| 5 | 图片/视频消息 | 媒体功能尚未接入 |
| 6 | 文件上传完成 | 文件功能尚未接入 |
| 7 | 强制下线 | 清除登录态并返回登录页 |
| 8 | 群解散 | 展示系统消息、禁用输入并刷新群目录 |
| 9 | 成员加入群 | 创建必要的群会话、更新人数并展示系统消息 |
| 10 | 群名更新 | 更新会话名称并刷新已打开的群目录 |
| 11 | 成员主动退群 | 更新人数并展示系统消息；当事件目标是当前账号时禁用输入 |
| 12 | 群主移出成员 | 更新人数并展示系统消息；当事件目标是当前账号时禁用输入 |
| 13 | 好友添加通知发送给本人 | 仍需补齐专门的实时状态处理 |
| 14–16 | AI 初始化、流式片段和结束 | AI 聊天尚未接入 |

### 类型 0：初始化

extentData 包含会话列表、最近消息和未处理申请数。最近消息受后端离线时间窗口限制；完整历史由分页 REST 接口读取。

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
        "memberCount": 2
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
