# WeTalkWeb NAS Docker 内网部署手册

## 2026-09-29 侧栏搜索与收起

- WeTalkWeb commit `add29df`；源码包 SHA-256：`42953c8c314fe3eb80daee3f68730ebf6b7f9feb8ab81111f7eb2d2b7ecefc83`。
- 部署前旧镜像保存为 `wetalk-web:0.1.0-pre-sidebar-nav-20260929`，仅重建 `wetalk-web` 容器。Compose 校验和 Docker 构建通过，容器启动正常。
- NAS `/healthz` 与 `/api/actuator/health/readiness` 均返回 HTTP 200；新 `ChatHome` 脚本返回 HTTP 200，包含 `open-sidebar-search` 和 `collapse-sidebar` 控件。

## 2026-09-29 网页品牌统一

- WeTalkWeb commit `2c820e9`；源码包 SHA-256：`24f5460bc1d1dc71af949d5dfc20792b13cda445c83d5304d745ad6cbdd06337`。浏览器标签图标复用 WeTalkApp 的 `frontend/resources/icon.png`，标签标题和关于页名称显示为 `WeTalk`。
- NAS 旧网页镜像保存在 `wetalk-web:0.1.0-pre-branding-20260929`，只重建 `wetalk-web` 容器。Compose 校验和 Docker 构建通过；`/healthz` 与 `/api/actuator/health/readiness` 返回 HTTP 200，首页包含 `<title>WeTalk</title>` 及新图标路径，`/wetalk-app-icon.png` 返回 HTTP 200。

## 2026-09-29 联系人邮箱与昵称搜索部署

- 后端 commit `9f790f0`；发布包 SHA-256：`8d2fc126e11c31f272c5b41206e0e5693f636882e4229c5a86272ca002985711`。部署前保存旧镜像 `wetalk-backend:0.0.3-pre-contact-search-20260929`，仅重建 `wetalk` 服务，容器状态为 healthy，后端 readiness 返回 HTTP 200 / `UP`。
- WeTalkWeb commit `ecd1292`；源码包 SHA-256：`7b8343d0627401787fb4928669340a3cd41d273f33d7ea6c0a011f3b0bd18d4a`。部署前保存旧镜像 `wetalk-web:0.1.0-pre-contact-search-20260929`，仅重建 `wetalk-web`，Docker 构建通过；`/healthz` 和 `/api/actuator/health/readiness` 均返回 HTTP 200，新的 `ChatHome` 静态脚本返回 HTTP 200 并包含 `searchByKeyword`。
- MySQL、Redis 没有重建，NAS `.env` 未放入发布包或修改。真实后端对未登录的 `/api/contact/searchByKeyword` 返回业务码 901，确认接口受登录保护。当前没有临时登录账号，因此 NAS 上尚未执行带登录态的联系人搜索；邮箱、昵称匹配由后端测试覆盖。
- WeTalkApp commit `91e74a1` 已推送，桌面端构建通过；桌面安装包不是 NAS 服务，本次未重建桌面安装包。

## 2026-09-28 头像账号菜单改版部署

- WeTalkWeb commit `ada35c0` 已推送并部署。源码归档 SHA-256：`b468a198540f40cb15d6b3ddf63c5da3e1152b8e513e985c6dd1cc5a7ff6eac1`。
- 部署前将旧 `wetalk-web:0.1.0` 保存为 `wetalk-web:0.1.0-pre-ada35c0-20260928`；仅重建 `wetalk-web`，后端、MySQL、Redis 未重启，NAS 私有 `.env` 仍为权限 600。
- `/healthz` 和 `/api/actuator/health/readiness` 均返回 HTTP 200；NAS CSS/聊天 JS 资源可读取 `.profile-actions-menu`、`.profile-menu-signout` 和“退出登录”菜单项。
- 本轮未完成真实登录态浏览器目视确认；点击头像后的实际视觉与真实登出仍待验收。

## 2026-09-28 账号设置与聊天输入框修复部署

