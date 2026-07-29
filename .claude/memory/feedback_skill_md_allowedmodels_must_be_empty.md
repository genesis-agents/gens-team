---
name: feedback-skill-md-allowedmodels-must-be-empty
description: "SKILL.md frontmatter `allowedModels` 必须 [] 空数组，禁止硬编码 claude-sonnet-4-6 / claude-haiku 等模型名 —— 模型选择走 ChatFacade + TaskProfile + ModelPricingRegistry 自动决定"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ca6e8346-b1b3-4b70-92d3-8a333f6e80a3
---

**Rule**: 任何 SKILL.md（agents/{role}/SKILL.md）的 frontmatter `allowedModels` 永远是 `[]` 空数组，不写具体模型名。

**Why**:

- CLAUDE.md 红线："LLM 模型名硬编码规则 — 任何 fallback/default 场景，永远用 `""` 空字符串/空数组，不用具体模型名"
- 模型选择必须走下游 `ChatFacade.chat() + TaskProfile (creativity/outputLength) + ModelPricingRegistry`
- 硬编码模型名 = 用户切换 BYOK / 模型版本更新时炸；CTO 看到当场翻脸（"造反啊，谁让你说这个模型的"，2026-05-16 实测）
- 即使 playground.SKILL.md 已经写了 `allowedModels: ["claude-sonnet-4-6"]` 也是历史包袱，新模块不跟错

**How to apply**:

- 写 SKILL.md frontmatter 时只写 `allowedModels: []`（保持字段存在便于 parser 显式断言）
- 不在 prompt body 里硬编码 "你要用 sonnet" / "调 haiku 模型"
- 新 SKILL.md spec 必须断言 `expect(skill.frontmatter.allowedModels).toEqual([])`（W4-PR1 已建例：`__tests__/skill-md-skeleton.spec.ts`）
- 看到 ai-app 模块 PR 含硬编码模型名直接拦

**相关教训链路**：

- [[feedback_no_hardcoded_pricing]] — 禁硬编码价格表
- [[feedback_no_hardcoded_provider_metadata]] — 禁硬编码 provider endpoint
- [[feedback_unified_byok_single_function]] — BYOK 选模型必须单一函数 `AiModelConfigService.pickBYOKModelForUser`
