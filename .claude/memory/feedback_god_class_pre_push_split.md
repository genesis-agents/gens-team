---
name: god-class 拆分必须发生在 push 前不是 commit 后
description: pre-push hook 对 >2500 行文件的单次 push 净增量 >50 行硬拒，commit 成功不代表能 push；新功能落 god-class 文件要当场拆出 service/util/sub-component
type: feedback
originSessionId: d7fa9dec-c281-49d4-9fe6-5c8f85de1f5d
---

god-class size guard（`.husky/pre-push` step `[0a/5]`）对所有 >2500 行的 .ts/.tsx 文件设 50 行单次 push 净增量上限。commit 阶段不检查；只在 push 才拒。

**Why**：2026-05-09 LLM Wiki 批次 commit `e05620989` 让 WikiTab.tsx 从 2307 → 2671 (+364)，pre-push 直接拒。必须紧急拆出 WikiGraphModal.tsx + WikiSettingsModal.tsx 才能 push（commit `e58e44e0e`）。

**How to apply**：

- 给 god-class 文件（已 ≥2500 行）加新代码前，**先决定拆点**：
  - 新组件 / 新 modal / 新 drawer → 独立 .tsx
  - 新工具函数 → utils.ts 或 helpers.ts
  - 新 service / hook → 独立文件
- 写代码前用 `wc -l` 或 grep 确认目标文件当前行数；若 +50 会破阈值，先拆再写
- 单 commit 内多个新功能落同一 god-class 文件 → push 阶段 100% 被拒
- 拆分时注意：
  - 拆出的子文件可以保留独立的小 helper copy（如 Field 组件 13 行 inline 比跨文件 import 更清晰）
  - 通过 `import` 重新接入，类型保持 export
  - 新文件首行加 `'use client';`（client component 才行）+ 注释说明拆分原因
- god-class 列表查询：`npm run audit:debt`（参见 `reference_audit_debt_dashboard.md`）

**触发链**：commit 成功 → 写 commit message → push → husky pre-push 才跑 step [0a/5] → 失败拒推 → 工作树 dirty (lint-staged stash 已 pop)。整套 push 流耗时数分钟才知道被拒。
