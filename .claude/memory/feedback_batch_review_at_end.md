---
name: feedback-batch-review-at-end
description: '大型分阶段任务用"全部跑完统一审视",不每阶段 review'
metadata:
  node_type: memory
  type: feedback
  originSessionId: a071d038-7b22-4c8e-b662-cb7644667d9c
---

用户在 v3.1 self-driven iteration 中明确指令:"等 B2 完成后,B3 及后面的同步全部完成后统一进行集体审视"。

**Why**:

- 单子片 review/review-fix 模式在 v3.1 早期(0/A0/A 阶段)合理——风险高、决策密集
- 进入 B 子片 2+(写入面 + self-heal + 后续 B.5-B.8 + C + D + F)阶段后,每片都派 3-4 路 review 已经:
  - 撞 sub-agent 配额限制(Toronto 2:20am reset)
  - 拖慢推进节奏(等 review → review-fix → 下一片,中间多次切上下文)
  - 单子片 review 信号已收敛(0/A0/A 阶段共识机制已沉淀到 CLAUDE.md 红线和 v3.1 文档 §4 安全模型)
- 用户希望:**一鼓作气推完全 epic,然后集中评审整体连贯性**(catch 跨阶段问题比子阶段问题价值高)

**How to apply**:

- v3.1 剩余阶段(B 子片 3 / B+ / C / D / F / G)按"实施 → copy → commit → push → 直接下一片"流转,不派子片 review
- 每子片仍要主 agent 自验:`npx prisma generate / tsc / jest` 三件套必跑;commit message 仍要详尽(便于事后审视)
- 全部跑完后统一派 4 路集中 review(architect / arch-auditor / reviewer / security-auditor)
  - 评审范围:从 commit `ad67c9f45` 之后(B 子片 2 起点)到 G 阶段末尾的所有 commits
  - 重点:跨阶段语义一致性、SSOT 是否始终单一、scope 矩阵在所有写入路径都生效、ESLint AST baseline lock 是否真闭环

[[feedback-self-driven-iteration-mode]]
[[feedback-overclaim-cutover-verify-by-callgraph]]
