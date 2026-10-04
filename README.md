# WeTalkWeb

WeTalk 的浏览器客户端，基于 Vue 3、TypeScript、Vite、Pinia 和 Element Plus。桌面浏览器使用可收起侧栏，手机使用抽屉导航；REST 与 WebSocket 由独立的 [WeTalk 后端](https://github.com/Enderherman/WeTalk) 提供。

## 当前功能

| 范围 | 已实现能力 |
|---|---|
| 账号 | 图片/邮箱验证码注册、登录、资料与头像封面、好友审批偏好、改密、设备撤销、退出 |
| 聊天 | 私聊/群聊、实时收发、已读、服务端历史、全文搜索、文字离线待发与幂等重试、置顶/移除/恢复 |
| 联系人 | 编号/邮箱/昵称发现、好友和入群申请、目录直达聊天、私有备注、删除/拉黑 |
| 群聊 | 创建、资料/头像/封面、成员名单、邀请/移出、退群/解散与实时权限同步 |
| 附件 | 文件选择/拖放、图片粘贴确认、进度/重试、鉴权下载、图片和音视频预览、视频封面 |
| AI | 流式回复、停止、失败状态、长文本历史；由后端配置提供方 |
| 管理 | 用户、群聊、系统配额、机器人资料、靓号、版本草稿/灰度/全量/撤回 |

Web 展示版本说明，桌面端负责 Windows 安装包下载和原生窗口/托盘等能力。文件目录访问遵循浏览器授权，媒体播放取决于浏览器解码支持。逐项范围见 [功能对齐矩阵](docs/feature-parity-audit.md)。找回密码、PWA 和系统推送不在当前交付范围。

## 本地运行

需要 Node.js `^22.18.0 || >=24.12.0`。先按后端仓库说明启动 MySQL、Redis 和后端服务，再在本仓库执行：

```sh
npm ci
npm run dev
```

默认开发地址为 `http://127.0.0.1:5173`，实际端口以 Vite 输出为准。[Vite 配置](vite.config.ts) 将同源 `/api` 代理到 `http://127.0.0.1:5050`，`/ws` 代理到 `ws://127.0.0.1:5051`。后端允许的 Origin 必须包含实际网页地址。

可参考 [.env.example](.env.example) 创建本地 `.env`：

| 变量 | 默认值 | 用途 |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | 构建时写入 REST API 基址；推荐同源 |
| `VITE_WEB_VERSION` | `0.1.0` | 网页版本提示使用的客户端版本 |

WebSocket 始终使用当前页面同源 `/ws`；修改 API 基址不会自动改变 WebSocket 入口。前端环境变量会进入静态产物，不应放入数据库、SMTP 或 AI 密钥。

应用默认显示版本是 **0.1.0**，来自 `VITE_WEB_VERSION` 或 `src/config/version.ts` 回退值；Compose 镜像标签也默认为 `0.1.0`。`package.json` 的 `0.0.0` 是工程模板版本，不代表对用户展示的应用版本。本轮源码增量尚未正式发布，不新增版本号。

## 验证与构建

```sh
npm run test:unit -- --run
npm run type-check
npm run build
```

生产文件生成在 `dist/`。`npm run build` 已同时执行类型检查；`npm run preview` 用于本机预览构建，当前 Vite 会继承开发配置中的 API/WS 代理。预览端口以命令输出为准，后端 Origin 需包含该地址；正式部署使用 Nginx 容器。

截至 2026-10-04，功能源码 `845c6d9` 已通过 **49 个文件、373 项测试**、独立类型检查和生产构建。文档重写另运行了 OpenAPI 契约 **18 项**，包括同级后端 Controller 路径比对；没有把文档修改计为重新执行全部功能测试。

## 部署状态

[NAS Docker 手册](docs/nas-docker-deployment.md) 说明构建、同源路由、健康检查与回滚。正式域名尚未确定；本轮代码未部署 NAS。2026 年 9 月的 NAS 部署仅证明当时版本，不能代表当前版本已上线。

本轮使用隔离 MySQL/Redis/Spring、测试账号和本机邮件/AI 提供方完成联调，测试服务现已停止，证据保留。实体 iOS/Android、生产 HTTPS/WSS、外部 SMTP/AI 和安装器实际安装流程仍需单独验收。

## 文档索引

| 文档 | 内容 |
|---|---|
| [更新日志](CHANGELOG.md) | 按应用版本组织，日期辅助追溯功能、修复与历史部署 |
| [功能对齐与证据边界](docs/feature-parity-audit.md) | Web、桌面、后端逐项能力与验证基线 |
| [REST 清单](docs/api-inventory.md) / [OpenAPI JSON](docs/openapi.web.json) | 55 个应用接口、权限与字段约束 |
| [WebSocket 协议](docs/websocket-protocol.md) | 连接、事件 0–18、初始化和消息合并 |
| [数据库关系](docs/database-erd.md) | 10 张表、逻辑关联和迁移要求 |
| [浏览器与媒体](docs/browser-support.md) | 支持目标、已测环境、文件规则与降级 |
| [NAS 部署](docs/nas-docker-deployment.md) | 当前部署方法与历史状态界限 |
| [邮箱注册](docs/email-registration-test.md) | 注册流程及本地/外部邮件证据 |
| [版本管理](docs/admin-releases.md) | 管理权限、发布状态和校验 |
| [真实页面验收](docs/ui-regression-20261004.md) | 浏览器快照与流程证据 |
| [布局回归](docs/chat-layout-regression.md) | 长历史输入区与布局夹具 |
| [离线与重启](docs/realtime-offline-errors.md) | 票据错误、持久待发和进程重启 |
| [多端消息](docs/multi-device-messages.md) | 本人回显、最终附件元数据和交付乱序 |
| [请求归属](docs/session-request-ownership.md) | 跨账号、重新登录和迟到响应隔离 |
| [WebKit 生命周期](docs/webkit-navigation-lifecycle.md) | 卸载请求中止与 BFCache 恢复 |

产品代码位于 `src/`，测试位于 `src/__tests__/`，布局脚本位于 `scripts/`。功能变更同步相关契约/专题，更新记录只写入独立更新日志。
