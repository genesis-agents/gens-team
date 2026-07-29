---
name: project_todo_board_artifact_truth_2026_05_30
description: todo-board 阶段状态改用持久化产物作唯一真相（弃事件派生）+ cancelled 可被重跑复活 + 额度错误上 UI
metadata:
  node_type: memory
  type: project
  originSessionId: fb80b096-fc17-4ac0-ada9-a497016380db
---

agent-playground todo 看板"满屏红/已完成0"反复爆雷（Screenshot_26/27/29），病根=**阶段状态靠重放事件算，而 MissionEventBuffer 是 FIFO(5000)**，多轮重跑后早期 stage 的 lifecycle 事件被挤掉 → projector 看不到 done → 残留 pending → 前端 sweepStatus 扫成红。逐 mission-status 打补丁还漏了 quality-failed（不匹配任何分支）和 running。

**用户拍板：彻底简化，产物作唯一真相**（不是继续打补丁）。workflow 审计出 8 个 gap。

**How to apply（2026-05-30，commit cad9f2f24 + ac20ba6c1）**：

- `todo-board.projector.ts`：统一"产物 high-water"收尾，对全部 6 种 status 生效。产物→阶段映射：themeSummary/dimensions/leaderJournal→s2, reconciliationReport→s5, analystOutput→s6, outlinePlan→s7, reportFull→s8, verdicts→s9, leaderSigned→s10；无独立产物的 s1/s3/s4/s8b/s9b/s11 由 idx<=HW 包含式被前驱隐含覆盖。**产物在 DB 列，永不被事件挤掉**；事件只留作 live 中间态+叙述 trace。running 只补 pending、不下调 live in_progress。`DIMENSION_RETRY_ORIGINS` 提到模块级。
- 前端 `page.tsx`：cancelled mission 未抵达 stage 扫成 cancelled(灰)非 failed(红)；失败横幅 failed/cancelled/quality-failed 都显示（原只 failed）。
- `playground.pipeline.ts`：quota/payment-required → PROVIDER_QUOTA_EXCEEDED + 可操作中文文案（原掉进兜底 PROVIDER_API_ERROR 裸英文）。
- **cancelled 可被重跑复活**：`mission-lifecycle.helper.ts` reopenableStatuses 加 cancelled（playground-only，框架默认仍 [failed,quality-failed]）+ `local-rerun.maybeReopen` 加 cancelled 分支。否则被取消的 mission 点重跑→cascade 跑了烧额度但终态卡死，重跑真实失败写不回也显示不出来（生产 mission 06be38c5 实证）。

**关键认知**："cancelled by user"全项目只有一个来源=取消按钮（controller cancelMission）；额度/预算耗尽走 failed 路径不会变 cancelled。承接 [[project_rerun_leader_plan_hydration]] 同一 mission 的链路。事件当权威状态=反模式，DB 持久化列才是 eviction-proof 真相。
