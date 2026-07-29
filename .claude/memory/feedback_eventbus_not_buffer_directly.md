---
name: 不要直调 BroadcastAdapter，必须走 DomainEventBus
description: 业务方 emit 事件必须 eventBus.emit()，直调 buffer.broadcast() 会让 socket adapter 收不到 → 前端不实时刷新
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

业务方需要 emit 一条业务事件时，**必须调 `eventBus.emit({...})`**，不得直调具体某个 adapter 的 `broadcast({...})`。

**Why**: BroadcastAdapter（如 `MissionEventBuffer` / `SocketBroadcastAdapter`）是注册在 `DomainEventBus` 上的 listener。
直调 `someAdapter.broadcast()` 只会让那一个 adapter 收到，**其他 adapter（特别是 socket）完全收不到**。
2026-05-06 用户实证 mission 0a98acab：dispatcher 7 处直调 `missionEventBuffer.broadcast()`（stage:lifecycle / stage:stalled / stage:degraded / mission:execution-aborted / mission:postlude:started/completed/failed）→ 这些事件只入内存 buffer + DB，前端 socket 永远收不到，必须刷新页面（`/replay` 走 buffer.read 兜底）才能看到状态变化。
症状：用户感受到 "Stage 状态不自动刷新，要手动刷新"——但 chapter / dim 等"能自动刷新"的事件全是 `deps.emit` → `relay.emitEvent` → `eventBus.emit` 路径，对照之下问题路径暴露。

**How to apply**:

- 在 ai-app 业务代码里 emit playground / writing / research / topic-insights 等业务事件时，**永远** 走 `eventBus.emit()` 或封装好的 `deps.emit` / `invoker.emitEvent` / `relay.emitEvent`（这些底层都是 `eventBus.emit`）。
- 看到代码里 `xxxBuffer.broadcast({...})` 直调，立即视为 bug；buffer 只能作为 adapter **被** eventBus 调，不能 **被业务直接** 调。
- 给 BroadcastAdapter 实现类（buffer / socket / logger 等）的 `broadcast` 方法上加注释 "DO NOT call directly — use eventBus.emit() so all adapters receive"。
- 防回归 spec：注册 spy adapter 到 eventBus，断言业务 emit 后 spy 必收到（见 `playground-pipeline-dispatcher-event-bus.spec.ts`）。
- 反过来：buffer.broadcast() 可以在 `/replay` controller 里**间接**通过 buffer.read() 读，那是它的本职；emit 路径绝对不允许走它。

**修复模式**：dispatcher 加 private helper `emitToBus({type, missionId, userId, payload, timestamp})` 包装 `eventBus.emit()` 调用，业务逻辑里只调这个 helper，不直接接触 adapter。
