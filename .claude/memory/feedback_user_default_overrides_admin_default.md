---
name: feedback-user-default-overrides-admin-default
description: '用户配了某 provider 的 BYOK key 不等于"自动用那个 provider 的模型"——AiChatService.chat() 选模型时先看 UserModelConfig.isDefault=true，没设就回退 admin AIModel 全局默认，再用 availableProviders 过滤。诊断"为什么我配了 Grok 却调了 OpenAI"必看这条'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

`AiChatService.chat()` 在 `modelType: CHAT` + 无显式 `model` 参数时的选模型链：

1. `modelConfigService.findUserDefaultByType(userId, modelType)` —— UserModelConfig 里 `isDefault=true` 的行
2. 没命中 → `getDefaultModelByType(modelType)` —— admin AIModel 表的 `isDefault=true`
3. 用 `keyResolver.getAvailableProviders(userId)` 过滤 admin 默认的 provider；如果命中用户有该 provider 的 Key → 用 admin 模型 + 用户 Key（**这里是坑**）

**Why**：2026-05-12 wiki ingest debug 时发现 prod log 一条 `[gpt-5.4|personal:c5d18b0f...:openai:default]` 3 次 timeout —— **这是 user-A 的失败**，不是 admin 的：user-A 的 UserModelConfig 9 行全部 isDefault=true 指向不存在的 OpenAI modelId `gpt-5.4`，admin 也没默认 CHAT 模型。这是用户**自己手动添加**的错误 modelId，不是 admin 默认 fallback。

Prod 日志识别模式：`[callAPIWithFailover [<modelId>|personal:<userId>:<provider>:default]` —— `personal:` 前缀 = 用户 KEY；但 `<modelId>` 可能是 admin 默认的 fallback。

**How to apply**：

1. **诊断"用户说我配了 X 却调了 Y"类问题**：
   - 看 prod log 的 `personal:` 前缀（用户 key）vs `system:` / `pool:` 前缀（admin key）
   - 用户配 KEY ≠ 选模型；KEY 是 provider 级，模型选择是 modelId 级，由 UserModelConfig.isDefault 决定
   - grep `findUserDefaultByType` 看 chat 选模型的实际入口（ai-chat.service.ts:1657-1700）

2. **业务侧 onboarding 必须明确告知用户**：
   - "配了 Key" 只是给了 provider 凭证，**还要去 UserModelConfig 标某个模型为 default** 才会被自动选用
   - 否则会沿用 admin 默认（如果 admin 默认 provider 你也有 key，就被无声借走）

3. **admin 端必须保证 admin AIModel 表里的默认 modelId 是真实可调用的**：
   - 2026-05-12 prod 发现 admin 默认 = `gpt-5.4`（不存在的 OpenAI 模型）→ 所有 UserModelConfig 未设默认的用户都中招
   - 设默认前必须连真实 endpoint 验证一次

4. **后续机制改进方向**：
   - `chat()` 可以加 "若用户已配 provider X 的 KEY，强制只从用户有 KEY 的 provider 的模型里选 admin 默认"，而不是仅 availableProviders 过滤后续 fallback
   - 或加 warning：admin 默认 modelId 在 OpenAI /v1/models 不存在时 startup 阶段告警

链接：[[feedback-byok-must-check-layers-above-chat]] [[feedback-dont-lock-users-choice-with-provider]] [[project-wiki-v2-rebuild-2026-05-12]]
