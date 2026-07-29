---
name: EventJournal FK 23503 prod 日志洪水 2026-05-11
description: prod 每分钟数十条 [PrismaService] ERROR `process_events_process_id_fkey` 真因 + 9c123fa5c 热修 + 后续根因清理 TODO
type: project
originSessionId: b949ea5a-fac4-41e1-9876-2bd78c4ce5c5
---

prod 日志洪水：`Raw query failed. Code: 23503. Message: insert or update on table "process_events" violates foreign key constraint "process_events_process_id_fkey"`，连续多分钟每秒数条 ERROR 级。

**Why（链路）**：

1. 多条 L3 链路用 `KernelContext.run({ processId: missionId / sessionId, ... })`，例如：
   - `ai-harness/teams/business-team/lifecycle/mission-runtime-shell.framework.ts:174` `processId: session.missionId`
   - `ai-app/research/project/research-project-chat.service.ts:119` `processId: kernelProcessId`（实际为 sessionId）
   - `ai-app/teams/services/ai/ai-response.service.ts:1348` 同上
   - `ai-app/planning/services/planning-orchestrator.service.ts:655`
   - `ai-app/research/discussion/discussion-research.service.ts:106`
   - `ai-app/topic-insights/services/core/topic/topic-team-orchestrator.service.ts:169`
   - `ai-app/writing/services/mission/writing-mission-lifecycle.service.ts:190`
   - 其他至少 8 处
2. `ai-engine/llm/services/ai-chat.service.ts:1436` 读 `KernelContext.getProcessId()` 当作真 processId
3. 调用 `emitJournalRecord(processId, "LLM_CALL", ...)` 走 `llm.journal.record` 事件
4. `ai-harness/tracing/observability/llm-events.listener.ts:97` 转发到 `EventJournalService.record`
5. `event-journal.service.ts` 之前 `INSERT INTO process_events VALUES (...)` 直发，FK `process_events.process_id → agent_processes.id`，missionId 不在父表 → Postgres 抛 23503，`PrismaService` 在 ERROR 级别打日志

**Why（设计层面）**：
`KernelContext.processId` 字段本意是 AgentProcess.id（FK-bound 的 process），但很多 ai-app 借用这个槽位传 mission/session id 给下游 tracker / billing / diversity。`KernelContextData` 有独立的 `missionId` 槽（`MissionElectionTracker` 用 `KernelContext.get()?.missionId` 读），但调用方习惯把同一个值 双写两个槽。

**How to apply**：

**热修（已 push commit `9c123fa5c`）**：

- 把 INSERT 改成 `INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM agent_processes WHERE id = $1)` —— 父表不存在时 0 行写入，零 SQL 异常
- caller 拿到 `id: 'skipped-no-parent'` 占位（与 tableReady=false 同模式）
- 行为差异：仅停止 ERROR 日志洪水；之前那些 INSERT 本来也都失败了，没人依赖

**根因清理（已落地 commit `edb5e84e5`，2026-05-11）**：

1. ✓ `KernelContextData.processId` 改名 `agentProcessId`（+ 强 JSDoc：MUST 来自 MissionExecutor.execute / ProcessManager.spawn；非 kernel-managed 留空）
2. ✓ `KernelContextStore.getProcessId()` → `getAgentProcessId()`
3. ✓ 修复 4 个滥用点：
   - `ai-harness/teams/business-team/.../mission-runtime-shell.framework.ts`（agent-playground/topic-insights mission 都过这条 — 实际 prod 触发点）
   - `ai-app/agent-playground/.../stage-rerun.dispatcher.ts`（cascade rerun）
   - `ai-app/topic-insights/.../mission-execution.service.ts`（旧 sentinel `processId: ""` workaround，删）
   - `ai-app/topic-insights/.../topic-team-orchestrator.service.ts`（同）
4. ✓ 13 个正确 caller 改名（image / office / planning / research × 3 / simulation / social / teams × 3 / writing —— 都是 missionExecutor.execute 拿真 processId 后透传）
5. ✓ 2 个读取方更新（ai-chat.service / agent-orchestrator / llm-executor）
6. ✓ 新增 `kernel-context.spec.ts` 5 测试锁死契约：agentProcessId optional / missionId 是 catch-all / getter undefined when not set
7. ✓ 4 处 spec mock 同步更名

**WHERE EXISTS SQL 守护（commit `9c123fa5c`）保留**：作为 defense-in-depth — 万一未来 caller 再回归，journal 静默 no-op 而不是日志洪水。

**为什么"chat({ processId })" option 不一并改名**：option 是显式参数（caller 必须主动传字段名），不是隐式 ALS 槽位。所有 chat option callers 已审计为传真 AgentProcess id（写作执行器全部正确）。option 名保持为 `processId` 减少 touch 面（25+ 文件）；JSDoc 已强化契约。

**踩坑教训沉淀**：

- 1 个 AsyncLocalStorage 字段被多语义复用是反模式；命名 = 契约，`processId` 不该承载 mission/session
- prod 日志被 [PrismaService] 自身的 logger 喷射 ERROR 时，应用层 try/catch + debug 降级根本盖不住 —— 必须从 SQL 层（IF EXISTS / WHERE EXISTS）阻止异常发生
