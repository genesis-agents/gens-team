---
name: project_per_task_rerun_R0_R8_complete_2026_05_07
description: 2026-05-07 完成 per-task-rerun + cascade 全套 8 PR 实施（v1.2 设计→实施→集成 spec→push）
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# Per-task rerun + cascade（PR-R0~R8 全量落地）

**日期**：2026-05-07
**设计文档**：`docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md` v1.2 (1336 行，5 路评审 APPROVED)
**触发动因**：mission c195035f S11 chapter_content_incomplete guard 拒签 → 用户要求"单任务就地重跑"防全局重跑浪费

## 已落地 PR 列表（8 commit, push 到 main）

| PR                                | Commit                                             | 范围                                                                                           |
| --------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PR-R0                             | `1f3e93843`                                        | 集体评审收尾（3 路 approved + 3 非阻塞）                                                       |
| PR-R1                             | `d0383aec9`                                        | stage DAG schema + 14 step dag 元数据                                                          |
| PR-R2                             | `ecdd77024`                                        | ctx-hydrator 增强 + heartbeat 时间窗（60s 内拒，外允许）                                       |
| PR-R3                             | `a2e88d965`                                        | MissionStore.markReopened（5×5 矩阵）+ markIntermediateState + resetFields                     |
| PR-R3-fix `80bbe5eff` `7159e3272` | mission:reopened 事件注册 + frontend baseline 同步 |
| PR-R4                             | `90f264d4c`                                        | S6/S7/S8/S8B stage 主动持久化中间产物（不必等 S11）                                            |
| PR-R5                             | `271318b32`                                        | StageRerunDispatcher cascade + handler registry（s9b 真实 handler，其余 12 stage placeholder） |
| PR-R6                             | `d6ab34cff`                                        | LocalRerunService 黑名单 + stepId 路由 + reopen + 24h 频次 + 实时 cost guard                   |
| PR-R7                             | `0b0e4b745`                                        | Frontend stepId 路由 + cascade preview 二次确认                                                |
| PR-R8                             | `e9f81816f`                                        | 三方集成 spec + c195035f backfill 模拟（11 spec 全绿）                                         |
| 收尾 fix                          | `ef5abc975`                                        | rerun:stage-started/cascade-aborted 事件注册 + frontend baseline 同步                          |

## 架构关键决策（已凝结）

1. **stage handler placeholder 模式**：PR-R5 dispatcher 注册全 13 stage 但只有 s9b 是真 handler，其余 throw "[PR-R5b] xxx"。理由：避免一次性写 RerunMissionDepsBuilder（要 stub billing/pool/leader/abort/credits 装配级 dep）阻塞整个流程；先打通 cascade 链路，handler 按需补。
2. **best-effort partial 语义**：cascade 失败不 throw，返回 (completed, abortedAt, remaining) 三元组 + emit cascade-aborted。已成 patch 保留，未跑下游不动。前端 UI 据此显示部分成功。
3. **reopen 自动化**：cascade 终点是 s11-persist + status ∈ {failed, quality-failed} → 自动 markReopened（乐观锁单 SQL update count 防 TOCTOU）。状态机 5×5 完全闭合（25 + 4 spec 全覆盖）。
4. **stage 主动持久化（PR-R4 关键）**：S6/S7/S8/S8B 在产物落 ctx 后立刻 markIntermediateState，不再等 S11。让 cdHydrate 重跑路径永远从 DB 读到最新中间状态。markIntermediateState 内部 catch + log.warn，DB 故障不卡 stage。
5. **频次 + cost 双闸**：rerun_attempts 表（5/24h）防滥用；mission.cost_usd >= max_credits 防累积超支。两闸都在事务内原子检查。
6. **placeholder pending list**：12 个 stage 仍是 placeholder，后续 PR-R5b/R5c 用 RerunMissionDepsBuilder 复用 MissionStageBindingsService.buildDeps() + stub billing 补真 handler。

## Spec 覆盖（全绿）

| Spec                                       | 数量    | 描述                                                          |
| ------------------------------------------ | ------- | ------------------------------------------------------------- |
| mission-store.rerun.spec                   | 17 case | markReopened 5×5 矩阵 + markIntermediateState + resetFields   |
| ctx-hydrator.service.spec                  | 15 case | 60s heartbeat 时间窗 + 5 字段 hydrate + zod parse + 2MB guard |
| stage-rerun.dispatcher.spec                | 11 case | runFromStageWithCascade + dispatch legacy + s9b handler       |
| local-rerun.service.spec                   | 19 case | isLocallyRerunable + run 全闸 + reopen + 频次 + cost          |
| rerun-integration.spec                     | 11 case | 三方集成 + c195035f backfill 模拟                             |
| s6/s7/s8/s8b stage spec（新增 PR-R4 case） | 11 case | markIntermediateState 持久化反向证据                          |

## 残留 + 后续

- **PR-R5b / R5c (TODO)**：12 个 placeholder handler 改真实（用 RerunMissionDepsBuilder + MissionStageBindingsService 复用 buildDeps 装配 stub billing/pool）。当前用户可走的真路径：
  1. POST /missions/:id/todos/:todoId/local-rerun + body.stepId='s9b-objective-eval' → cascade [s9b → s10 → s11]，s9b 真跑 + s10/s11 placeholder 中止 + reopen 完成。
  2. 老路径 scope=system + s9b-objective-evaluation（不传 stepId）→ 走老 dispatch 直接打分写库。
- **prod 验证**：c195035f mission 已 backfill 模拟 spec 验证；真实 prod 调用待 PR-R7 前端 UI 暴露后由用户触发。
- **频次表 prisma 名**：`agentPlaygroundRerunAttempt` 模型在 prisma schema 已存在（PR-R0 migration 落地），列：missionId/userId/stepId/triggeredAt + 索引 (mission_id, step_id, triggered_at DESC)。

## 关联文档 / 元教训

- 设计 v1.2 1336 行 → 实施 8 PR：单 PR 平均 ~150 行业务 + ~100 行 spec
- 每 PR 落地 → 立刻验证 → 立刻 commit；最后批量 push
- pre-push event-contract spec 第二次拦下漏注册（cascade 事件），证明 contract spec 是最后 net 防漂移
- placeholder handler 是务实选择：架构先打通，handler 按消费驱动渐进补
