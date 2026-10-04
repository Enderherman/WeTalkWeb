# 长历史消息布局回归

2026-10-04，真实后端页面发现长历史、版本提示与会话工具栏同时出现时，输入框位于视口下方。CSS Grid 的隐式行使用内容最小高度，`.chat-main` 没有允许收缩，导致 `.conversation-panel` 的滚动属性无法发挥作用。

修复为 `.chat-shell` 声明 `grid-template-rows: minmax(0, 1fr)`，并为 `.chat-main` 设置 `min-height: 0`；版本提示限制高度并在自身滚动。

`scripts/check-chat-layout.cjs` 用仓库真实 CSS、40 条消息、版本提示和会话操作构建布局夹具，在真实 Chromium 测量输入框边界及消息滚动。它不代替真实登录/API 流程。

- 修复前 390×844：聊天列高 3550.75px，输入框底部 3504.75px，断言失败。
- 修复后 390×844：输入框底部 798px；768×1024 为 982px；1280×900 为 858px；390×450 为 404px。
- 四组均无横向溢出，长历史在消息区域内部滚动。
- 69 项相关单元/组件测试、类型检查和生产构建通过。

运行需要已安装的 Playwright 和 Chromium：`node scripts/check-chat-layout.cjs`。Playwright 不在当前项目依赖目录时，可通过 `WETALK_PLAYWRIGHT_PACKAGE` 指向其包目录；浏览器缓存可通过标准 `PLAYWRIGHT_BROWSERS_PATH` 配置。本轮复用 `D:/environment/WeTalkBrowserQA/node_modules/playwright` 和 `D:/environment/WeTalkBrowserQA/browsers`，未安装新依赖。
