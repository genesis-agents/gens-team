---
name: feedback-byok-must-check-layers-above-chat
description: BYOK 改造 PR 不能只盯 chat() / engine 内部；上层（harness ReAct loop / dispatcher / runtime-env）会在 chat() 之前先 inject model=admin-default，绕过 ChatService 的 BYOK 优先级
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

## 规则

**BYOK 范围审计必须自上而下覆盖所有"在 chat() 之前能塞 model 参数"的层。chat() 内部
的 BYOK 优先级（Path A findUserDefaultByType / Path B providedModel）只在没人在它
前面强行 inject `model=X` 时才生效。**

排查清单（PR-1 到最新）必查的 model 注入位点：

1. **`ai-harness/runner/loop/react-loop.ts:568`** —— `pricingRegistry.pickModelForTier(budget.currentTier)`
   走 admin BudgetAccountant downgrade 逻辑，**预设池 = admin ai_models**（cheap tier
   头部常被 seed 成 deepseek-chat）。一旦透到 chat(model=tierModelId)，Path A 直接吃
   admin provider，**跳过 findUserDefaultByType**。
2. **`ai-harness/agents/core/agent-factory.ts:139` electPreferredModelSelection** ——
   候选池 = `envSnapshot.models.CHAT ∪ REASONING`（!跨 modelType !），election 出
   一个 modelId 作为 `preferredModelId` 透给 react-loop。这是 react-loop fix
   的"上游"——`options.preferredModelId` 是 react-loop 第一优先，会击穿
   byokUserId 闸。**修法：BYOK userId 整体跳过 election，返回 modelId=undefined。**
3. **`ai-harness/agents/core/spec-based-agent.ts:289` electModelOrNull** ——
   SpecBasedAgent 自带的 election 路径，同 agent-factory 一样的问题。**修法同 #2。**
4. **`ai-engine/llm/selection/model-election.service.ts` Step 3 BYOK 过滤** ——
   原本只看"DB 里有没有 key"，遇到 quota-exhausted / dead 的 key 仍当 "provider
   可用"。election 评分 cost+role 把 deepseek-reasoner 压过 grok。**修法：用
   `keyResolver.getHealthyProviders(userId)` 替代 `getAvailableProviders`，叠
   `KeyHealthStore.filterUsable` 一层，DEAD / 长 cooldown 的 key 整体剔除。**
5. **`ai-harness/facade/model-resolver.service.ts:45` selectModel** —— 综合模型
   选择门面，所有 `chatFacade.selectModel` / `engineFacade.selectModel` 调用都
   走这。BYOK 过滤靠 caller 显式传 `availableProviders`——topic-insights / ai-harness
   evaluation / team-factory 等 5+ 处 caller 全没传 → 退化到 admin 全量。**修法：
   selectModel 内部自动从 `RequestContext.getUserId()` 解析 healthy providers，
   caller 不需要每处都传**（commit TBD）。
6. **`ai-engine/llm/selection/model-fallback.service.ts`** —— fallback chain。
7. **AI App 内 caller 显式写死的 `model: "specific-id"`** —— 历史包袱常有。
8. **Runtime env `getModelAvailability().fallbackTo`** —— 不可用时切的"同类替补"也可
   能是 admin pool。
9. **`ai-harness/facade/sub-facades/tool-exec.sub-facade.ts` chatWithToolsStream →
   `llmAdapter.setConfig({...})`**（2026-05-21，commit 9c5c140ca）—— 漏传 `userId`
   → `FunctionCallingLLMAdapter.resolveApiKeyForProvider` 无 userId → 不走 KeyResolver
   → `NoAvailableKeyError(provider)`（前端 "No API Key available for provider xai"）。
   caller（对话整理）故意传 apiKey=undefined 期望按 BYOK 解析。**修法：setConfig 补
   `userId: request.context.userId`**。凡走工具循环（chatWithToolsStream）的 ai-app 都吃这条。
10. **`FunctionCallingLLMAdapter.callAiChatServiceWithTools` 把解析好的 apiKey 显式
    传给 `aiChatService.chat`**（2026-05-21，commit 0930f9c30）—— `chat()` 见 `apiKey
&& provider` 即走 **Path B（AiDirectKeyService）**，而 Path B：① 不转发 `tools`
    （工具循环失效）；② 给 xai 无条件注入**已废弃的 Live Search `search_parameters`**
    → xAI "Live search is deprecated"。**修法：有 BYOK userId 且无显式 apiKey 时传
    `userId` 不传 apiKey，让 chat() 走 Standard 路径（callXAIAPI 转发 tools + 按 userId
    解析 BYOK，见 ai-chat.service.ts:1849-1865）。** 核心教训：**function calling 必须
    走 tools-capable 的 Standard 路径，不能走"直连 apiKey"的 Path B**。
    遗留另案：`ai-direct-key.service.ts:168` 仍给所有 xai 调用注入 search_parameters，
    其它走 Path B 的 grok BYOK 直连仍会踩。

## Why（2026-05-12 两轮事故）

### 第一轮（commit `b59ab8bc5` 修了一半）

PR-1~PR-6 BYOK 大清理改了 chat() 三层栈 + KeyResolver 严格 BYOK + 删 DistributableKey，
但 mission 仍报 `PROVIDER_API_ERROR — No API Key available for provider "deepseek"`，
即便用户 UserModelConfig 默认是 grok-4-1-fast-reasoning（xai）。

