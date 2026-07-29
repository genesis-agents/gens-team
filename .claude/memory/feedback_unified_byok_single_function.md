---
name: feedback-unified-byok-single-function
description: BYOK 选模型必须单源——一个函数（AiModelConfigService.pickBYOKModelForUser），所有 AI 入口（chat/embedding/image/rerank/evaluator）都调它，不允许在 service 内重复 BYOK 选择逻辑
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6f88d14d-3d90-467a-b940-ff29c27662ce
---

## 用户底线（强烈表达，反复多轮）

**"所有的 AI 使用，都是 BYOK"** + **"马上整改，确保整个系统一致实现，单源实现"**

含义：

1. 项目里"选哪个 AI 模型"的逻辑**只能有一个函数**
2. 所有 AI 入口（chat/embedding/image/rerank/evaluator/TTS/...）都调这一个函数
3. 不允许 service A 自己读 UserApiKey、service B 自己读 UserModelConfig、service C 走 admin AIModel 这种**双源/多源/绕过**
4. 不允许污染通用接口（例如把 embedding-only 字段塞进 AIModelConfig 给所有模型类型用）

## 反模式（必避免）

### 反模式 1：service 内手写"我自己的 BYOK 选择逻辑"

```ts
// 反例（embedding service 自己读 UserApiKey）
private async pickEmbeddingModelForUser(userId: string) {
  const userKeys = await this.prisma.userApiKey.findMany({...});
  // ...
}
```

→ 真源 `UserModelConfig` 被绕开，多源数据漂移

### 反模式 2：污染通用接口加 type-specific 字段

```ts
// 反例（chat / image 等也都要带 embeddingDimensions: null，无意义）
interface AIModelConfig {
  ...
  embeddingDimensions?: number | null;  // ★ 污染
  maxInputTokens?: number | null;       // ★ 污染
}
```

→ 用户当场骂"傻逼改法"

### 反模式 3：caller 直接查 admin AIModel 绕过 BYOK 函数

```ts
// 反例
const model = await prisma.aIModel.findFirst({
  where: { modelType: "CHAT", isDefault: true },
});
```

→ 用户在 BYOK 配的偏好被直接忽略

## 正确模式

**Why**：2026-05-12 embedding 事故反复 3 轮才修对——

1. 先错读 UserApiKey.preferredModelId（不是真源）
2. 修了又掉到 admin isDefault fallback 坑
3. 又试图污染 AIModelConfig 接口被骂
   最后才落到正确架构：**单函数 `pickBYOKModelForUser`，所有入口共享**。

**How to apply**——任何新增 AI 入口（chat/embedding/image/rerank/audio/...）：

### 1. 选模型只准走 `AiModelConfigService.pickBYOKModelForUser(modelType, userId?)`

返回原始 DB 行字段（modelId / provider / apiEndpoint / apiFormat / embeddingDimensions / maxInputTokens / maxTokens / temperature / capability matrix / secretKey 等），caller 按需构造自己的 ModelConfig 形状（chat 用 AIModelConfig，embedding 用 EmbeddingModelConfig 等）。

顺序：

- PERSONAL → UserModelConfig（用户自己配的 BYOK）
- ASSIGNED → KeyAssignment（用户向 admin 申请的，仍属 BYOK）
- 都没 → null（caller throw 引导去 BYOK 配置页）
- 无 userId（background）→ admin AIModel 兜底（**仅此一例**）

### 2. service 内**不写**自己的 BYOK 选择逻辑

如果你发现你在 service 里写 `userApiKey.findMany` / `userModelConfig.findMany` / `aIModel.findFirst({isDefault})`——立即停手，删掉，调 `pickBYOKModelForUser`。

### 3. 不污染通用接口

EMBEDDING 专属字段（embeddingDimensions、maxInputTokens）**不塞进 AIModelConfig**。`pickBYOKModelForUser` 返回值是 type-specific 但**单一函数**，不是单一类型。caller 自己挑用得到的字段构造自己的 ModelConfig 形状。

### 4. caller 切忌绕过

下游 service / adapter 都不许 `prisma.aIModel.findFirst({modelType, isDefault: true})`。要么走 `pickBYOKModelForUser`，要么走 `getDefaultModelByType` / `getAllEnabledModelsByType`（这两也内部调 pickBYOKModelForUser 类似逻辑）。

### 5. 单源验证清单（PR 自查）

- [ ] grep `aIModel.findFirst` / `aIModel.findMany` 全仓，新增 caller 全部走 pickBYOKModelForUser 或 getDefaultModelByType
- [ ] grep service 内 `userApiKey.findMany` / `userModelConfig.findMany`——只准 AiModelConfigService 里出现，其他位置全部 ❌
- [ ] 接口字段：embedding/image 专属字段绝不进通用 AIModelConfig

## 项目当前覆盖（2026-05-12 PR-1/PR-2/PR-3 收尾）

- ✅ EmbeddingService：走 `pickBYOKModelForUser('EMBEDDING')`
- ✅ AiChatService：选模型走 `findUserDefaultByType` + `getDefaultModelByType` + `availableProviders` 过滤（语义等价 pickBYOKModelForUser，加 retry-blacklist 特化）；选 KEY 走 `keyResolver.resolveKey`（PERSONAL → ASSIGNED → throw）
- ✅ UniversalLLMAdapter：走 `pickBYOKModelForUser('CHAT')`
- ✅ ModelFallbackService：用户上下文严格 UserModelConfig，background 走 admin
- ✅ ReportEvaluationService：走 `chatFacade.getDefaultModelByType(EVALUATOR)` → AiChatService BYOK
- ✅ ImageGenerationService：`getApiKeyForModel(model, userId?)` 走 KeyResolver（PR-2 commit `ed535948d`）
- ✅ FunctionCallingLLMAdapter (AI Teams)：`resolveApiKeyForProvider` 走 KeyResolver（PR-1 commit `57d757ead`）
- ✅ RERANK / EVALUATOR：原 BYOK_OPTIONAL_TYPES 软回退已删，与其他类型同等严格

## 与 2026-05-12 P2 审视报告判定的纠正

P2 子代理曾把 AiChatService 主路径 + ImageGeneration + FunctionCalling 判为 ❌ 绕过单一函数。事实：

- **FunctionCalling / ImageGen 确属真旁路**——PR-1 / PR-2 已修
- **AiChatService 主路径不属于旁路**——`findUserDefaultByType` 是 UserModelConfig PERSONAL 优先；`availableProviders` 过滤保证回退到 admin 时还走用户有 Key 的 provider；选 KEY 经 keyResolver。语义等价 pickBYOKModelForUser，只是函数名不同。强 refactor 风险大于收益。

## 友邻

与 [[feedback_strict_byok_model_and_key]]、[[feedback_no_dual_sources]] 同源——都属"用户配的偏好必须落地 + 不允许双源"。
