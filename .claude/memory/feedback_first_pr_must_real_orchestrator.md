---
name: feedback_first_pr_must_real_orchestrator
description: '新模块对齐 Agent Team 形态时第一版就必须接 MissionPipelineOrchestrator + RuntimeShellFramework + Gateway + EventRegistry，"占位 sequential 版本"会被多路评审一致 NO'
metadata:
  node_type: memory
  type: feedback
  originSessionId: ca6e8346-b1b3-4b70-92d3-8a333f6e80a3
---

# 新模块 Agent Team 化禁用占位 sequential

新建/重构 ai-app 模块为 Agent Team 形态时（mirror agent-playground），**第一版交付**就必须接齐 5 件套，不允许"v1 sequential 占位、v2 切 orchestrator"分两 PR：

1. `defineMissionPipeline` + `MissionPipelineRegistry.register` 在 onModuleInit
2. `MissionPipelineOrchestrator.run({ pipelineId, signal, onEvent })` 真驱动（不允许 `await runXxxStage()` 顺序自写）
3. `MissionRuntimeShellFramework.openSession` 拿真 `BillingRuntimeEnvAdapter` + `MissionBudgetPool`（不允许 `{} as Type` 占位）
4. `DomainEventRegistry.registerAll(MODULE_EVENTS)` + `DomainEventBus.registerAdapter(buffer)` 在 onModuleInit
5. `@WebSocketGateway` + `SocketBroadcastAdapter` + JWT auth + ownership check

**Why**：上次 ai-social W4 PR-4 用了 v1 sequential dispatcher + 空 billing/pool 占位，5 路评审 round-1 直接 3 路 NO + 10 P0 + 7 P1。整个 round-2 重写 13 文件 / +1516 行才挽回（commit `40b564728`）。用户原话："不接受其他方案，不要自己重复造轮子"。占位本质就是造轮子，永远会被复审撞回。

**How to apply**：

- 任何"我先写 sequential runner，下个 PR 切 orchestrator"的设想立刻否决
- 参照样板 `agent-playground/playground-pipeline-dispatcher.service.ts` + `playground-business-orchestrator.service.ts` + `playground.config.ts` + `agent-playground.events.ts` + `agent-playground.gateway.ts`
- 简单 mission（无 cascade rerun / 无 inherited plan）所有 step 用 `primitive: "persist"`，hook 形态 `{ persist: async ({ ctx }) => ... }` 最薄
- 必须有 `business-orchestrator.bindSessionLookup(missionId => entry)`，hook 闭包通过 lookup 拿 SessionEntry
- abort signal 在 hook 入口必须 `if (args.ctx.signal?.aborted) throw new StageAbortError(stepId, ...)` —— 这是 abort 唯一可观察路径

Links: [[feedback_consensus_must_iterate_to_all_yes]] · [[feedback_no_dual_sources]] · [[feedback_implementation_rounds_need_review_too]]
