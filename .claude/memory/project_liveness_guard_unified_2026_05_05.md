---
name: liveness-guard-unified-2026-05-05
description: 2026-05-05 mission liveness 4 detector 归一到 harness MissionLivenessGuard（多信号 + adapter 注入 + 多 namespace），fix 5 mission 100% heartbeat 误杀根因
type: project
originSessionId: 40c1dce4-5dcd-4b21-acfa-9b8692332500
---

## 2026-05-05 用户驱动重构：mission liveness 检测归一

### 真因（heartbeat 误杀的根因 5 mission 100%）

- mission 8f15404a 实证：被 PR-H v1 `recoverPodCrashedRunning(300s)` 标 failed 时
  events 表每分钟还在写 70-100 条事件，明显活着
- 原因：S3 chapter pipeline 重负载下 `refreshHeartbeat` 的 prisma update 与
  `markStageComplete` 在同 row 上撞 row lock + 偶发超时（`.catch(() => {})` 静默吞错），
  heartbeatAt 字段假性"过期 5min"
- 单信号检测必然误报，必须事件 cross-check

### 落地（3 commits）

- `d93d2f533` events cross-check + startup grace（patch fix）
- `2797fb761` "更新"按钮真继承（DTO inheritFromMissionId + S2 跳 LLM）
- `dd5e91278` **harness 归一**：4 detector → 单一 `MissionLivenessGuard`

### 归一前 4 detector（2 已废 2 在用，互不感知）

1. ai-app: `MissionStore.recoverOrphanedRunning(240min)` ✅ enabled
2. ai-app: `MissionStore.recoverPodCrashedRunning(300s)` ✅ enabled (误杀根因)
3. ai-app: `MissionHealthScheduler` ❌ DISABLED
4. ai-harness: `MissionOrphanDetectorService` (Redis) ❌ DISABLED

### 归一后单一服务

**`ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts`**

- 单一 60s scan timer（多 namespace 共用）
- 多信号：heartbeat AND events 双 stale 才杀（避免单信号失败误杀）
- 三阶梯：startup-grace 5min / soft-warn 10min / hard-kill 5min / wall-time-cap 4h
- Adapter 注入：fetchRunningMissions + getMostRecentEventTs + markFailed + emitWarning
- 8 不变量 (I1-I8) + 21 unit tests + 1402/1402 全套绿

### 接入 playground

`agent-playground.module.ts onModuleInit`:

```ts
this.livenessGuard.registerAdapter('agent-playground', {
  fetchRunningMissions: ...,  // prisma.agentPlaygroundMission.findMany
  getMostRecentEventTs: ...,  // prisma.agentPlaygroundMissionEvent.groupBy
  markFailed: ...,             // store.markFailed + eventBus.emit mission:failed
  emitWarning: ...,            // eventBus.emit mission:warning
}, config);
```

删除：

- `MissionStore.recoverOrphanedRunning` + `recoverPodCrashedRunning` 方法
- `MissionHealthScheduler` 文件 + spec
- 6 个 store spec test cases（迁到 harness guard spec）

保留：

- `MissionStore.refreshHeartbeat` + `markStageComplete`（写路径，正确）
- `MissionOrphanDetectorService`（DI 实例，但不再 callback 注入；下一轮可删）

### 后续扩展点

- emitWarning per-mission dedup（guard 内 lastWarnedAt Map）
- writing/research/topic-insights 各自接入同 guard（namespace 隔离）
- Resume from checkpoint (PR-H v2)：dispatcher 读 checkpoint + initialStageOutputs

### How to apply

- 任何新 ai-app 加 mission 概念 → 直接 `livenessGuard.registerAdapter('namespace', ...)`，不要重新实现 detector
- 阈值要调整 → 在 registerAdapter 第三个参数 config override，不要碰 guard 内部
- adapter 抛错 → guard 内 catch 不影响主流程，但应在 adapter 内自己 log warn
- 不变量 I1-I8 是底线，加新功能必须保证不破坏

### Why

单一权威服务消除"4 个 detector 互相误杀 + 用户被无差别杀 mission"的系统性 bug；
adapter 模式让其他 ai-app 接入只需 30 行代码，避免每个 app 重复实现 detector
导致同样的 false-positive 螺旋。
