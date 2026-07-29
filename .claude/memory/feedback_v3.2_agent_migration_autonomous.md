---
name: feedback-v3.2-agent-migration-autonomous
description: v3.2 agent mass migration 自驱模式 + 100% 按方案 + 末尾集中评审
metadata:
  type: feedback
---

2026-05-24 evening 用户给 v3.2 agent migration 的最终执行模式:

> "后面请进入自驱模式,我希望严格按照方案 100% 实施,中间过程要快,
> 到全部完成后,组织多路集中评审"
>
> "目标:目录结构、工程结构、架构边界、组件能力复用,都完成最佳实践,
> 同时基于公共能力下沉的原则,将 Agent 实现最简化(基于既有方案)"

**执行规则**(对照已建立模式):

- 自驱:phase 完成 → copy / commit / push → 立刻派下一 phase,不问用户
- 100% 按方案:roadmap v2 列出的 P5-P32 全部做,不再 YAGNI 跳过
- 中间过程要快:不解释、不长报告、commit message 短
- 末尾集中评审:全部完成后派 architect / arch-auditor / reviewer / security-auditor 4 路 review(P32)

**两个 YAGNI 教训不再犯**:

- `feedback_grep_before_yagni_judgment` — grep 先于直觉判断
- `feedback_framework_enables_capability` — 必备能力即使 1 处使用也抽,以承接未来 app 接入

**Agent 最简化定义**(用户视角):

- ai-app/<team>/ 只剩 business input + pipeline graph + stage handlers + role services + adapter + 报告语义
- 业务专属字段 / SQL 表名 / event namespace / stage handler map 通过 hook 注入 framework
- framework 抽到 ai-harness/teams/business-team/ 各子目录 by §8.1
- 各 team 目录按 §8.2 顶层 module/api/runtime/mission/events 重组

[[feedback-framework-enables-capability]]
[[feedback-grep-before-yagni-judgment]]
[[feedback-batch-review-at-end]]
[[feedback-self-driven-iteration-mode]]
