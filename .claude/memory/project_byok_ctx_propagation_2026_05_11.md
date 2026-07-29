---
name: project-byok-ctx-propagation-2026-05-11
description: 'chat() 入口 withUserContext 兜底；修 cron 路径下用户自定义 model 误报"未在数据库中配置"'
metadata:
  node_type: memory
  type: project
  originSessionId: ce962b97-346a-4c98-ae26-9cff763089b3
---

2026-05-11 修 BYOK ctx 传播：cron / async path 调 `AiChatService.chat({ userId })`，chatLegacy 内部 userId 合并工作，但 `getModelConfig` 下游分支 `findUserModelConfigByModelId` (ai-model-config.service.ts:469) / `synthesizeConfigForUserModel` (:554) 只读 `RequestContext.getUserId()`，不接受参数透传 → 用户 UserModelConfig 里自定义的 modelId (如 `grok-4-1-fast-reasoning`) 找不到 → 误报"未在数据库中配置"。

修复 commit pending：`chat()` 入口检查 `options.userId && !RequestContext.getUserId()` → `withUserContext` 兜底包整个调用。新增 `chatRaceWrapped` 私有方法持原 race timer + hookBus 分发。

**Why:** wiki 自动 ingest cron mission 报错链：log 先 `Using user default for CHAT: grok-4-1-fast-reasoning (xai)` (chatLegacy `findUserDefaultByType` 用显式 userId 命中)，紧接 `generateChatCompletion → getModelConfig → 模型未配置`（第二次解析丢 userId）→ circuit breaker OPEN 180s。

**How to apply:**

1. 任何 `AiChatService.chat` / `AiChatService.chatStream` 的异步入口（cron / queue / EventEmitter listener）只要显式传了 `options.userId`，现在自动获得 RequestContext 兜底，不必再手动包 withUserContext。
2. 但 HTTP middleware 已设的 ctx 不被覆盖（已有 ctxUserId 直接走 chatRaceWrapped）。
3. 若新增 BYOK 相关分支也读 `RequestContext.getUserId()`（如 KeyResolver / EmbeddingService），同样依赖这个兜底——不需要每个 caller 重写。
4. 仍残留议题：kb=70dfe34e 报 `NoAvailableKeyError("")` 是 KB owner 真的 0 BYOK providers，与本修复无关；需查 DB 该 user 是否有 UserApiKey/KeyAssignment 行。