链路：

1. ReAct iter=1 走到 `react-loop.ts:568` `pickModelForTier("basic")` → admin 注册的
   `deepseek-chat`
2. `tierModelId="deepseek-chat"` 透给 `chat({ model: "deepseek-chat", userId })`
3. `ai-chat.service.ts:1631` `if (providedModel)` 分支：拿 deepseek-chat 直接 →
   `getModelConfig` → `provider="deepseek"`
4. `keyResolver.resolveKey(userId, "deepseek")` → 用户没 deepseek BYOK → `NoAvailableKeyError`
5. ReAct catch → `PROVIDER_API_ERROR — No API Key available for provider "deepseek"`

修复：`react-loop.ts:568` 加 byokUserId 闸，有 userId 时 tierModelId=null。

### 第二轮（commits TBD 彻底解决）—— "为什么还这样 / 为什么会漏掉"

第一轮 fix 推上去后，同样的错误仍然出现。这次错误是 `All 1 API key(s) for
provider "deepseek" failed. Last error: QUOTA_EXCEEDED`，意味着系统**找到**了用户
配的 deepseek key 并调用了，结果 quota 烧光报 402。

链路重建（新发现）：

1. agent 创建走 `agent-factory.ts:139 electPreferredModelSelection`
2. `buildElectionCandidates` 把 `envSnapshot.models.CHAT ∪ REASONING` 合并当候选池
   ——用户 BYOK 配过 grok（CHAT）+ deepseek-reasoner（REASONING）两类，**池子里
   同时有两个 provider 的模型**
3. `ModelElectionService.elect` Step 3 BYOK 过滤只看 `getAvailableProviders`——
   "用户 DB 里有 deepseek key" 视为可用，不知道 key 已 quota-exhausted
4. election 评分把 deepseek-reasoner（cheap + reasoning role）压过 grok（isDefault
   只 +5 分太弱）
5. `preferredModelId="deepseek-reasoner"` 透给 react-loop → `options.preferredModelId`
   是 react-loop 第一优先，**击穿** byokUserId 闸 → tierModelId="deepseek-reasoner"
6. chat({ model: "deepseek-reasoner" }) Path B providedModel → 不查
   findUserDefaultByType
7. KeyExecutor 调 deepseek API → 402 → AllKeysFailedError(QUOTA_EXCEEDED)

用户三连吐槽：

> 为什么还是不自动切换  
> 选了 grok 的都变成 deepseek 错误了  
> 疯了  
> 为什么还这样  
> 为什么会漏掉

修复（三件套）：

- `agent-factory.ts` electPreferredModelSelection：BYOK userId 整体跳过 election
- `spec-based-agent.ts` electModelOrNull：同上，对齐
- `model-election.service.ts` Step 3：`getAvailableProviders` → `getHealthyProviders`
  （新方法 in `key-resolver.service.ts`，叠 KeyHealthStore.filterUsable，剔除
  quota-exhausted / dead 的 provider）

### 元教训

我自己刚沉淀这条 memory 时只写了 react-loop 这一层（"必须自上而下查"），但**当下
排查只查了 react-loop 那一条**，没真的"自上而下"。memory 本身就是反例：写了规则不
等于按规则做。下次 BYOK PR 起手必须**机械化跑一遍下面的 grep 清单**，而不是凭印象。

## How to apply

### BYOK 类 PR 起手必做

1. `grep -rn "model:.*pickModel\|model:.*elect\|model:.*tier\|providedModel\|model:.*default"
ai-harness/ ai-app/` 列出所有"chat() 上层 model 注入位点"
2. 每个位点问三件事：
   - 是否在 `userId` 存在时还在 inject admin model？
   - 是否绕过了 `findUserDefaultByType / pickBYOKModelForUser`？
   - 是否区分了"业务 caller (有 userId)" vs "cron / 系统任务 (无 userId)"？
3. 单测：必须有 "userId 存在 → 跳过 admin pick" 和 "无 userId → 走 admin pick" 两条
   反向断言，证明分流真的有

### Reviewer checklist

看到 PR 改 BYOK 相关代码：

- 标题里有"BYOK / API Key / provider 解析"字样
- 只动了 `ai-engine/llm/services/`、`ai-infra/credentials/` 没动 harness 层 →
  **追问**："react-loop / dispatcher / runtime-env 有 model inject 位点吗，验过吗？"

### 不要踩的反模式

- ❌ "chat() 已经 findUserDefaultByType 了，上层应该不用管"——错，上层 inject 后
  chat() 走的是另一条分支
- ❌ "spec 验了 chat()，BYOK 就 OK 了"——spec 必须覆盖 caller 链路
- ❌ "preferredModelId 留着 caller 控"——caller 不传时不能 default 到 admin tier
  pick；缺省必须是"放手让 chat 走 BYOK"

## 友邻

- [[project_byok_thorough_cleanup_2026_05_12]] —— BYOK 大清理 6 PR；本条是它的元教训
- [[feedback_strict_byok_model_and_key]] —— 严格 BYOK 配 MODEL+KEY 必须同时决定
- [[feedback_unified_byok_single_function]] —— `pickBYOKModelForUser` 单源原则；
  本条相当于"单源还不够，调用方必须真用它"
- [[feedback_cache_shape_breaking_change_must_invalidate]] —— BYOK 改造常见的另一类
  破壁：cache shape 加新字段未失效
