---
name: 2026-05-06 Phase 4 — LLM router 接入 + admin capability 表单 + 防护网反向证据
description: T54-T58 一气呵成实现+验证；6 个 commit 在本地待 push；防护网失效 1 处已补
type: project
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

**6 个 commit 全在本地等 push（用户拒过两次）**：

1. `60ce3da78` mission detail bug 修（initialRisks lying assertion）
2. `919d4a4cb` pricing 三份硬编码价格表清零
3. `f0609c70a` contract drift 看护四件套（lying assertion 同类清零 / ErrorBoundary / fixture / events zod）
4. `3ab63f88d` capability matrix DB schema + StructuredOutputRouter + 8 adapter
5. `df0e5a8d9` Phase 4 router 接入 LlmExecutor + admin UI + 防护网验证 + constraint-engine 漏网修
6. `680163bfb` T57 100% 业务链分支覆盖 + protection-net regression 73+40 spec

**关键点**：

- StructuredOutputRouter **未配置自动按 provider slug 推断**（OpenAI / Anthropic / Gemini / DeepSeek / Grok / Ollama / vLLM / Llama.cpp / ByteDance / Zhipu / Groq / OpenRouter / Cohere 14 类）+ ['prompt'] 兜底
- LlmExecutor.execute() 入口 resolveOutputStrategyChain → 每次 retry 切下一个 strategy + buildStrategySystemAddon 注入 hint（最小侵入；后续 PR 推到 chat options 让 native API 真生效）
- AIModelConfig 接口 + buildModelConfig hydrate 7 个 capability 字段
- admin UI 折叠区"Structured Output Capability"含 strategy select + fallback 输入 + 5 supports checkbox

**T56 防护网反向证据 spec**（38 tests）：

- lint 拦 `as <PrimitiveArrayType>`：故意写 fixture 跑 eslint 应非 0 退出
- DomainEventBus zod：默认 log.error+return false / `STRICT_DOMAIN_EVENT_VALIDATION=true` throw
- 实测今天 mission 的 leader:goals-set object[] payload 通过 zod；改坏 initialRisks[0] 失败
- ErrorBoundary error.tsx + reportClientError endpoint 都验证存在
- 三份硬编码价格表 + cost.calculator.ts + static estimateCost 全部 0 出现

**T56 漏网之鱼**：sub-agent 报告发现 `constraint-engine.ts` 还有 `MODEL_COSTS`（cheap/balanced/premium tier）。已修：注入 ModelPricingRegistry，加 PREFERENCE_TO_TIER 映射 + getCostPerKTokens(pref) 走 registry，FALLBACK_TIER_COSTS 仅在 admin 没配任何模型时用。

**T57 113 个 spec 全过**：

- backend regression: playground-no-regression (31) + business-chain-coverage (42)
- frontend: business-chain (40)
- 历史 P0 都有 non-regression assertion（P0-A stage emit / P0-B liveness / P0-C/G/K maxCredits / P0-D trajectory / 8de5d02b initialRisks / 919d4a4cb pricing）
- 9 个 stage 异常分支：happy/failed/cancelled/quality-failed/budget exhausted/stage degraded/chapter revision/dim retry/liveness stalled

**T58 全栈 sanity**：

- backend tsc 0 错误 + jest exit 0（全过）
- frontend tsc 0 错误 + vitest 3620/3661 pass
- 41 fail 全在 hooks/domain/**tests**/useAdminAgents|Models.test.ts，是 0af823b6e 引入的 mock 路径错，pre-existing，不是 phase 4 引入

**注意点（避免再犯）**：

1. 不要用 Python 脚本直接覆写 .ts 文件 — 用 Edit 工具，否则会误截文件（这次 llm-executor.ts 被截到 341 行，git checkout HEAD 恢复后才完整）
2. lint-staged + 多 session 并行的 stash 错位风险还在 — commit 失败 retry 时要小心
3. emoji 在源码中不靠谱（mojibake）— 删除时用 git restore + 重新添加

**待办（后续 PR）**：

- StructuredOutputRouter 推到 chat() options 让 OpenAI/Anthropic/Gemini native API 真生效
- pre-existing useAdminAgents/Models test mock 路径修
- LLM provider e2e（消耗 API 配额，按需触发）
