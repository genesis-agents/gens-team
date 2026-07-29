---
name: feedback_fk_storm_circuit_breaker
description: 任何 fire-and-forget worker (saveX/heartbeat/upsert) 在 catch 里识别 P2003/P2025 必须主动 abortRegistry，不能只 log warn 让风暴持续
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

子表 upsert / 父表 update 在 prod 出现 Prisma P2003（FK violated）/ P2025（record
not found for update）时，不能仅 catch+log.warn 让 orchestrator/heartbeat 继续跑。
继续跑会持续打日志风暴（12 dim × N retry × 30s heartbeat），用户能直观看到"还在
持续打印"。

**Why**：mission ff8f257a-1f0c-4539-a55c-f981f74e5db7 prod 事故（2026-05-12）。
mission row 在 DB 中被删（旧版本 DELETE controller 不挡 running 状态），但
in-memory orchestrator/dispatcher 还在跑，每 dim saveResearchResult.upsert 撞
FK 风暴 + 30s heartbeat.update P2025。fix（commit b83b152f6）：识别错误码 →
abortRegistry.abort(missionId, "mission_row_missing") → orchestrator
signal.aborted=true → 现有 dispatcher 检测 signal.aborted 自然退出。

**How to apply**：

- 任何 fire-and-forget worker / setInterval 写 DB 时，catch 块识别两个错误码：
  - P2003 (FK violated) = 父行已删
  - P2025 (record not found for update) = 行已删
- 命中即调 abortRegistry.abort(id, "row_missing") 让运行中循环退出
- 用 Set 去重（同 mission 只 abort 一次），不要每 retry / heartbeat 都广播
- abortRegistry 走 @Optional 注入保兼容性
- 对应 `b83b152f6` mission-store.service.ts isMissionRowMissing /
  emergencyAbortOnMissingRow 模板

关联：[[feedback_eventbus_not_buffer_directly]] [[project_stage_emit_missing_2026_05_06]]
