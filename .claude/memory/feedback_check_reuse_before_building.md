---
name: feedback-check-reuse-before-building
description: UI 一致性问题先 grep 公共组件 import 次数，复用率 < 30% 是治理问题不是组件缺失问题；不要先建新组件
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4ba200e5-9b40-4309-a19e-0e62967e8e36
---

UI 一致性 / 卡片不统一 / 风格散乱类需求，**第一步**必须 grep 公共组件实际 import 次数，**不是**先建新组件或新 token 系统。

**Why**：2026-05-18 Genesis.ai 前端审计实测发现，AssetCard / PageHeaderHero / EmptyState / ErrorState / LoadingState / MissionDialogShell / SideDrawer 等核心公共组件**已全部存在且设计精良**，但每个的 import 次数 ≤ 4。symptoms（profile/page.tsx 自写卡片 12+ 次、815 处 text-[Npx]、4 套 token 系统并存）本质都是"现有组件没人用"，建新组件只会让库更碎、复用率更低。这是治理问题不是工具问题。

**How to apply**：

1. 接到"UI 不一致 / 加个公共组件 / 设计系统不完善"类需求，第一步 Glob `frontend/components/{common,ui,layout}/**/*.tsx` 列既有组件，再 Grep 每个的 import 次数
2. 复用率 < 30% → 主要动作是**强制复用**（ESLint + AST 扫描禁止自写），不是建组件
3. 复用率 > 60% 且仍有缺口才考虑建新组件，且必须明确"哪 3+ 处会用"
4. 同时盘点 token 主源数量：1 套 OK、2 套需收口、≥ 3 套是事故现场
5. 不要把"建库"当目标，要把"复用率"当目标

**反例**：用户喊"UI 不一致" → 凭直觉提议"建 PageHeaderHero / EmptyState / SettingsCard 公共库" → 实际这些都已存在 → 用户已踩坑两年没人用。

**2026-05-20 补充（用户怒「为什么不用公共部件」）**：被要求「重构使风格一致/商务」时，对自写卡片的正确动作是**直接替换成 canonical（AssetCard/EmptyState/Table…）**，**不是**在自写卡上改颜色打补丁（blue→violet 那种）。我当时一路 patch 自写 `ResourceCard` 的配色而没换 `AssetCard`，被用户当场抓。改 canonical 才能自动得到一致风格。先查 canonical → 适配就直接换；缺口/不适配才停下问。

相关：[[feedback_no_dual_sources]] [[feedback_reuse_existing_capabilities]]
