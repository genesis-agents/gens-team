---
name: feedback-grep-before-yagni-judgment
description: 评估"是否过度抽象 / 是否目标态"前必须 grep 真实使用者数量,不要凭直觉判 YAGNI
metadata:
  type: feedback
---

2026-05-24 翻车:评估 `agent-playground-target-boundary-and-directory-blueprint` 文档时,我凭"只有 1 个使用者"的直觉判定"等触发条件再抽 framework",建议用户做守护+前端先,后端 framework 抽取推迟。

用户怒驳:**事实是项目已经有多个 Agent(AI Social / AI Radar / Writing 等)在 copy Playground 范式急需 harness 化**,我的"等触发"建议消极拖后腿。

grep 验证后真相:

- agent-playground/services/mission/workflow/: dispatcher / orchestrator / runtime-shell / stage-bindings / context / deps
- social/services/mission/workflow/: social-pipeline-dispatcher / social-business-orchestrator / social-runtime-shell / context / deps / narrative.util.ts
- radar/services/mission/workflow/: radar-pipeline-dispatcher / radar-business-orchestrator / radar-mission-runtime-shell
- **三家 copy-paste 同一范式,文件名只换前缀**,工具函数都在抄

**Why**:YAGNI / Karpathy 简洁原则的前提是"实际只 1 处使用",但**判断"几处使用"必须 grep 验证**,不能凭"我以为只有 X"的直觉。一旦事实是 N≥3 处使用同一范式,framework 抽取就是**正在受益的多团队投资**,不是"未来才用得着"的过度设计。

**How to apply**:

- 评估"是否过度抽象"/"是否目标态"/"是否 YAGNI"前,先跑 grep / find 统计实际使用者数量
  - `find backend/src/modules/ai-app -name "*<pattern>*.ts"` 看几家在用
  - `grep -rln "<concept>" src/modules/ai-app` 看跨模块出现频次
- 同一范式 copy-paste ≥3 处 = framework 抽取是**当下投资**,不是"等触发"
- 用户给目标态文档让我评估,先把文档里点名的"future teams"在仓库 grep 是否已经存在 → 多数情况"future"=当下
- 不要拿 Karpathy "3 处使用再抽象"反过来证明"还没到 3 处所以等等"——3 处使用就是抽的信号,不是缓抽的借口

**反指模式**(以后不再犯):

- "只有 1 个使用者" / "等真实第 2 个驱动" / "保留为未来目标态" / "现在做风险大不如先做守护" → 看到自己写出这些话,立刻 grep 验证

[[feedback-overclaim-cutover-verify-by-callgraph]]
[[feedback-dont-double-down-on-theory-when-user-pushes-back]]
[[feedback-verify-subagent-output-independently]]
