---
name: feedback-strict-byok-model-and-key
description: 'BYOK 政策"统一使用 BYOK，绝不用系统 KEY"——配 BYOK 必须同时决定 MODEL 与 KEY，所有用户 LLM/Embedding 入口严格 BYOK 不软回退'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6f88d14d-3d90-467a-b940-ff29c27662ce
---

## 用户的 BYOK 政策（强力表态）

**"AI 模型统一使用 BYOK，除非用户向管理员申请，怎么还在使用系统的 KEY"**

含义（不能误读）：

1. 所有用户上下文的 AI 调用（embedding / chat / rerank / image）**都必须走用户 BYOK**
2. 用户没配 BYOK → 报错引导去 BYOK 页面，**绝不软回退系统 secret**
3. 例外只有：用户向管理员申请 → `KeyAssignment` 授权路径（ASSIGNED，也算 BYOK 一种）
4. 配了 BYOK 必须**同时决定 model + key**——不是只换 key 还用 admin 默认 model（反直觉）
5. 配置变更**立即生效**，不等任何 cache TTL

## 反模式（必避免）

每个 AI 调用入口（EmbeddingService / AiChatService / RerankerService / ImageService 等）**自己写 SYSTEM Secret fallback**：

```ts
// 反模式 - 静默用系统 key
if (model && userId && this.keyResolver) {
  try { ... use BYOK ... }
  catch (NoAvailableKeyError) {
    this.logger.warn("user has no BYOK, falling back to system");
    // 用 secretsService.getValueInternal(model.secretKey) — ★ 这就是漏洞
  }
}
```

或**模型选择由 admin.isDefault 主导**：

```ts
// 反模式 - 用户配了 google 但还选 voyage
const model = await prisma.aIModel.findFirst({
  where: { modelType: "EMBEDDING" },
  orderBy: { isDefault: "desc" },
});
const key = await keyResolver.resolveKey(userId, model.provider);
// 用户配的是 google，model.provider 是 openai → resolveKey 找 openai BYOK
// → 用户没 openai BYOK → 软回退系统 key（双重违反）
```

## 正确模式

**Why**：2026-05-12 用户报 "我配了 Google gemini-embedding-001 BYOK，为什么还在用 voyage-4-lite + 系统 OpenAI key？"

**How to apply**——任何 LLM/Embedding/Rerank 入口接 BYOK 时必备四件套：

### 1. BYOK-first 模型选择

```ts
private async pickModelForUser(userId: string): Promise<AIModel | null> {
  const userKeys = await prisma.userApiKey.findMany({
    where: { userId, isActive: true, mode: 'PERSONAL' },
    select: { provider: true, preferredModelId: true },
  });
  // 1. preferredModelId 精确命中
  // 2. provider 匹配 ai_models.provider 的同 modelType（isDefault 优先）
  // 3. KeyAssignment.modelDbId 指向的同 modelType 模型（status='ACTIVE'）
  // 都不中 → null（让上层 throw）
}
```

### 2. 严格 BYOK（不软回退 SYSTEM）

```ts
if (userId) {
  const model = await this.pickModelForUser(userId);
  if (!model) throw new ServiceUnavailableException("请到 BYOK 配置页...");
  try {
    const resolved = await keyResolver.resolveKey(
      userId,
      model.provider.toLowerCase(),
    );
    // 用 resolved.apiKey ...
  } catch (NoAvailableKeyError) {
    throw new ServiceUnavailableException(
      `provider "${model.provider}" 未配 BYOK Key...`,
    );
    // 不 fallback secretsService.getValueInternal()
  }
}
// 无 userId（background cron / health check）：才允许走 SYSTEM Secret
```

### 3. 配置变更即时生效（EventEmitter）

```ts
// 写端（UserApiKeysService）：upsert / delete / withdraw 后
this.eventEmitter.emit('user-api-key.changed', { userId });

// 读端（EmbeddingService / AiChatService）：
@OnEvent('user-api-key.changed')
handleUserApiKeyChanged(p: { userId: string }) {
  this.clearConfigCacheForUser(p.userId);
}
```

### 4. KeyAssignment.status 字段不是 isActive（schema 坑）

`KeyAssignment.status = 'ACTIVE'` (KeyAssignmentStatus enum)，不是 `isActive: true`。type-check 直接 TS2353 拦下。

## 验证检查清单（PR 自查）

- [ ] 入口接受 userId 时，model 选择**不**直接 findFirst by isDefault
- [ ] catch NoAvailableKeyError 后**不**有 `secretsService.getValueInternal(model.secretKey)` 兜底
- [ ] BYOK 写入路径 emit `user-api-key.changed` 事件
- [ ] 缓存读取路径有 `@OnEvent('user-api-key.changed')` 监听器
- [ ] 用例覆盖：用户 BYOK X provider + admin default Y provider → 选 X
- [ ] 用例覆盖：用户无任何 BYOK/ASSIGNED → throw（不 SYSTEM）

## 友邻

与 [[feedback_consumer_pays_not_creator]]、[[feedback_dont_lock_users_choice_with_provider]] 同源，都属"用户配了的偏好必须落地，不被系统默认 / creator 字段抢走"。