- WeTalkWeb commit `2ab765e` 已推送并部署。源码归档 SHA-256：`222ee40e2fd16fa8dd7851223583b1cb45e119eb3c71bf48008c74c07bc5b507`。
- 部署前把原 `wetalk-web:0.1.0` 标记为 `wetalk-web:0.1.0-pre-2ab765e-20260928`；旧镜像 ID 为 `sha256:7b51b39d9c6ce6278293436e062b3a165049b3b3957cec1057f80d71c5c8e20c`。新镜像 ID 为 `sha256:5d74c1ebc8a8d960430ec243c259c1d5b9ccd81134fb38fec1e989a4eee597c7`。
- 仅以 `docker compose ... up -d --build --no-deps wetalk-web` 重建网页容器；NAS 私有 `.env` 保持原文件且权限为 600，后端、MySQL、Redis 未重建。
- NAS `/healthz` 与 `/api/actuator/health/readiness` 均为 HTTP 200；新 CSS/聊天 JS 资源可读取，包含 `.profile-dialog-content`、`.profile-section-nav` 和设置分区标记；首页安全响应头与 `no-cache` 入口缓存头仍存在。旧镜像保留用于回退。
- 本轮没有真实登录态浏览器截图；用户登录后的资料弹窗滚动和聊天输入框目视复验、iOS/Android 真机验证仍待完成。

本手册描述一个同源入口：Nginx 网页容器对局域网提供 HTTP 服务，并在 Docker 网络内把 `/api` 和 `/ws` 转发给 WeTalk 后端。正式域名、HTTPS/WSS 和公网开放不在当前内网测试范围内。

## 部署拓扑

| 容器 | 宿主机监听 | Docker 网络地址 | 用途 |
|---|---:|---|---|
| `wetalk-web` | NAS 当前 LAN IP 的 `8080` | `wetalk-net` | 网页静态文件、同源 REST/WS 代理 |
| `wetalk` | `127.0.0.1:5050/5051` | `wetalk-net` | Spring Boot API 与 Netty WebSocket |
| `wetalk-mysql`、`wetalk-redis` | 默认仅 `127.0.0.1:13306/16379` | `wetalk-net` | 新建隔离测试环境的数据服务 |

网页使用 `http://<NAS_LAN_IP>:8080`。浏览器只连这个入口；Nginx 在 `wetalk-net` 内连接 `wetalk:5050` 和 `wetalk:5051`。后端、MySQL 和 Redis 的宿主机端口默认只绑定回环地址。

## 部署前检查

先连接 NAS 后只读检查当前 Docker 服务、网络、挂载目录、端口和数据库状态：

~~~shell
sudo docker ps -a
sudo docker network ls
sudo docker inspect <现有WeTalk或数据库容器>
sudo ss -ltnp
~~~

确认目录 `/volume2/docker/wetalk`、`/volume2/docker/wetalk-web` 和容器名可用。发现现有 MySQL/Redis 时，先核实 schema、凭据、备份和共享网络；不要用新的 `compose.infra.yaml` 覆盖现有容器或数据目录。新建基础服务时只使用专用的 `wetalk-mysql`、`wetalk-redis` 和 `wetalk-net`。

SSH、Docker 和数据库信息只从已授权的 NAS 配置中读取；不要把密码放入命令行、提交到仓库或写进测试日志。

## 准备后端

把后端发布 ZIP 传到 NAS 的专用目录，先校验，再解压：

~~~shell
mkdir -p /volume2/docker/wetalk
cd /volume2/docker/wetalk
RELEASE_ZIP="wetalk-backend-0.0.2-nas-<date>.zip"  # 替换为实际传入的发布包文件名
sha256sum -c "${RELEASE_ZIP}.sha256"
python3 -m zipfile -e "$RELEASE_ZIP" .
~~~

对全新隔离测试环境，`scripts/prepare_infra.py` 会生成 `.env`、Redis 配置和随机密钥；它发现已有 `.env`、`secrets/` 或 Redis 配置时会拒绝覆盖。默认将 MySQL 和 Redis 的宿主机端口绑定到 `127.0.0.1`：

~~~shell
python3 scripts/prepare_infra.py
sudo chown 999:999 config/redis.conf
sudo docker compose -f compose.infra.yaml config --quiet
sudo docker compose -f compose.infra.yaml up -d
sudo docker compose -f compose.infra.yaml ps
~~~

