---
name: feedback-pc-two-column-breakpoint
description: 'PC 端"左右双栏"布局必须从 md 起就成立，不能用 xl 当唯一断点'
metadata:
  node_type: memory
  type: feedback
  originSessionId: ce962b97-346a-4c98-ae26-9cff763089b3
---

PC 端"左右双栏"布局的栅格断点不能只挂 `xl:` (1280px)。常见 PC 场景（1366×768 笔记本 / 1440 显示器开侧边栏 / 1280 但开发者工具占一半 / 缩放 125%）有效宽度都低于 1280px，会回退单列堆叠 → 用户视为严重 bug。

**Why:** 2026-05-11 LLM Wiki `WikiReaderPane.tsx:140` 只挂 `xl:grid-cols-[320px_minmax(0,1fr)]`，用户截图反馈：分辨率一低就上下堆叠不能接受。

**How to apply:** 任何"PC 双栏，移动单栏"的布局至少加 `md:grid-cols-[...]`（768px 起），可叠加 `xl:` 调整列宽。仅手机（<768px）才允许单列。同模式还可能出现在：Library / Knowledge Graph / Activity Drawer / 任何 sidebar+content 布局。新写双栏组件时默认 md 起步，不要图省事只写 xl。
