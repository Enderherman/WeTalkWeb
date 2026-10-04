# NAS Docker 同源部署

[首页](../README.md) · [更新日志](../CHANGELOG.md) · [浏览器要求](browser-support.md)

本手册描述当前仓库的部署方法，命令在 NAS 的 POSIX shell 中执行。**本轮未部署 NAS，正式域名未定。** 2026-09-28/29 部署和回滚仅是历史证据，详情移至更新日志；当前 IP、端口、容器、镜像与迁移状态必须现场核实。

## 拓扑与配置

| 入口 | 当前配置 |
|---|---|
| 网页容器 | `wetalk-web`，非 root Nginx，容器端口 8080 |
| 宿主映射 | `${WEB_BIND_IP:-127.0.0.1}:${WEB_PUBLISHED_PORT:-8080}:8080` |
| REST | `/api` 原路径转发到 Docker 网络中的 `wetalk:5050` |
| WebSocket | `/ws` 升级转发到 `wetalk:5051/ws` |
| 网络 | 外部 Docker 网络 `wetalk-net`；网页和后端必须同网 |
| 健康 | `/healthz` 只证明 Nginx；`/api/actuator/health/readiness` 检查后端 |

配置来源为 [compose.nas.yaml](../compose.nas.yaml)、[Dockerfile](../Dockerfile)、[nginx.conf](../nginx.conf) 和 [.env.nas.example](../.env.nas.example)。Docker 构建内执行 `npm ci` 与 `npm run build`，REST 基址固定为 `/api`。历史 NAS 曾因 8080 占用改用 8081，这不是当前部署的默认端口。

## 准备

1. 只读核实容器、共享网络、监听端口、数据挂载和持久化目录；不要覆盖现有 MySQL/Redis。
2. 按 [后端部署说明](https://github.com/Enderherman/WeTalk) 准备服务，使其在 `wetalk-net` 中以 `wetalk` 可解析。后端及数据库宿主端口保持受限，不需要向 LAN 暴露。
3. 备份数据库、附件、私有配置和现有镜像，确认恢复方法。当前初始化有 10 表；空库只使用最新 001，已有库按 [SQL 迁移说明](https://github.com/Enderherman/WeTalk/blob/main/sql/README.md) 补未执行的 002–007。
4. 确定网页实际 Origin。HTTP 内网测试可用 `WETALK_WEB_AUTH_COOKIE_SECURE=false`；HTTPS 部署必须设为 `true`。`WETALK_WEB_ALLOWED_ORIGINS` 与用户打开的协议、主机、端口一致。

不要将 SMTP、AI、数据库口令放入网页环境变量、源码包或命令日志。前端配置在构建时写入静态资源。

## 构建与启动

在 NAS 的 Web 仓库目录执行。以下初始化命令仅在尚无 `.env` 时复制模板，已有配置保持原样：

```sh
test -f .env || cp .env.nas.example .env
```

编辑 `.env` 中的 `WEB_BIND_IP` 为现场核实的 NAS LAN 地址，选择空闲的 `WEB_PUBLISHED_PORT`，并同步后端 Origin。正式域名保持未填状态，直到实际决定入口。然后执行：

```sh
docker compose -f compose.nas.yaml config --quiet
docker compose -f compose.nas.yaml up -d --build --no-deps wetalk-web
docker compose -f compose.nas.yaml ps
docker compose -f compose.nas.yaml logs --tail=100 wetalk-web
```

这组命令只重建 Web 服务，不启动后端或创建外部网络。如果当前用户没有 Docker 权限，使用 NAS 已配置的授权方式；不要更改共享服务权限来绕过。

## 验收

把下方地址替换为 `.env` 配置的实际网页入口，不要直接照搬历史 IP 或 8081：

```sh
WEB_ORIGIN='http://NAS_LAN_IP:WEB_PUBLISHED_PORT'
curl -f "$WEB_ORIGIN/healthz"
curl -f "$WEB_ORIGIN/api/actuator/health/readiness"
curl -I "$WEB_ORIGIN/index.html"
```

确认健康响应分别为 `ok` 和 `UP`；首页安全头包含 `nosniff`、严格来源策略及 `DENY`，HTML 不缓存，带哈希静态资源长期缓存。再用浏览器验证 Cookie 登录、一次性 WS 票据、双账号收发/已读/刷新、图片和普通附件字节、退出撤销。HTTP 200 或资源中出现某段代码不等于完成实际 UI 验收。

生产反向代理还需支持 WebSocket 升级、HTTPS/WSS、足够的上传体积和超时。Nginx 当前接收上限为 `510m`，Web/后端业务配额可以更严格。

## 回滚

发布前保存已核实的上一版本镜像，并记录镜像 ID、Compose、配置和数据库/附件备份。应用回滚使用备份镜像，不重新构建当前源码：

```sh
ROLLBACK_IMAGE='wetalk-web:REPLACE_WITH_VERIFIED_BACKUP_TAG'
WETALK_WEB_IMAGE="$ROLLBACK_IMAGE" docker compose -f compose.nas.yaml up -d --no-deps --force-recreate wetalk-web
```

回滚后重新执行健康和浏览器检查。Web 镜像回滚不会回滚 SQL、附件或后端；数据库变更必须单独验证兼容性，不使用 `docker compose down -v` 作为常规回滚。