若是已有数据库，先备份并检查 `chat_message.client_message_id`、`chat_session_user.last_read_message_id` 和相应索引。仅缺少时按顺序应用 `sql/002-client-message-idempotency.sql`、`sql/003-persistent-unread-cursor.sql`；全新空库则由 `sql/001-schema.sql` 初始化。不要清空 MySQL 数据目录来重跑初始化。

编辑后端 `.env`，确认以下项：

- `DB_URL=jdbc:mysql://wetalk-mysql:3306/wetalk?...`，Redis 主机为 `wetalk-redis:6379`。
- `BACKEND_BIND_IP=127.0.0.1`，`HTTP_PUBLISHED_PORT=5050`，`WS_PUBLISHED_PORT=5051`。
- `WETALK_WEB_ALLOWED_ORIGINS=http://<NAS_LAN_IP>:8080`。
- 内网 HTTP 测试使用 `WETALK_WEB_AUTH_COOKIE_SECURE=false`；HTTPS 部署必须设为 `true`。
- `WETALK_AI_ENABLED=false`、`WETALK_AI_MODEL=none`；可信管理员邮箱按需填入 `ADMIN_EMAILS`。
- 将 `WETALK_DATA_DIR` 指向专用持久化目录，并确保容器 UID/GID `10001` 有读写权限。

启动并检查后端健康：

~~~shell
sudo docker compose -f compose.yaml -f compose.nas.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.nas.yaml up -d --build
sudo docker compose -f compose.yaml -f compose.nas.yaml ps
sudo docker compose -f compose.yaml -f compose.nas.yaml logs --tail=100 wetalk
curl -f http://127.0.0.1:5050/api/actuator/health/readiness
~~~

## 准备网页

把 `WeTalkWeb` 仓库放在 `/volume2/docker/wetalk-web`。复制 `.env.nas.example` 为 `.env`，把 `WEB_BIND_IP` 改成预先确认的 NAS 局域网 IP，默认测试端口为 `8080`；若已占用，改用空闲端口（本次使用 `8081`）并同步设置后端 Origin。后端的 `WETALK_WEB_ALLOWED_ORIGINS` 必须与最终网页 Origin 完全一致。

前后端 Compose 都连接外部网络 `wetalk-net`。启动网页容器：

~~~shell
cd /volume2/docker/wetalk-web
sudo docker compose -f compose.nas.yaml config --quiet
sudo docker compose -f compose.nas.yaml up -d --build
sudo docker compose -f compose.nas.yaml ps
sudo docker compose -f compose.nas.yaml logs --tail=100 wetalk-web
NAS_LAN_IP="SET_TO_CURRENT_NAS_IP"
WEB_PUBLISHED_PORT=8080
curl -f "http://${NAS_LAN_IP}:${WEB_PUBLISHED_PORT}/healthz"
~~~

本次 NAS 因 `8080` 已被占用，将 `WEB_PUBLISHED_PORT` 设为 `8081`。从局域网浏览器打开 `http://<NAS_LAN_IP>:8081`，实测 Cookie 登录、REST、WebSocket ticket、双账号好友申请与私聊、幂等重试、历史恢复和已读回执。另上传一个临时文本附件，由接收方经同源 API 下载并逐字节核对成功；测试文件已删除。非 root Nginx 的同源 `/api`、`/ws` 代理、实际 Origin、端口映射和浏览器链路均已现场验收。

## 2026-09-28 实际部署验收

