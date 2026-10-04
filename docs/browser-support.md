# 浏览器支持与文件规则

## 最新运行复核（2026-10-04）

固定生产构建通过实际安装的 Chrome 154.0.8037.95（1366×768）、Edge 154.0.4258.48（1280×800），以及 Chromium 153.0.8010.12 手机视口（360×800）、WebKit 26.6 手机/平板视口（390×844、768×1024）的登录、聊天、刷新、设置和退出，五组页面异常均为零。后端为独立本机 MySQL/Redis/Spring 实例，邮件和 AI 为本机协议兼容 fixture。历史较多时输入区、账号菜单、窄屏管理页问题已修复，详见 [实际浏览器记录](ui-regression-20261004.md)。

此记录补齐了下面 9 月历史记录中的桌面登录后流程；前一稳定版 Chrome/Edge 品牌发行包及 iOS/Android 真机仍待验收。本轮未部署 NAS，正式域名按用户要求留空；9 月部署记录只说明当时版本。

## 账号设置与聊天输入框回归（2026-09-28）

账号设置弹窗把关闭按钮和四个分区入口放在滚动内容之外；组件用例验证关闭按钮不属于滚动容器、菜单可切换到账号安全区。聊天输入框默认 `rows=1`，输入时按内容高度扩展；组件与 CSS 合同用例检查默认行数、扩展高度、有会话草稿时发送按钮可用、启用色和焦点环。全量 259 项测试、Vue 类型检查和生产构建通过。commit `2ab765e` 已部署到 NAS，健康检查及新静态 CSS/JS 资源验证通过。真实登录态目视验收和 iOS/Android 设备验收仍待完成。

## 头像账号菜单与退出登录回归（2026-09-28）

侧栏头像打开账号菜单，菜单承载个人资料、管理员入口和退出登录；不再在侧栏独立渲染箭头退出按钮。组件用例验证菜单 ARIA 状态、Escape 关闭/焦点返回、资料项导航和菜单内退出；CSS 合同检查菜单为头像锚定弹层。全量 261 项测试、类型检查和生产构建通过。commit `ada35c0` 已部署，NAS 健康检查和新 CSS/JS 资源验证通过；登录后实际页面目视验收仍待完成。

本表定义 WeTalkWeb 的验收目标。记录支持范围不代表相应设备的视觉验收已经完成；首次正式发布前仍需按表中的尺寸运行核心流程。

## 浏览器目标

| 环境 | 验收目标 | 核心尺寸 | 当前状态 |
|---|---|---|---|
| Windows 桌面 Chrome、Edge | 各自当前稳定版及前一稳定版 | 1280×800、1366×768 | 2026-10-04 实际安装版 Chrome 154.0.8037.95 / Edge 154.0.4258.48 登录后核心流程通过；前一稳定版品牌发行包仍待验收 |
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

`.mjpeg` 在聊天图片范围作为 JPEG 别名保留，上传规范为 `image/jpeg`；后端兼容旧客户端的 MJPEG MIME 别名，但仍检查 JPEG 签名和图片配额。浏览器 `File.type` 为空时，网页仅对已支持扩展名补规范 MIME，保留原文件名/字节；已知非空且不匹配的图片 MIME 会被拒绝。资料/群头像和封面保持原图片格式列表。

视频首帧封面由浏览器本地解码并导出 PNG；浏览器不支持该编码、画布不可用或 8 秒内无法取帧时，视频仍可无封面上传，聊天卡片显示播放图标回退。服务端按当前图片大小设置校验封面。

群头像和账号资料头像/封面支持 PNG、JPEG、GIF、BMP、WebP，文件必须非空且不超过 10 MiB；前端校验扩展名/MIME，后端还校验图片签名。聊天图片上限和普通聊天附件上限是 Web 客户端校验值；生产服务还需由后端执行同等或更严格的限制。


### 真实后端会话管理浏览器回归（2026-09-27）

本地 Chromium 桌面、手机视口通过 Vite 代理访问真实 Spring Boot、MySQL 和 Redis。创建三个独立会话后，网页显示设备标签和当前会话标志；分别执行单设备撤销与退出其他设备，当前浏览器保持在线，被撤销 Cookie 返回 901、目标 WebSocket 断开。MySQL 临时账号、关联记录及 Redis session/限流键已清理。

### Windows 实际桌面 Chromium 验收（2026-09-28）

