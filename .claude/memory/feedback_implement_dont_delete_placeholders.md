---
name: 用户反馈占位按钮要实现而非删除
description: 当用户对 "P3a 后续上线" 类占位 alert 抱怨时，不要把按钮删掉绕过 ESLint，正确做法是连续把所有占位都补真实现，不要来回反复
type: feedback
originSessionId: d7fa9dec-c281-49d4-9fe6-5c8f85de1f5d
---

不要把"P3a 后续上线"占位按钮删除来绕开 ESLint unused-import；用户的潜台词是这些功能要尽快上线。

**Why**：2026-05-09 LLM Wiki 模块对接时连续踩坑——

1. 用户截图反馈 Query / Settings / Export / 手动建页 / Log 五个按钮全部弹"P3a 后续上线"
2. 我曾因 ESLint `unused-import` 删除了 `Download` / `Settings` 图标导入
3. 用户连发"为什么要删除呢？先不要删，等会都要实现啊"+"能不能直接实现了这些功能"+"也不要来回反复了"

用户期望"看到按钮 = 功能可用"，删按钮等于剥夺已经被告知的能力。

**How to apply**：

- 任何标着"占位 / TODO / 后续上线"的 UI 入口，**优先补实现，不优先删按钮**。补实现 = 拉一根后端实路 + 接上前端 hook + 替换 alert 为真组件。
- 一次性把同模块所有占位补完（参考 commit 26dd40339 + c9cd11f8f：Wiki 五个占位连续两 commit 全补完），不要走 PR-by-PR 慢迭代让用户来回追问。
- 若占位真的需要数周后续工程（如 server-side tarball export），UI 入口要么不放、要么明确说"未排期"，不留模糊"P3a 后续"
- 若 lint 因为 unused-import 失败：补实现而非删 import；如果阶段性确实用不到，加 `// eslint-disable-next-line` 临时挂着比删按钮稳。