- 后端与网页已部署到 `/volume2/docker/wetalk` 和 `/volume2/docker/wetalk-web`；网页 LAN 端口为 `8081`，后端宿主机端口 `15050/15051` 只绑定 `127.0.0.1`。
- 复用了原有 `wetalk-mysql`、`wetalk-redis` 容器、`wetalk-net` 网络与数据目录，没有重建或清空基础服务。部署前保存了数据库逻辑备份，以及 `.env`、`secrets/` 和 Compose 文件的受限归档；当时数据库含 9 张表结构、无记录行。
- 备份后应用 `sql/002-client-message-idempotency.sql` 与 `sql/003-persistent-unread-cursor.sql`，并读回确认字段和索引。测试后清理了临时账号、好友关系、会话和消息，业务表行数恢复为 0。
- NAS Docker 后端 readiness 返回 `UP`，网页 `/healthz` 返回 `ok`，同源 `/api/actuator/health/readiness` 返回 `UP`。Playwright 双账号真实后端验证注册/登录、Cookie 会话、WebSocket、好友申请、私聊发送、幂等重试、附件上传/下载、历史恢复和 type 17 已读回执。生产网页在 Chromium 360/390/768/1280、WebKit 登录/注册 390/768/1280 模拟视口无横向溢出或页面错误；WebKit 模拟不等同于 iOS Safari 实机验收。
- WebKit 登录/注册模拟还验证了邮箱、密码、验证码到提交按钮的 Tab 顺序和模式切换链接焦点；真实 iOS Safari 键盘/触控仍待用户设备验收。
- 已将数据库逻辑备份恢复到隔离的无网络 MySQL 8.4 临时容器，恢复出 9 张表后应用 002/003 并核对字段和索引；测试容器与随机凭据已清理。数据库恢复演练通过。空目录探针演练后，又对后端持久化附件目录中的 2 个真实文件（约 3.1 MiB）进行归档和隔离恢复；归档完整性、文件数、相对路径及汇总 SHA-256 均匹配，原文件未改动，验证归档保留在 NAS 私有备份目录、权限为 600，临时恢复副本已清理。HTTPS/WSS、正式域名、实体手机 Safari/Chrome 和辅助功能检查仍待完成。

### Nginx 安全响应头修复部署（2026-09-28）

- 部署已推送源码 `f0e97282e21b08f03accbd0dadfee840de722abd`，只重建 `wetalk-web`；后端、MySQL、Redis 容器没有重启或变更。
- NAS 源码归档：`/volume2/docker/wetalk-web/wetalk-web-0.1.0-nas-2026-09-28-r4-source.zip`；SHA-256：`da3d97a969552c2bd91ef1d523bdd6f116f3ca0465d9271125d5055cbad99e7a`。部署目录 `.env` 保留在 NAS，本次源码包不含 `.env`。
- 首页、`/index.html` 和 JS 资源均返回 HTTP 200，且包含 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`X-Frame-Options: DENY`；HTML 为 `Cache-Control: no-cache`，JS 为 `public, max-age=31536000, immutable`。
- `http://192.168.31.108:8081/healthz` 返回 `ok`，同源 `/api/actuator/health/readiness` 返回 `{"status":"UP"}`。网页镜像标签为 `wetalk-web:0.1.0`；部署前旧镜像保存在 `wetalk-web:0.1.0-pre-f0e9728-20260928`。已用 Compose 实际切回旧 Web 镜像并检查 `/healthz`，再切回 `wetalk-web:0.1.0`，复验安全响应头和 readiness；后端与数据库容器未重启。

### 后端镜像回滚演练（2026-09-28）

- 保留后端 0.0.2 镜像，再短暂以旧镜像代替 `wetalk-backend:0.0.3` 并通过原 Compose 重新创建后端容器；旧容器 readiness 返回 `UP`。
- 随后恢复 0.0.3 镜像标签并再次重建后端；运行中镜像 ID 与备份的 0.0.3 镜像一致，readiness 返回 `UP`。MySQL/Redis 与数据目录全程未重启或修改。
- 旧后端兼容性测试期间临时关闭 AI，回滚恢复后已将 NAS AI 配置恢复启用。2026-09-28 更新 QQ SMTP 授权码后 TLS/AUTH 与测试邮件提交通过；私有 `.env` 已启用邮箱注册、`MAIL_DEBUG=false` 且权限为 600，仅重建后端容器后 readiness 返回 UP。收件箱确认和注册验证码全链路仍待完成。

已现场验证的 Web 回退与恢复命令（在网页 Compose 目录执行）：

~~~shell
WETALK_WEB_IMAGE=wetalk-web:0.1.0-pre-f0e9728-20260928 docker compose -f compose.nas.yaml up -d --no-deps --force-recreate wetalk-web
curl -f http://192.168.31.108:8081/healthz
WETALK_WEB_IMAGE=wetalk-web:0.1.0 docker compose -f compose.nas.yaml up -d --no-deps --force-recreate wetalk-web
~~~

### WeTalk 0.0.3 邮箱注册与 AI 运行配置（2026-09-28）

