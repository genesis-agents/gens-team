---
name: 2026-05-06 mission detail 全炸 + contract drift 看护四件套
description: 同日 prod 大故障 + 修复 + 看护机制；后续相关问题先看这里
type: project
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

**事件**：2026-05-06 上午 prod gens.team/agent-playground/team/[id] 全部 mission
详情页打开就 ErrorBoundary 炸；前端 `TypeError: e.slice is not a function`。

**真因**：8de5d02b0 commit (我自己 4 天前) 加的 `leader:goals-set` event handler
里 `(p.initialRisks as string[]).map(s => s.slice(0, 50))`。但 backend 实际
emit 的 `initialRisks` 是 `[{type, severity, mitigation}, ...]` object 数组。
所有走完 S2 的 mission 详情页一打开就炸（含新建/重跑）。

**修复**（commit 60ce3da78 + f0609c70a + 919d4a4cb + 3ab63f88d，4 个 commit 在
本地待 push）：

1. 修 initialRisks 当前 bug（防御性 normalization）
2. 同类清零：扫 frontend playground 全部 lying assertion，6 处全改
3. mission-detail ErrorBoundary（`app/agent-playground/team/[missionId]/error.tsx`），
   不再让全局 global-error 兜底；POST /api/v1/agent-playground/error-report
   上报 Railway stderr
4. fixture-based regression spec（4 prod mission 真实事件流，21/21 spec pass）
5. events.ts zod payload schema PoC（8 高风险事件）+ DomainEventBus.emit() 自动
   safeParse（STRICT_DOMAIN_EVENT_VALIDATION=true throw）
6. lint `no-restricted-syntax` 拦 `as <PrimitiveArray>` 断言
7. 三份硬编码价格表清零，单一源 ModelPricingRegistry（DB ai_models 表 hydrate）
8. ai_models 表加 capability matrix（structured_output_strategy +
   fallback_strategies）+ migration 已应用 prod
9. StructuredOutputRouter + 8 adapter（OpenAI strict / Anthropic tool_use /
   Gemini responseSchema / GBNF / prompt 等），未配置自动按 provider slug 推断

**Why:** 这次故障暴露的 5 大反模式都已机制化拦截。

**How to apply:** 后续任何 contract drift / lying assertion / hardcoded
pricing 类问题：

- 先看 frontend/**tests**/**fixtures**/playground/ 是否能跑 fixture 复现
- 任何新事件加 zod schema 到 agent-playground.event-schemas.ts
- 任何新模型走 ModelPricingRegistry，不写硬编码
- 任何新 LLM 调用走 StructuredOutputRouter（敦促 admin 配 capability 字段）
