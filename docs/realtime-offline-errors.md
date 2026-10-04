# 离线聊天与实时连接错误归属

2026-10-04，真实持久浏览器测试在已登录聊天中断开网络并关闭实际 WebSocket：待发 UUID 已保存到 IndexedDB，但后台票据重试的 `ERR_NETWORK` 触发通用服务错误页懒加载，进而产生 `Failed to fetch dynamically imported module ...ServiceErrorView...`。不能把该异常当作页面刷新噪声，也不能通过忽略所有 pageerror 验收。

## 修复

- `/account/webSocketTicket` 显式选择本地 availability 错误策略。即使 Wi-Fi 仍连着、`navigator.onLine` 为 true，票据网络/服务失败也留给 Realtime 的连接状态、重试和错误提示处理，不把现有聊天/待发队列导航走。
- `navigator.onLine === false` 时，普通请求仍向调用者抛出错误，但不启动离线无法加载的通用错误页；App 同样保护现有工作区。
- 真正的 901 认证过期继续正常清理/导航登录。在线用户操作或首屏 API 的 5xx 继续触发通用错误页，且本地策略不会泄漏到下一次请求。
- 连接已显式 disconnect 后，迟到的 ticket 失败不再写入旧连接的本地错误状态。

## 验证

修改前的行为回归复现2个错误导航失败，另1个迟到票据错误回归也先失败；修复后关联6文件38项通过。全量48文件353项通过，类型检查及生产构建通过。

真实浏览器重启/IndexedDB原UUID重放的完整场景由 `audit/web-outbox-restart.mjs` 在更新后的固定生产快照继续复验；本文件不把单元回归代替该实际运行结果。
