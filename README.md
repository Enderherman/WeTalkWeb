# WeTalkWeb

WeTalkWeb 是 WeTalk 的浏览器客户端新仓库，使用 Vue 3 + TypeScript + Vite。项目独立于 Electron 桌面客户端；后端 API 继续由同级 backend 提供。

## 当前进度

- 已搭建 Vue/Vite 工程和响应式 ChatGPT 风格页面基础。
- 已实现注册、登录、图片验证码、个人资料读取、修改密码、登出和认证后聊天页占位壳，支持桌面和窄屏布局。
- 已接入同源 WebSocket、5 秒心跳、断线重连和 INIT 会话初始化；实际文字消息展示/发送、历史分页和 IndexedDB 缓存仍待开发。
- 30 项认证/资料/密码/路由/实时连接单元测试通过；类型检查和生产构建通过。另通过 Vite 代理对本机真实 Spring Boot、MySQL、Redis 和 Netty WebSocket 完成认证密码闭环、HTTP 过期码 901、INIT 会话/消息接收和心跳键清理验证。临时测试账号及 Redis 键已清理；尚未完成自动化浏览器端到端和多视口视觉验收。

### 首个交付相对空仓库的变化

- 新增可运行的 Vue 3 + TypeScript + Vite 浏览器应用、登录/注册路由和受保护的聊天入口。
- 接入现有账号验证码、注册、登录和登出 API；加入兼容后端的表单校验、会话存储和统一响应处理。
- 完成桌面及手机尺寸的认证页和聊天主框架占位；补充 9 项认证相关测试。
- 文字消息展示与发送、历史分页、IndexedDB 缓存和自动化浏览器端到端列入后续阶段。

### 本次更新：个人资料与修改密码

- 登录后从后端读取最新昵称、邮箱和账号编号，个人资料弹窗同步显示。
- 新增修改密码表单，按后端规则校验并确认两次输入；成功后清除会话并要求重新登录。
- 扩充至 17 项认证、资料和密码测试；真实后端验证了旧密码和旧 token 失效、新密码可重新登录。

### 本次更新：404 页面

- 未知地址显示独立的 404 页面，不再被静默转到聊天页。
- 未登录时提供登录入口，已登录时提供返回聊天入口；增加路由与页面测试。

### 本次更新：登录状态过期处理

- 后端返回业务码 901 时，清除本地会话并回到登录页显示重新登录提示。
- 真实后端对无效 token 返回 901；应用处理逻辑和路由提示已通过单元测试。

### 本次更新：实时连接与会话初始化

- 网页端通过同源 `/ws` 连接 Netty，接收会话、最近消息和好友申请计数。
- 每 5 秒发送心跳，连接断开后限次重连；页面卸载时关闭连接。
- 真实后端返回 1 个会话和 1 条初始化消息，关闭连接后心跳键清除。

## 技术栈

- Vue 3、TypeScript、Composition API。
- Vite、Vue Router、Pinia。
- Axios 调用现有 Spring Boot API；浏览器请求使用 URL-encoded 表单，文件上传后续使用 multipart。
- Element Plus 已作为后续表格/对话框控件基础安装；认证页当前用原生表单控件和自定义样式。
- Vitest + Vue Test Utils 做前端单元/组件测试；Playwright 浏览器端到端测试后续加入。
- 登录 token 暂存在 sessionStorage 以兼容现有后端请求头；这是开发过渡方案，生产部署前要换安全 Cookie 和 WebSocket 短期票据。

## 本地开发

当前已验证 Node.js v24.14.0，运行时位于 `D:/environment/node-v24.14`；package.json 的 engines 接受 `^22.18.0 || >=24.12.0`。新装或升级的 Node、Python、JDK、MySQL 等运行环境遵循工作区约定，放在 `D:/environment`；项目 npm 依赖仍安装在本仓库的 `node_modules`。

~~~sh
npm ci
npm run dev
npm run test:unit -- --run
npm run type-check
npm run build
~~~

开发服务器将 /api 代理到 http://127.0.0.1:5050，将 /ws 代理到 ws://127.0.0.1:5051。需要后端及其 MySQL、Redis 依赖运行，页面才能完成真实账号注册和登录。

默认 API 地址为同源 /api。如需连接其他环境，复制 .env.example 为 .env.local 并设置 VITE_API_BASE_URL；不要把密钥放进 VITE_ 变量，因为这些值会被打包进浏览器。

## 与现有账号接口的兼容

- 验证码接口为 /api/account/checkCode，响应字段为 check_code 和 check_code_key。
- 注册把原始密码通过 HTTPS 表单发给后端；后端沿用当前逻辑保存其 MD5 摘要。
- 登录按现有 Electron 客户端协议发送 MD5(password)。这是兼容旧后端的过渡协议，不是最终密码存储方案。
- Web MVP 暂用 sessionStorage 保存当前标签页会话；公开部署前应完成 HttpOnly Secure Cookie 和 WebSocket 短期连接票据方案。
- 当前账号注册使用图片验证码，没有邮件验证码。

## 设计与开发规则

- 页面优先适配桌面与手机浏览器，侧栏在窄屏折叠为抽屉。
- 视觉参考 ChatGPT 网页聊天页的侧栏、居中对话区、底部输入区域和留白层级，使用 WeTalk 自己的品牌元素。
- API 返回数据以服务端为准；文字缓存接入前先完成后端分页历史接口。
- 不在仓库提交数据库密码、AI API Key 或真实用户数据。
