# WebKit 刷新时的模块导入异常

2026-10-04，生产静态资源下 WebKit 手机模拟视口出现 `TypeError: Importing a module script failed.`，页面仍能完成后续操作。诊断没有发现缺失模块或 HTTP 4xx/5xx。

## 已复现的因果链

对既有测试账号执行登录后快速刷新。自然快速路径可以复现；另给只读 `getUserInfo` 请求增加 300ms 延迟，使待完成请求稳定存在，并在内存中包装原 Vue Router loader 记录调用（不修改产品文件、不更改账号资料）。

1. 原聊天文档触发 `beforeunload`。
2. WebKit 将资料、系统设置、版本、头像与 WebSocket ticket 的 XHR 标为 `Load request cancelled`。它们表现为 Axios 网络中断，不是 `CanceledError`。
3. 旧文档仍然派发 5 次 `wetalk:api-unavailable`，App 每次尝试替换到懒加载的 `service-error` 路由。
4. 当时的确切模块为 `/assets/ServiceErrorView-jIaLzRUZ.js`；原 loader 的 5 次 import 都在文档卸载中拒绝，随后出现未处理 Promise 错误。
5. `pagehide` / 新文档 `pageshow` 后，正常聊天页面继续加载。

## 修复范围

- 独立生命周期模块在 `beforeunload` / `pagehide` 标记正在离开页面，在 `pageshow` 恢复，包括 BFCache 返回。
- HTTP 层在正在离开的文档中不再广播全局服务/认证导航事件；原有 Axios 主动取消识别保持不变。
- App 在相同阶段不启动错误页/登录页导航；对已经启动而后随卸载取消的路由 Promise 进行条件处理。活动文档中的导航失败仍会抛出，真实网络和服务错误仍保留原行为。
- 不使用 `visibilityState === hidden` 判定。仅切换到后台的活动标签页仍处理真实 API 失败。

## 验证

- 修改前两个专门回归失败：卸载中仍导入错误页、pagehide 仍响应错误事件。修复后5项专门用例通过，涵盖 BFCache恢复、后台页真实错误和待完成路由拒绝；与HTTP/服务错误页合计15项通过。
- 全量46个测试文件、335项单元/组件测试通过，Vue类型检查与生产构建通过。
- 原快速刷新+300ms资料延迟的真实 WebKit 390×844 用例，在修复构建上仍记录5个被刷新取消的 XHR，但全局错误事件/错误页导入为0、pageerror为0，登录→刷新→设置→退出完成。
- 为避免扰动并行集成服务，该回归只在浏览器拦截静态资源并读取修复后的生产 `dist`；API和WebSocket继续访问原同源隔离服务。随后由总体验收者在更新的固定生产快照复验完整矩阵。

独立诊断脚本：工作区 `audit/webkit-module-debug.mjs`。原始日志位于私有测试目录，未提交账号或凭据。
