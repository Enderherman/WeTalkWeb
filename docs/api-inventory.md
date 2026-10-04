# REST 契约清单核对

2026-10-04，对照同级 backend 的七个应用 Controller 的类级和方法级 Mapping，当前共有 **55 个唯一 REST 路径**。`/chat/streamMedia` 使用 GET，其余客户端契约使用 POST；旧 Controller 上未限定方法的 `RequestMapping` 不额外算多个路径。Actuator、静态资源与 WebSocket 握手不包含在此计数中。

| Controller | 前缀 | 路径数 |
|---|---|---:|
| UserInfoController | /account | 14 |
| ManageController | /admin | 7 |
| AppUpdateController | /app | 6 |
| ChatController | /chat | 7 |
| UserContactController | /contact | 11 |
| GroupInfoController | /group | 7 |
| UserInfoBeautyController | /userInfoBeauty | 3 |

本轮补入 `/contact/saveRemark` 及请求/返回/私有可见性，联系人/个人详情/INIT 的 `remark`，type 18 与 INIT 的独立 schema；type 18 不计入 REST 数量。修正 `loadContact` 参数为 USER/GROUP（原文数字 0/1 与真实服务不符），补 `joinType` 语义、版本号/说明/外链/安装包/灰度名单校验，并记录群头像 PNG/JPEG/GIF/BMP/WebP、非空、10 MiB 和签名匹配规则。

`openApiContract.spec.ts` 检查 55 路径全集、权限、内部引用和本轮新增约束；存在同级 backend checkout 时，还直接读取 Controller 映射并与契约逐项比对。独立克隆 WeTalkWeb 时仅该跨仓库检查跳过，其余契约检查继续执行。

验证：本机 16 项契约检查（包括跨仓库映射）全部通过，类型检查和生产构建通过。此文是源码契约核对，不等同于运行中的 NAS 已升级。
