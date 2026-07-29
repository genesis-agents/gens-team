---
name: project-agent-tool-loop-api
description: ai-app 要 LLM 工具循环(ReAct)用 ToolFacade.chatWithToolsStream，不是 executeAgent（单次 LLM 无循环）
metadata:
  type: project
---

ai-app 要「LLM 理解意图 → 自主选工具 → 多轮执行 → 回应」的 agent 工具循环时：

- ✅ 用 **`ToolFacade.chatWithToolsStream()`**（在 `@/modules/ai-harness/facade` re-export；内部 = `FunctionCallingExecutor.executeWithContext`，产 `AsyncGenerator<AgentEvent>`，有 maxIterations/maxToolCalls 断路器）。AI Ask 已用此路径。入参 `{ systemPrompt, userPrompt, context: AICapabilityContext, modelConfig }`。
- ❌ **不要用 `executeAgent()`** —— 实测它 = `AgentExecutorService.executeTask` = **单次 LLM 调用，无 ReAct 循环、无 `tools` 入参、非流式**，唯一"工具"是硬编码 web-search 预增强。照它写会得到「能聊天但永远不调工具、库纹丝不动」。
- 工具按 **`AICapabilityContext`（teamId/userId/roleId/domain）经 `AICapabilityResolver` 解析**，**没有「按次传工具子集」入参** —— 想只给某 agent 一批工具，靠专用 roleId/domain + resolver role 过滤。
- `chatWithToolsStream` 只吃 systemPrompt+userPrompt，**无 conversationHistory 注入槽**（多轮要自己拼进 prompt 或扩 facade 薄方法）；不走 `chat()` 的自动计费，需显式 modelConfig + 事后按 `AgentEvent.complete.tokensUsed` 扣费。
- `ToolFacade` / `AiChatService` / `ITool` / `ToolRegistry` / `ToolContext` / `AgentEvent` / `AICapabilityContext` 全在 **单一 `@/modules/ai-harness/facade`** re-export（ai-app 一个入口即可，别同时引 engine+harness 两个 facade）。

来源：2026-05-21 对话整理(#1) 设计四路评审，架构线核源码纠正了 ADR-006 的 executeAgent 认错（[评审纪要](../../../docs/features/2026-05-21-design-review-minutes.md) BLK-1）。关联 [[project-design-baselines-organize-and-teams]]。
