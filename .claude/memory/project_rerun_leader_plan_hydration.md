---
name: project_rerun_leader_plan_hydration
description: 单维度/中途重跑 cascade 从 s3 起，leader.plan() 永不调用，必须从 leaderJournal 回灌 context.plan
metadata:
  node_type: memory
  type: project
  originSessionId: fb80b096-fc17-4ac0-ada9-a497016380db
---

agent-playground 单维度/中途重跑（local-rerun）的 cascade 从 `s3-researcher-collect` 起，**不重跑 s2-leader-plan**，所以 `SupervisedMission.plan()` 永不被调用，leader 实例的私有 `context.plan` 为 undefined。

后果：cascade 里所有 leader 方法（s4 `assessResearchers`、s10 `writeForeword`+`signOff`）都有 `if (!this.context.plan) throw "must call plan() before X()"` guard → 全部抛错。生产日志实证 mission 06be38c5：`M1 assess-research failed (non-fatal): must call plan()...`，且因为是 non-fatal catch，前端整屏变红让人误以为"重跑没跑起来"（其实后台在跑，只是 leader 决策全废）。

**Why**：ctx-hydrator 建的是 stage 侧 `ctx.plan`（与 leader 实例的 `context.plan` 是两个对象），且早期它故意把 `goals/initialRisks` 设 undefined。

**How to apply**：

- 完整 plan 持久化在 `leaderJournal.plan`（themeSummary/dimensions/goals/initialRisks 整份，非主行 themeSummary+dimensions）。
- 修复（2026-05-30 commit f4a8901a9）：ctx-hydrator 优先从 `leaderJournal.plan` 还原完整 plan；`SupervisedMission.hydratePlan(plan)` 无 LLM 回灌 context.plan + 补种 plan 决策；`rerun-runtime-builder.buildSession` 创建 leader 后 `if (ctx.plan?.goals) leader.hydratePlan(...)`。
- foreword 自愈：s10 `writeForeword` 在同一 stage 先于 `signOff` 跑并 set `context.foreword`。
- **新增任何带 `context.plan` guard 的 leader 方法时，必须确认 rerun 路径已回灌**，否则重跑必炸。
- 相关：[[project_p1_react_runaway_fix_2026_04_29]] 的 non-fatal catch 同样会把功能性失败藏成"卡住"表象。

另：`report_full zod validation failed: N issue(s)` 是独立的 E49 优雅降级（旧报告 schema 漂移 → 重新生成报告），非本 bug。
