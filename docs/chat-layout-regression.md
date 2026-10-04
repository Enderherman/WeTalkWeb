# 长历史聊天布局

[首页](../README.md) · [更新日志](../CHANGELOG.md) · [真实页面验收](ui-regression-20261004.md)

聊天壳用 `grid-template-rows: minmax(0, 1fr)` 限制可用高度，聊天主列设 `min-height: 0`，让长历史在消息区内部滚动；长版本提示在自身区域滚动。输入框应始终位于可视区，页面不能横向溢出。

## 可重复布局检查

[check-chat-layout.cjs](../scripts/check-chat-layout.cjs) 读取仓库真实 CSS，构造 40 条消息、版本提示与会话操作的夹具，再以真实 Chromium 测量。它验证布局，不代表登录或真实 API 流程。

```sh
node scripts/check-chat-layout.cjs
```

需要可用的 Playwright 与 Chromium。若 Playwright 不在本项目依赖中，用 `WETALK_PLAYWRIGHT_PACKAGE` 指定包目录，`PLAYWRIGHT_BROWSERS_PATH` 指定浏览器缓存；这些环境变量不会改产品配置。本轮已有工具目录为 `D:/environment/WeTalkBrowserQA/`。

## 已保存的测量

2026-10-04 修复前，390×844 视口的输入框底部为 3504.75px，超出页面；修复后结果如下：

| 视口 | 输入框底部 | 结果 |
|---|---:|---|
| 390×844 | 798px | 可见、内部滚动、无横向溢出 |
| 768×1024 | 982px | 同上 |
| 1280×900 | 858px | 同上 |
| 390×450 | 404px | 同上 |

当时相关单元/组件测试 69 项、类型检查和构建通过；随后另有真实后端页面验证。手机视口与 WebKit 仿真不替代实体设备软键盘、安全区域和触控验收。本次仅改文档，未重启浏览器或重跑布局夹具。
