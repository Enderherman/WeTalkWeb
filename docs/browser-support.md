# 浏览器支持与文件规则

本表定义 WeTalkWeb 的验收目标。记录支持范围不代表相应设备的视觉验收已经完成；首次正式发布前仍需按表中的尺寸运行核心流程。

## 浏览器目标

| 环境 | 验收目标 | 核心尺寸 | 当前状态 |
|---|---|---|---|
| Windows 桌面 Chrome、Edge | 各自当前稳定版及前一稳定版 | 1280×800、1366×768 | 构建和组件测试通过；浏览器视觉验收待完成 |
| Android Chrome | 当前稳定版及前一稳定版 | 360×800、390×844 | 真机验收待完成 |
| iOS Safari | 当前稳定版及前一稳定版 | 390×844、768×1024 | 真机验收待完成 |
| Firefox 桌面 | 当前稳定版基础兼容 | 1280×800 | 最佳努力支持，不作为首发验收门槛 |

使用稳定版和前一版作为滚动目标，每次发布记录测试日期、浏览器版本、系统和设备。表中未承诺旧版 Internet Explorer 或原生桌面功能。

## 短期部署目标

NAS Docker 内网部署已于 2026-09-28 完成，网页使用同源入口。正式域名尚未确定，仍以 `<WETALK_WEB_HOST>` 占位；对外发布前需配置 HTTPS/WSS、精确 Origin、备份与回滚。内网 HTTP 测试仅用于隔离的测试环境；若通过 NAS 反向代理启用 HTTPS/WSS，则设置 `WETALK_WEB_AUTH_COOKIE_SECURE=true`。生产 HTTPS/WSS 尚未配置。

WeTalkWeb 提供 `Dockerfile` 和 `compose.nas.yaml`：Nginx 容器监听 8080，同源代理 `/api` 到 `wetalk:5050`、`/ws` 到 `wetalk:5051`，并加入后端共用的外部 Docker 网络 `wetalk-net`。后端 `BACKEND_BIND_IP` 和 MySQL/Redis `NAS_BIND_IP` 默认留在 NAS 回环地址，只有网页入口绑定 LAN。复制 `.env.nas.example` 为 `.env`，将 `WEB_BIND_IP` 设为刚核实的 NAS 局域网地址；后端 `WETALK_WEB_ALLOWED_ORIGINS` 设为同源 `http://<NAS_LAN_IP>:<WEB_PUBLISHED_PORT>`。内网 HTTP 测试时 `WETALK_WEB_AUTH_COOKIE_SECURE=false`，对外 HTTPS/WSS 部署必须设为 `true`。本次 NAS 的 8080 已被占用，网页入口设为 8081；后端/API/WS 宿主机端口仅绑定回环地址，MySQL/Redis 复用既有服务。readiness 与 `/healthz` 已现场验证。

首次部署需先在 `wetalk-net` 网络中启动已配置的后端/基础服务，再启动网页容器：

~~~shell
cp .env.nas.example .env
# 将 WEB_BIND_IP 改为现场确认的 NAS 局域网地址
docker compose -f compose.nas.yaml config --quiet
docker compose -f compose.nas.yaml up -d --build
docker compose -f compose.nas.yaml ps
docker compose -f compose.nas.yaml logs --tail=100 wetalk-web
curl -f http://127.0.0.1:8080/healthz
~~~

NAS 的 `wetalk-web` 端口映射需与后端允许的 Origin 一致。再从局域网浏览器打开 `http://<NAS_LAN_IP>:<WEB_PUBLISHED_PORT>`，验证登录 Cookie、REST API、WebSocket ticket、消息收发、刷新及附件上传/下载。

### 自动化模拟视口记录（2026-09-27）

Playwright 1.63 使用本地 mock API/WebSocket 对登录、注册和一对一聊天页面做了截图与基础键盘路径检查。Chromium 153.0.8010.12 覆盖 360×800、390×844、768×1024 和 1280×900 CSS 像素视口；Playwright WebKit 26.6 覆盖 390×844。5 组测试的 `document.scrollWidth` 均等于 `innerWidth`，页面异常数均为 0。

这次回归还验证桌面聊天布局：768px 和 1280px 视口下，侧栏宽 272px 且填满视口高度，主聊天区从 x=272 开始；360px、390px 手机和 WebKit 390px 继续使用单列布局。该检查发现并修复了桌面网格未声明两列的问题。

Chromium 360×800 还截图检查了通用服务错误页、空会话和服务端历史加载状态；服务错误页不显示测试桩返回的内部诊断文字。登录验证码、个人资料、会话消息和实时帧均使用可复现的视觉测试数据。

测试还验证了消息搜索输入框的焦点进入/返回、桌面资料弹窗的焦点往返，以及移动联系人弹窗关闭后侧栏保持展开并将焦点返回可见的打开按钮。API 和 WebSocket 响应由测试桩提供，因此这项检查只记录浏览器渲染和交互表现，不代替真实后端联调。截图保存在 `D:/environment/WeTalkBrowserQA/captures`。Chromium 移动设备仿真和 Playwright WebKit 不能代替真实 Android Chrome/iOS Safari；真机矩阵仍待完成。

