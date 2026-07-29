---
name: Playground / Mission Pipeline 时间边界 — 4 层守护机制
description: HTTP / Liveness / Wall / Budget 4 个 timeout 边界的关系；stage 不再有死秒表
type: reference
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

**整改后（2026-05-06 eb6d18bc6 commit）**：

| 层  | 名字                          | 阈值                                                                                    | 信号源                                         | 触发动作                              |
| --- | ----------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- |
| L1  | HTTP timeout                  | 120s 普通 / 300s reasoning（按 model.isReasoning，admin model.defaultTimeoutMs 可覆盖） | LLM 单次调用                                   | abort axios request → primitive throw |
| L2  | Mission inactivity (Liveness) | 默认 5min                                                                               | DomainEventBus 该 missionId 事件流 + heartbeat | markFailed(mission_unresponsive)      |
| L3  | Mission wall timeout          | 默认 3h（user 可在 RunMissionInput.wallTimeMs 覆盖）                                    | mission-runtime-shell setTimeout               | abort + emit budget-warning-hard      |
| L4  | Budget exhausted              | maxCredits / costUsd                                                                    | tickCost 轮询                                  | abort + emit budget:exhausted         |
| -   | User cancel                   | 显式 abortRegistry.abort                                                                | controller cancel endpoint                     | mission:cancelled                     |

**stage 级别没有 timeout 守护**（重要）：

- mission-pipeline-orchestrator runStep 不再 race timeout
- stage 配置的 timeoutMs 仅作 `stage:stalled` 警告阈值（× 1.5 后 emit），不杀
- stage 真死靠 L2/L3 兜底

**stallVisibilityMs（警告，不杀）**：

- step.timeoutMs \* 1.5（缺省 15min）
- emit `stage:stalled` 让 UI 显示警告但 mission 继续跑

**关键文件**：

- `backend/src/modules/ai-harness/teams/orchestrator/pipeline/mission-pipeline-orchestrator.service.ts` — 平台层 runStep
- `backend/src/modules/ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts` — L2 inactivity
- `backend/src/modules/ai-app/agent-playground/services/mission/workflow/mission-runtime-shell.service.ts` — L3 wallTimer + L4 budget
- `backend/src/modules/ai-engine/llm/services/ai-chat.service.ts:753` — L1 HTTP

**spec**：

- `backend/src/modules/ai-harness/teams/orchestrator/pipeline/__tests__/pipeline.spec.ts` 21/21（含 3 个反向证据：stage 死秒表已删除）
- `backend/src/__tests__/architecture/playground-event-contract.spec.ts` 4/4（contract drift 强制 spec）