- NAS 后端更新到 `wetalk-backend:0.0.3`，Web 注册界面也已更新；后端 readiness 返回 `UP`，MySQL/Redis 与数据目录未重建或迁移。
- DeepSeek 通过后端 OpenAI 兼容服务配置，模型为 `deepseek-flash`；从 NAS 使用运行环境中的 API Key 发起的最小请求返回 HTTP 200。Key 只保存在 NAS 私有 `.env`（权限 600），未放进仓库、前端或发布包。
- 首次使用的 QQ SMTP 授权码在 AUTH 阶段被拒绝，随后已从 NAS `.env` 清除。2026-09-28 新授权码已通过 `smtp.qq.com:465` TLS/AUTH，QQ SMTP 接受了一封发往配置邮箱的测试邮件；新口令只保存在 NAS 权限 600 的 `.env`，没有写入 Git 或镜像，`MAIL_DEBUG=false`。本机后端 101 项测试通过后，NAS 实际注册邮件接口返回 HTTP 200/业务码 200；最初诊断曾用一次性 JSON CAPTCHA 键。随后又从 NAS 注册页加载并正确解答真实图片验证码，再次请求接口，同样返回 HTTP 200/业务码 200，没有直接写 Redis 测试键。收件箱到达和最终邮箱注册仍待确认，详见 `email-registration-test.md`。

2026-09-28 后续由用户确认已收到注册验证码邮件。按要求只读 Redis 比对时，该验证码键已超过 10 分钟有效期并过期；没有读取或记录验证码明文，也未创建测试账号。

## 备份与回滚

每次升级前先安排写入窗口，保存数据库、业务文件目录、当前 `.env` 和 `secrets/`。如果是升级且旧镜像仍在本机，先保存可回滚镜像；首次安装时跳过：

~~~shell
mkdir -p backups
sudo docker image save wetalk-backend:0.0.2 -o backups/wetalk-backend-rollback.tar
sudo docker image save wetalk-web:0.1.0 -o backups/wetalk-web-rollback.tar
~~~

数据库可通过容器内受限的 defaults 文件备份，避免把密码写进命令参数；文件附件也应备份：

~~~shell
mkdir -p backups
BACKUP_FILE="backups/wetalk-$(date -u +%Y%m%dT%H%M%SZ).sql"
sudo docker exec wetalk-mysql sh -c 'mysqldump --defaults-extra-file=/run/secrets/mysql-client --single-transaction --routines --triggers wetalk' > "$BACKUP_FILE"
sudo tar -czf "backups/wetalk-files-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" data/backend
~~~

备份 `/volume2/docker/wetalk/data` 和部署配置到受限的 NAS 备份目录，并在恢复演练后再宣称备份可用。回滚应用时恢复上一版后端/网页镜像与对应 Compose 配置；若 SQL 迁移已执行，先根据备份验证代码兼容性，不要盲目删除列或索引。`docker compose down -v` 会删除卷，不用于常规回滚。

~~~shell
sudo docker image load -i backups/wetalk-backend-rollback.tar
sudo docker image load -i backups/wetalk-web-rollback.tar
sudo docker compose -f compose.yaml -f compose.nas.yaml up -d
sudo docker compose -f compose.nas.yaml up -d
~~~

2026-09-28 iPad Safari 聊天页底部滚动修复已部署：WeTalkWeb commit `527f4b5` 的源码归档 SHA-256 为 `8ee72d514160dae2c2cbe9329bb994eafef3c3d5138dd1dac2502c436355957f`，网页镜像 `wetalk-web:0.1.0` 已重建；旧镜像标签为 `wetalk-web:0.1.0-pre-527f4b5-20260928`。`/healthz` 返回 `ok`、后端 readiness 为 `UP`，仅重建网页容器，后端/MySQL/Redis 未重启。生产 NAS 页面上的 WebKit 26.6 mock API/WebSocket 回归在 512/834/1024px iPad 模拟视口通过，VisualViewport 比布局高度少 16px 时修复后 `scrollY=0`。本手册、数据库/附件归档恢复及 Web/后端镜像回滚演练已通过；真实 iPad Pro Safari、HTTPS/WSS 仍待验收。
