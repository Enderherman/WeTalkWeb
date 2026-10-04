# WebKit 页面卸载与请求中止

[首页](../README.md) · [更新日志](../CHANGELOG.md) · [请求归属](session-request-ownership.md)

## 当前行为

[页面生命周期模块](../src/utils/pageNavigationLifecycle.ts) 在 `beforeunload/pagehide` 标记正在离开，在 `pageshow` 恢复，包括 BFCache 返回。HTTP 层此时不派发全局认证/服务导航，App 不在正在卸载的文档中启动登录页或错误页导入。

已启动而随卸载被取消的路由 Promise 只在此条件下处理。活动页面的导航错误、真实网络/服务错误继续抛出或提示；Axios 主动取消保持独立语义。没有用 `visibilityState=hidden` 代替卸载判断，后台活动标签页仍处理真实失败。

## 因果证据

2026-10-04 的生产静态资源下，快速刷新可复现 `Importing a module script failed`。给只读资料请求增加 300ms 延迟后观察到：旧文档触发 `beforeunload`，WebKit 把五个 XHR 标为 `Load request cancelled`，Axios 将其视为网络中断；旧逻辑随后五次派发可用性事件并导入错误页，导入在卸载中拒绝。没有发现缺失资源或对应 HTTP 4xx/5xx。

修复构建仍有五个因刷新取消的 XHR，但错误事件、错误页导入和 pageerror 均为零，登录→刷新→设置→退出成功。这是识别卸载阶段后的结果，并非忽略 pageerror。

## 验证范围

修复前两个专门用例失败；修复后五项生命周期用例及 HTTP/错误页相关共 15 项通过，覆盖 BFCache、后台真实错误和待完成路由拒绝。功能纳入最终 373 项基线。

独立 WebKit 390×844 复验通过浏览器拦截静态文件读取修复后的 `dist`，API/WS 保持原同源隔离服务；后续固定生产快照又完成五组浏览器矩阵。两项证据分别记录，不能将浏览器静态拦截称为 NAS 部署。

诊断脚本在联合工作区 `audit/webkit-module-debug.mjs`，原始日志保存在私有测试目录。当前测试服务已停止；本次文档重写没有重跑上述环境。