Playwright 1.63 启动可见的 Chromium 153.0.8010.12 实际浏览器窗口访问 NAS 部署网页；Windows 显示器为 1920×1080，最大化浏览器 viewport 为 1920×952。登录、注册页均返回 HTTP 200，真实图片验证码可加载，页面无 JavaScript 异常或横向溢出。键盘顺序验证通过：登录为邮箱、密码、图片验证码、验证码刷新、登录；注册为昵称、邮箱、密码、确认密码、邮箱验证码、发送邮箱验证码、图片验证码、验证码刷新、创建账号。未输入账户信息或提交表单。

登录与注册截图：`D:/environment/WeTalkBrowserQA/captures/nas-desktop-login-chromium-20260928.png`、`D:/environment/WeTalkBrowserQA/captures/nas-desktop-register-chromium-20260928.png`。NAS 实际站点的 Playwright WebKit 390×844、768×1024、1280×900 登录/注册共 6 组检查也通过，包含邮箱验证码输入框与发送按钮的 Tab 顺序、模式链接焦点、零横向溢出和零页面异常；这仍不代替当前稳定版 Chrome/Edge 完整聊天流程或 iOS/Android 真机验收。

会话列表截图：D:/environment/WeTalkBrowserQA/captures/chromium-1280-session-list.png、D:/environment/WeTalkBrowserQA/captures/chromium-390-session-list.png。这些是浏览器视口模拟，不替代真实 Android/iOS 设备验收。

### iPad Safari 底部滚动修复回归（2026-09-28）

聊天页面根节点现在锁定到 VisualViewport 的底边高度，避免 Safari 地址栏/工具栏收起造成 `100vh` 高于可视区时仍能滚动页面背景。Playwright WebKit 26.6 在 512px（iPad 分屏窄视口）、834px（11 英寸纵向）和 1024px（12.9 英寸纵向）宽度模拟了布局高度比可视高度多 16px 的情况：修复前可滚动 16px，修复后 document/body 不再滚动，聊天壳与可视区底边一致。该回归已针对 NAS 部署构建再次通过，API/WebSocket 和 VisualViewport 尺寸使用 mock；截图保存在 `D:/environment/WeTalkBrowserQA/captures/nas-chat-scroll-after-ipadSplit-20260928.png`。真实 iPad Pro Safari 仍需复验。

修复部署：WeTalkWeb commit `527f4b5`，源码 ZIP SHA-256 `8ee72d514160dae2c2cbe9329bb994eafef3c3d5138dd1dac2502c436355957f`。NAS 网页镜像 `wetalk-web:0.1.0` 已重建，容器 `/healthz` 返回 `ok`、后端 readiness 返回 `UP`；后端、MySQL、Redis 未重启。旧网页镜像保存在 `wetalk-web:0.1.0-pre-527f4b5-20260928`。iPad Pro 实机复验仍待完成。

### 实际安装版 Chrome / Edge 登录注册检查（2026-09-28）

Playwright 1.63 启动本机安装的 Chrome 154.0.8037.57 与 Edge 154.0.4258.37，访问 NAS 实际部署站点。两个浏览器均检查登录、注册页的桌面 1440×900 和手机宽度仿真 390×844：页面 HTTP 200，图片验证码加载，Tab 顺序通过，没有横向溢出或 JavaScript 页面异常；未登录或提交表单。脚本为 `D:/environment/WeTalkBrowserQA/nas-installed-browsers.mjs`，8 张截图保存在 `D:/environment/WeTalkBrowserQA/captures`，文件名前缀分别为 `chrome-` 和 `edge-`。

这项结果只覆盖已安装版本的登录和注册页。登录后聊天、前一稳定版浏览器、真实 iOS/Android 设备上的触控、安全区、软键盘和屏幕阅读器仍待验收。

### Chrome / Edge 表单语义与按钮尺寸检查（2026-09-28）

先在本地 Vite 页面用 mock 只替代图片验证码接口，再访问 NAS 实际部署站点并加载真实验证码。Chrome 154.0.8037.57、Edge 154.0.4258.37 各检查登录和注册页的 390×844 手机宽度仿真视口：页面均有主区域和一级标题；登录 3 个、注册 6 个输入框均关联标签；登录 2 个、注册 3 个按钮均有可访问名称且尺寸至少 24×24 CSS 像素。Chrome 可访问性树中，所有非忽略的按钮、链接、文本框、图片和标题都有名称。未提交表单。脚本为 `D:/environment/WeTalkBrowserQA/nas-auth-a11y-once.mjs`。

这是 DOM 语义和仿真尺寸检查，不代替屏幕阅读器或实体设备触控、安全区域和软键盘验收。
