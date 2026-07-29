---
name: per-task rerun + cascade 设计 v1.2 共识
description: 2026-05-07 任务级重跑 + 后置依赖级联设计 v1.0→v1.1→v1.2 三轮 5 路评审到 APPROVED-FOR-IMPLEMENTATION
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

2026-05-07 用户 mission c195035f 跑完 S1-S10 (43min/$3.42) 在 S11 失败，揭示 playground 不支持单 stage 就地重跑（必须整 mission 从 S1 重头跑，浪费巨大）。设计文档 `docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md` v1.2-final 已推主线（commit `3808a39ad`），10 PR / 10.5 天实施计划待启动。

**为什么需要**：mission 失败时 ctx 中间产物已持久化（research_results / chapter_drafts / mission 行字段），但缺少"从某 stage 起 cascade 跑下游"的执行器入口。现有 LocalRerunService v1 白名单仅 `system:s9b`，所以 c195035f 的 S11 重跑路径不通。

**v1.2 核心方案**：

1. **DAG schema 通用化**：每 step 加 `ctxReads/ctxWrites/dbWrites/successors/rerunable/resetFields`，类型放在 `ai-harness/runner/dag/stage-dag.types.ts`（通用层），PLAYGROUND_PIPELINE 仅填值
2. **单一信源**：S8/S6/S7 改为主动 markIntermediateState 写 mission.report_full / outline_plan / analyst_output（**新加 2 列**），event payload 仅审计不再作数据兜底
3. **ctx-hydrator 增强**：retry_label 取 latest（DISTINCT ON dimension ORDER BY created_at DESC）+ dim 字符串作 chapter join key（不用数组 index）+ ReportArtifactZodSchema parse
4. **StageRerunDispatcher**：handler registry (Map<stepId, StageHandler>) 替代 switch；13 stage 各自 handler + 显式 StageRerunStubs 接口
5. **cascade best-effort partial**：失败时已 patch 字段保留，emit `cascade-aborted{abortedAt, completed[], remaining[]}`，mission 状态保留为 running（让用户继续重跑）
6. **markReopened 乐观锁**：`updateMany where status in [...]` + 检查 `count===1` 防 TOCTOU
7. **hydrate guard**：status='running' 时按 heartbeatAt 时间窗判断（< 60s 拒、≥ 60s 允许）
8. **频次/预算**：rerun_attempts 表（24h × 5 次/mission+stepId）+ DB 实时 cost_usd 校验

**How to apply（实施时遵守）**：

- 实施 PR 顺序严格线性：R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8（每 PR 独立 mergable + 不能跳）
- markReopened 5×5 spec 真矩阵（5 from × 5 to = 25 case），不是 5×2 简化版
- ReportArtifactZodSchema.metadata 必须 `.and(z.record(string.max(64), unknown).refine(keys.length<=50))` 防 DoS
- backfill-c195035f-artifact.js 是一次性人工脚本，非 CI（PR-R8 含但仅 prod 救一个历史 mission）
- 不加 mission.rerun_phase 列（明确决策：用 heartbeat 时间窗代替）

**为什么不能简单"打开 LocalRerunService 白名单"**：

- v1 dispatcher 只实现 s9b（无装配级 dep），其它 stage rerun 需要 leader/billing/pool stub
- ctx-hydrator 当前 researcherResults 字段返回 undefined（line 126），cascade 到 S5/S6/S8 必崩
- 这两件加起来需要 PR-R2 + PR-R5（4.5 天），非"打开闸"小改

**Where（关键文件路径）**：

- 设计文档：`docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md` (v1.2, 1240 行)
- 现有 rerun 三件套：`backend/src/modules/ai-app/agent-playground/services/mission/rerun/{local-rerun,stage-rerun.dispatcher,ctx-hydrator}.service.ts`
- 现有 store 状态机：`backend/src/modules/ai-app/agent-playground/services/mission/lifecycle/mission-store.service.ts` L218 markCompleted / L439 markFailed / L852 markRerunPatch（v1.1 加 markReopened + markIntermediateState + resetFields）
- pipeline 定义：`backend/src/modules/ai-app/agent-playground/playground.config.ts` L80-260（14 step 加 dag 字段）

**评审历程**：

- v1.0 (首稿) - 5 路全 NEEDS-REVISION（22 修订点）
- v1.1 (合并 22 修订) - 4 APPROVED + 1 NEEDS-REVISION（仅 F4 矩阵不全 BLOCKER）
- v1.2 (合 F4 + 4 非阻塞) - 5 路 APPROVED-FOR-IMPLEMENTATION（arch 9 / tester 9 / security 9 / reviewer 4.5⭐ / coder 8）

**接下来**：等用户决定何时启动 PR-R0~R8 实施（10.5 天工作量），c195035f 现实路径选项：A. 整 mission fresh rerun 走现有路径验证 hotfix 3b8f28ab8；B. 等 PR-R0~R8 全落地后 backfill 救活原 mission。
