---
name: 单轨化/重命名事件时必须 grep frontend consumer
description: backend 删 emit 事件 / 重命名 type 时必须扫前端 derive/handler 是否还在监听；spec 已自动化但要主动跑
type: feedback
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

backend 单轨化（A-2 commit 0996e8672）删了 stage:started/completed emit，
保留 stage:lifecycle 唯一信号。但 frontend `derive.ts` 还在监听 stage:started/
stage:completed → mission detail 页 stage 状态永远 pending → 用户必须刷新。

**Why:** 2026-05-06 真发生过 — typecheck 全绿、spec 全绿、fixture 全绿，
prod 用户看到"Leader 还没拆分维度"卡死。低级错。

**How to apply:**

- backend 单轨化 / 重命名 / 删除事件类型时，**强制做 3 件事**：
  1. `grep -r "agent-playground.{event}" frontend/lib frontend/components frontend/app frontend/hooks` 找所有 listener
  2. 如果 listener 还在，要么删 listener 要么补 backend emit；不能留 dead listener
  3. 跑 `playground-event-contract.spec.ts`（已自动化扫这种）
- spec 已经在 `backend/src/__tests__/architecture/playground-event-contract.spec.ts` 自动检测：
  - frontend listened ⊆ backend AGENT_PLAYGROUND_EVENTS
  - backend AGENT_PLAYGROUND_EVENTS 每个至少有一处 emit
  - backend 实际 emit 的 type ⊆ AGENT_PLAYGROUND_EVENTS
- pre-push hook 跑全栈 spec 时会拦下，但写代码当下要先自检
