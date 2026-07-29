---
name: agent-playground 最简性 4 路审视 2026-05-08
description: 4 路并行审计（下沉/复用/最简/跨模块）综合评分 + 真问题清单 + 元判断
type: project
originSessionId: 62a9828f-0671-4aa6-af68-508d17f2619c
---

2026-05-08 4 路并行审计 agent-playground (24344 行非测试代码 / 170+ 文件)：

**4 维评分**：

- 下沉到位度 6.5/10（剩 1 P0 + 2 P1 + 2 P2 应上提）
- 复用系统能力 7.5/10（系统决策都对，剩 3 个边缘漏点）
- 内部最简性 5.5/10（巨型文件 + dual-write 残留 + 死代码）
- 跨模块一致性 中（playground 自己合规但 TI/writing 没跟上）

**真问题（按 ROI 排序）**：

1. **边界违规**：`per-dim-pipeline.util.ts:47` 直接 import `topic-insights/utils/strip-chart-json.utils`（跨 ai-app）—— `stripChartJsonFromContent` 应上提到 ai-engine/content 或 ai-harness/facade。ESLint `no-restricted-imports` 漏拦
2. **P0 双源**：`agent-execution-support.ts` 的 `runDagConcurrency`(~100 行) + `runWithConcurrency`(~30 行) vs harness `DAGExecutor` + `ConcurrencyLimiter`，S3 用本地 / S4 用 harness 已漂移；`event-relay.ts:11` 的本地 `estimateUsdFromTokens` 与 harness facade 同名函数完全重复
3. **死代码 ~80-200 行**：`buildS12LearnHooks()` + `buildNotYetWiredHooks()` + `PlaygroundHookNotYetWiredError`（s12 已从 pipeline.steps 删，全部不可达）；`lengthProfile` 全链路废弃但仍在搬运；mission-store 三方法的 `if (userId)` 双分支
4. **巨型文件**：dispatcher 2022 行（应拆 4 个）/ per-dim-pipeline 1540 行（应抽 runChapterPipeline 800 行独立 export）/ mission-store 1592 行（合理留下）
5. **P1 框架抽象**：`event-categories.ts` 分类框架 / `tickCost` budget exhaustion 应上提到 harness（其他 ai-app 都需要）

**已正确归位（不要再动）**：mission-store / event-buffer / checkpoint store / rerun-guard / local-rerun / ctx-hydrator / stage-rerun.dispatcher / mission-runtime-shell / playground-postmortem-patterns / leader-chat 全部是 playground schema 强耦合

**Why**: 用户问"是否最简实现 / 能力是否充分使用 / 公共能力是否下沉"—— 4 路并行 arch-auditor 给出的客观快照
**How to apply**: 后续 playground 改动、上提决策、拒绝 PR 时直接引用本审计结论；4 个 agent ID a0d88c617a9e4d8a1 / a35536f8131252aca / ad0785162188b7745 / ab203e897e8dcc9f0 可继续问

**元判断**：合理目标 18000-19000 行（压 21%）；最大复杂度浪费在 dispatcher 2022 行；不该被吸收回 research（不同范式）；跨模块单点最高收益是 TI/writing 切 DomainEventBus 对齐 playground
