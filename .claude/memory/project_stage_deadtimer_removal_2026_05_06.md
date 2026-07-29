---
name: 2026-05-06 平台层删除 stage 死秒表 + 统一活动信号源
description: stage timeout 从死秒表改为只看 inactivity（mission level liveness）；4 层 timeout 简化到 3 个统一机制
type: project
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

**整改背景**：用户在 prod 看到 mission S3 dim 6 个并行在跑（每秒 emit
cost:tick / agent:thought / dimension:research:\* 等），但 stage 死秒表
10min 到时强杀 — 完全不感知子事件流。

**真因**：`mission-pipeline-orchestrator.service.ts:282` 的 `withTimeout(
runPromise, timeoutMs, stepId)` 是死 setTimeout 抛 StageAbortError，跟
mission liveness guard 各干各的，不联动。

**整改方案（commit `eb6d18bc6`）**：

1. **删 stage 死秒表**：orchestrator runStep 直接 `await primitive.run(...)`，
   stage 跑到完成或 primitive 主动 throw（如 LLM HTTP timeout）才退出
2. **stallTimer 保留为可见性**：`timeoutMs * 1.5 / 默认 15min` 后 emit
   `stage:stalled` warning，**不杀**
3. **真死活由 4 个边界守护**（统一 + 简化 + 联动）：
   - L1 HTTP timeout（LLM 单次调用 120s/300s 按 isReasoning 判）
   - L2 ~~stage 死秒表~~ → 删除
   - L3 MissionLivenessGuard（inactivity 5min，监听 DomainEventBus 事件流）
   - L4 mission-runtime-shell wallTimer（mission 总长上限默认 3h）
   - L5 budget exhausted / user cancel
4. **统一信号源**：DomainEventBus 该 missionId 事件流（同时驱动 liveness +
   stallTimer + mission heartbeat），stage 内 cost:tick / agent:thought 等
   emit → 自动刷新 → 不会被误杀

**反向证据 spec**（防回归）：`pipeline.spec.ts` 加：

- "step.timeoutMs 不再杀 stage（平台层取消死秒表）" — 旧机制 30ms 杀，
  新机制 stage 跑完 200ms 仍 completed
- "stage 配 timeoutMs=10ms 但运行 200ms → 不再被死秒表杀（只触发 stage:stalled 警告）"
- "stage 内部 primitive 主动抛错 → 平台层不吞，stage:failed → mission:failed"

21/21 pipeline spec 全过 + 91/91 architecture spec 全过。

**How to apply:**

- 任何想加 stage 级 timeout 的 PR 必须先看这条 memory + 反向证据 spec
- 真死活在 mission level 兜底，stage 不要重新引入死秒表
- 各 ai-app 不要在自己的 config 里加 timeoutMs（数值仅供 stallVisibilityMs warning，不是 abort）
