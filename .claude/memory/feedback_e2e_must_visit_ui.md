---
name: e2e-must-visit-ui
description: 端到端验证必须打开 UI 看渲染，不能只查 DB 数据 / 类型检查通过就声称完成
type: feedback
originSessionId: e9f587b9-3572-4652-bf01-a151597e4ef6
---

# 端到端验证不能跳过 UI 层

**Why**：2026-04-29 agent-playground 测试中，我自称"端到端跑完一个 epic mission 验证字数"。实际只做了：

- DB 直查 mission status / wordCount / leader signed
- 后端 type check 通过
- DB events 表统计

**完全跳过了用户真正接触的 UI 层**。结果用户提供截图后才发现 5 个 UI 层 bug：

- topic 显示成 `???????`（DB 查到 ?? 我以为是 SQL 显示问题，没真打开浏览器）
- 表格操作列 w-[8%] 太窄，重跑按钮溢出
- 连续视图保留了多余 TOC（我凭直觉加的，没对照 TI 真实视觉）
- 章节视图布局错（我没去看 TI 的 ChapterizedReportView.tsx 原型就重新发明）
- 报告 figures = 0（DB 查到了但没追根因）

**How to apply**：

1. **凡声称"端到端完成"前**，必须用以下任一方式验证 UI：
   - `curl https://prod-url/path` 抓 SSR HTML，grep 关键 DOM 结构
   - 询问用户截图，或直接告知「我没法访问 UI，请你看一眼」
   - 用 Playwright headless 截图对比

2. **UI "对齐 X" 类任务前**，必须先读 X 的源码 + 看 X 的实际渲染。「参考 TI」时打开 `frontend/components/ai-insights/reports/ChapterizedReportView.tsx` 读完整逻辑，**不能凭"我以为 TI 长这样"开干**。

3. **不能把"代码编译通过 + DB 数据合理"等同于 OK**。`type-check` 只防类型错误，`DB query` 只验数据，**两者都不验视觉**。

4. **不要替用户决定"用户应该喜欢什么"**。我加左侧 TOC 是凭直觉，用户明确说"不要 TOC"。设计选择不在明确需求内时，留 placeholder / 问用户，不要自己选。

5. **DB 字段乱码 / 0 / null 不是"显示问题"**。看到 `topic = '????'` / `figures_count = 0` 时，必须立即追：是写入丢失（编码 / 工具未调用），还是 SQL 客户端字符集问题。不能先入为主认为"显示问题"跳过。
