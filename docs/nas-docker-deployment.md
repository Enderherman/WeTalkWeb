# WeTalkWeb NAS Docker 内网部署手册

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

本次 NAS 因 `8080` 已被占用，将 `WEB_PUBLISHED_PORT` 设为 `8081`。从局域网浏览器打开 `http://<NAS_LAN_IP>:8081`，实测 Cookie 登录、REST、WebSocket ticket、双账号好友申请与私聊、幂等重试、历史恢复和已读回执。非 root Nginx 的同源 `/api`、`/ws` 代理、实际 Origin、端口映射和浏览器链路均已现场验收；附件实机验收仍待完成。

## 2026-09-28 实际部署验收

- 后端与网页已部署到 `/volume2/docker/wetalk` 和 `/volume2/docker/wetalk-web`；网页 LAN 端口为 `8081`，后端宿主机端口 `15050/15051` 只绑定 `127.0.0.1`。
- 复用了原有 `wetalk-mysql`、`wetalk-redis` 容器、`wetalk-net` 网络与数据目录，没有重建或清空基础服务。部署前保存了数据库逻辑备份，以及 `.env`、`secrets/` 和 Compose 文件的受限归档；当时数据库含 9 张表结构、无记录行。
- 备份后应用 `sql/002-client-message-idempotency.sql` 与 `sql/003-persistent-unread-cursor.sql`，并读回确认字段和索引。测试后清理了临时账号、好友关系、会话和消息，业务表行数恢复为 0。
- NAS Docker 后端 readiness 返回 `UP`，网页 `/healthz` 返回 `ok`，同源 `/api/actuator/health/readiness` 返回 `UP`。Playwright 双账号真实后端验证注册/登录、Cookie 会话、WebSocket、好友申请、私聊发送、幂等重试、历史恢复和 type 17 已读回执。生产网页在 Chromium 360/390/768/1280 模拟视口无横向溢出或页面错误。
- 数据库备份已生成但尚未执行恢复演练；HTTPS/WSS、正式域名、实体手机 Safari/Chrome 和实体设备辅助功能检查仍待完成。

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

本手册、Docker Compose 配置、NAS 容器部署与 LAN 浏览器验收已通过；数据库备份恢复演练、HTTPS/WSS 和实体设备验收仍待完成。
