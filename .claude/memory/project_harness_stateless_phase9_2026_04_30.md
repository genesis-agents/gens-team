---
name: Phase 9 Harness Stateless 2026-04-30
description: TeamsMissionOrchestrator 4 个 in-memory Map 外置到 Redis (CacheService) + heartbeat-based orphan 检测，对标 Anthropic Managed Agents
type: project
originSessionId: 6662308c-f32e-469e-9b10-9e586bf7ddb0
---

2026-04-30 完成 Harness 状态外置 Phase 1（与 Anthropic Managed Agents 三大支柱中的"State 外置化"对齐）。

**2026-05-15 复核更正**：Phase 1 **只迁了 MissionElectionTracker / TeamsMissionOrchestrator 这一条链路**。审计发现 ai-harness/ 下仍有 14 处 `new Map()` 实例字段（token-budget / rate-limiter / billing-adapter disabledModels / teams workflow 等）属于"语义上共享状态"未迁，多 pod 部署时 budget 独立计数。下次"Stateless Phase 2"独立 PR 时按 `project_3layer_maturity_audit_2026_05_15` 的清单逐处分类迁移；不要再说"4 Map 已迁 Redis"涵盖全部。

**Why**：之前 `TeamsMissionOrchestrator` 持有 `states / originalInputs / missionTraces / kernelProcessIds` 4 个 in-memory Map，pod 崩溃即 mission 丢失，且单 pod 部署上限阻碍水平扩展。

**核心改动（4 commits 一次性交付）**：

1. 新建 `MissionRuntimeStateStore`（`ai-harness/runtime/teams/orchestrator/`）—— 基于 `CacheService`（Redis），支持 `setState/setInput/setTraceId/setKernelProcessId` + `claimOrBeat/getHeartbeat`，TTL 24h（state）/ 90s（heartbeat）。MissionExecutionState 的 Map 字段通过 `Array.from(.entries())` 序列化保留
2. `TeamsMissionOrchestrator` 双写：每个内存 Map 写入处异步同步到 store（fire-and-forget），mission 启动时 `startHeartbeat`（30s 续期 + unref），完成/失败/cancel 时 `stopHeartbeat + clearAll`，新增 `getStateAsync` 用于跨 pod 取 state
3. 新建 `MissionOrphanDetectorService` —— 1min 扫一次，心跳过期 (>120s grace) 视为 orphan，调 callback 标 failed + emit `agent-playground.mission:failed`（failureCode=ORPHAN_HEARTBEAT_LOST）。比已有 MissionHealthScheduler（基于 lastActivityAt + 60min stale）感知速度提升 30+ 倍
4. agent-playground module 在 onModuleInit 注册 callbacks

**How to apply**：未来任何在 harness/orchestrator 持有跨 pod 必需的状态时（mission 维度、agent 维度），必须走 MissionRuntimeStateStore 同款模式（CacheService 双写 + 心跳 + orphan detector callback）。禁止再加新的 in-memory `Map<missionId, ...>`。

**第二阶段（待独立 PR）**：基于 store snapshot 的 generator hot-resume —— orchestrator.execute 增加 resumeFromState 模式，从 step N 接着跑（不 markFailed），真正实现 Anthropic 式"任何实例可接管任何 session"。当前阶段用户体验是"心跳丢 2min → markFailed → 用户点重新运行"。

**关键文件**：

- `backend/src/modules/ai-harness/runtime/teams/orchestrator/mission-runtime-state.store.ts`（300 行）
- `backend/src/modules/ai-harness/runtime/teams/orchestrator/mission-orphan-detector.service.ts`（160 行）
- `backend/src/modules/ai-harness/runtime/teams/orchestrator/teams-mission-orchestrator.ts`（改 ~80 行）
- `backend/src/modules/ai-harness/facade/index.ts`（export）
- `backend/src/modules/ai-app/agent-playground/agent-playground.module.ts`（注册 callbacks）
- 18 spec tests, 204/204 orchestrator 套件全通过
