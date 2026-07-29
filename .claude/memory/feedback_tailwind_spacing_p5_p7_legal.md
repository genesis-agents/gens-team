---
name: feedback-tailwind-spacing-p5-p7-legal
description: 'Tailwind 标准刻度含 5/7/9/11/13/14 等非 4 倍数值，audit 脚本扫"节奏外"时只能算 .5 半步刻度，不要算 p-5/p-7'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4ba200e5-9b40-4309-a19e-0e62967e8e36
---

Tailwind 内置 `p-5 = 1.25rem`、`p-7 = 1.75rem`、`p-9 = 2.25rem`、`p-11/p-13/p-14` 等都是**标准刻度**（虽然不在 4-multiple 节奏上）。扫"节奏外间距"违规时**只能**算 `.5` 半步刻度（0.5/1.5/2.5/3.5），不要把整数刻度算进去。

**Why**：2026-05-18 写 scripts/audit-ui-tokens.ts T5 规则时把 `p-5/p-7/p-9/p-11/p-13` 一并标违规，结果 4301 处。但 sample 全是 Tailwind 内置合法 class，是脚本误判不是真违规。修正为只算 `.5` 半步后降到 3005 处，是真节奏外（fine-grained 半像素 padding）。

**How to apply**：

- T5 类节奏 audit regex：`/(?:p|m|gap)[xytrlb]?-(?:0\.5|1\.5|2\.5|3\.5)\b/`
- 不要扩展到 `5|7|9|11|13` 整数
- 想强制"只用 4 倍数节奏"是项目自有规范，需要单独 opt-in 规则（默认 Tailwind 不认）
- 写 audit 脚本前先核对 https://tailwindcss.com/docs/padding 的官方刻度，不要凭直觉假设

**反例**：首版误报 1211 处合法 `p-5/p-7`，让 baseline 虚高 40%。

相关：[[project_frontend_ui_baseline_2026_05_18]]