已目视检查桌面登录、移动登录/注册和桌面/移动聊天截图。统一色彩以白色和浅灰中性色为主、绿色作强调色；焦点环及辅助文字对比度由 CSS 单元测试自动检查。

## NAS 实际部署验收（2026-09-28）

- LAN 地址模板为 `http://<NAS_LAN_IP>:8081`；部署前发现默认 8080 已占用。浏览器通过同源 Nginx 访问 REST 与 WebSocket。
- 真实双账号后端链路通过注册/登录、Cookie、WebSocket、联系人申请、消息幂等、历史恢复、type 17 已读回执，以及文本附件上传/下载字节核对。临时账号、关系、消息和文件已清理。
- Chromium 360/390/768/1280 模拟视口与 WebKit 登录/注册 390/768/1280 模拟视口无横向溢出；WebKit 字段 Tab 顺序和模式链接焦点检查通过。模拟结果不等于 iOS Safari/Android Chrome 真机验收。
- 修复 iPhone Safari 在 NAS 内网 HTTP 下缺少 `crypto.randomUUID` 导致消息无法发送的问题，使用 `crypto.getRandomValues` 生成 UUID v4 回退；移动聊天壳同步 `VisualViewport` 高度和顶部偏移，以固定定位适配软键盘和地址栏滚动。全量 249 项单测、类型检查和构建通过；iOS/Android 真机复验仍待完成。
- 源码提交 `aa41ef7` 补齐 HTML/静态资源安全响应头后，已于 2026-09-28 随 `f0e9728` 部署到 NAS。现场检查首页、`/index.html` 和 JS 静态资源均返回 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`X-Frame-Options: DENY`；入口页不缓存，静态资源使用一年 immutable 缓存。`/healthz` 返回 `ok`，同源 readiness 返回 `UP`。

## 浏览器能力要求

- JavaScript、WebSocket 和 Blob 对象 URL 用于页面、实时消息和媒体预览。
- IndexedDB 用于可选的纯文字消息缓存。浏览器禁用 IndexedDB 时应继续从后端读取消息，不阻断登录和聊天。
- 文件通过浏览器文件选择器上传；默认下载交给浏览器管理。若浏览器提供 `showSaveFilePicker`，用户可逐次选择保存位置；若提供 `showDirectoryPicker`，用户可显式授权一个文件夹并按账号保存在 IndexedDB 中。下载时重新请求文件夹写入权限，用户可撤销或清除选择；不支持这些 API 时退回浏览器默认下载。应用不枚举任意目录，也不请求摄像头或麦克风权限。
- 生产部署要求 HTTPS/WSS。浏览器认证使用 HttpOnly SameSite Strict Cookie；HTTPS 部署将 `WETALK_WEB_AUTH_COOKIE_SECURE=true`。WebSocket 握手使用 60 秒一次性票据。

## 文件与媒体规则

| 类别 | 扩展名 | Web 客户端上限 | 预览行为 |
|---|---|---:|---|
| 图片消息 | `.mjpeg`、`.jpeg`、`.jpg`、`.png`、`.gif`、`.bmp`、`.webp` | 200 MiB | 鉴权下载为 Blob 后在弹层查看 |
| 视频消息 | `.mp4`、`.avi`、`.rmvb`、`.mkv`、`.mov` | 499 MiB | 同源部署时使用受鉴权的单区间 HTTP Range 流，外部 API 基址回退完整 Blob 下载；尝试本机浏览器生成最大 640×360 的 PNG 首帧封面并随视频可选上传；实际编解码能力取决于浏览器 |
| 音频消息 | `.mp3`、`.wma`、`.flac`、`.aac`、`.wav`、`.ogg`、`.m4a`、`.m4b` | 499 MiB | 同源部署时使用受鉴权的单区间 HTTP Range 流；外部 API 基址回退完整 Blob 下载；实际解码能力取决于浏览器 |
| 普通文件 | 其他安全扩展名 | 499 MiB | 下载保存，不作内容预览 |

浏览器和操作系统的解码能力不同；表中视频/音频扩展名表示客户端可选择和尝试预览，不保证每种容器及编码都能在每个平台播放。暂未设置跨媒体类型统一格式转换。

视频首帧封面由浏览器本地解码并导出 PNG；浏览器不支持该编码、画布不可用或 8 秒内无法取帧时，视频仍可无封面上传，聊天卡片显示播放图标回退。服务端按当前图片大小设置校验封面。

群头像和账号资料头像要求 PNG，单个文件不超过 10 MiB。聊天图片上限和普通聊天附件上限是 Web 客户端校验值；生产服务还需由后端执行同等或更严格的限制。


### 真实后端会话管理浏览器回归（2026-09-27）

本地 Chromium 桌面、手机视口通过 Vite 代理访问真实 Spring Boot、MySQL 和 Redis。创建三个独立会话后，网页显示设备标签和当前会话标志；分别执行单设备撤销与退出其他设备，当前浏览器保持在线，被撤销 Cookie 返回 901、目标 WebSocket 断开。MySQL 临时账号、关联记录及 Redis session/限流键已清理。

会话列表截图：D:/environment/WeTalkBrowserQA/captures/chromium-1280-session-list.png、D:/environment/WeTalkBrowserQA/captures/chromium-390-session-list.png。这些是浏览器视口模拟，不替代真实 Android/iOS 设备验收。
