---
name: 2026-05-06 LLM provider capability matrix + structured output adapter framework
description: 商用+本地全覆盖的 structured output 路由架构；写 LLM 调用前先看这里
type: project
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

**ai_models 表新增 capability 字段**（migration 20260506_llm_capability_matrix
已应用 prod）：

- `structured_output_strategy`: 'json_schema_strict' | 'json_schema' | 'tool_use'
  | 'json_mode' | 'gemini_response_schema' | 'gbnf_grammar' | 'prompt' | 'none'
- `fallback_strategies` (text[])
- `supports_json_schema_strict / json_schema / tool_use / json_mode /
gbnf_grammar` (bool)

**`StructuredOutputRouter`**（`ai-engine/llm/structured-output/`）：

未配置时按 provider slug 自动推断默认 chain（不必管理员配置）：

- OpenAI / Grok: `['json_schema_strict','json_schema','json_mode','prompt']`
- Anthropic: `['tool_use','prompt']`
- Gemini: `['gemini_response_schema','json_mode','prompt']`
- DeepSeek-chat: `['json_schema','json_mode','prompt']`
- DeepSeek-reasoner: `['prompt']`（reasoner 不支持 response_format）
- Ollama / vLLM / Llama.cpp / TGI / LM Studio: `['gbnf_grammar','prompt']`
- ByteDance / Zhipu / Groq: `['json_mode','prompt']`
- OpenRouter: 二级匹配 modelId（claude → tool_use；gemini → responseSchema；
  其他 → json_schema）
- Cohere: `['prompt']`（无 response_format）

**调研报告 sub-agent 关键发现**（见此 memory + 实际代码）：

- 项目原代码 `LlmExecutor.execute()` 没传 `outputSchema` 给 `AiChatService`，
  只传 `responseFormat:"json"` → OpenAI/Grok 的 strict native 没生效
- Anthropic 当前实现走 system prompt（不可靠），应改 tool_use
- Gemini 只用了 `responseMimeType` 没用 `responseSchema`
- `zod-schema-prompt.ts` 手写 zod→JSON Schema 不支持 discriminatedUnion / refine
- 本地模型完全没适配（Ollama / vLLM / Llama.cpp）

**Why:** 用户 2026-05-06 反馈 "本地模型在 plan 阶段就报错 Zod→JSON Schema 不
完整 / 回应不符合"，要求商用+本地全覆盖。

**How to apply:**

- 写新 LLM 调用：注入 `StructuredOutputRouter`，`router.resolveChain(model)`
  拿 chain，按链尝试 adapter（首选失败走下一个）
- 加新 provider：在 `PROVIDER_DEFAULT_CHAINS` 加一行 match 规则 + 默认 chain
- 加新 strategy：在 `structured-output-strategy.types.ts` 的常量数组加项 + 写
  对应 adapter 类（实现 IStructuredOutputAdapter）+ router 注册
- spec 覆盖：`structured-output-router.service.spec.ts` 21 tests +
  `adapter-smoke.spec.ts` 21 tests，加新 provider 同步加 spec

**待办（后续 PR）**：

- 接入 LlmExecutor / AiChatService 的真实调用路径
- admin UI 加 capability 字段编辑表单
- 真 LLM provider e2e（消耗 API 配额，按需触发）
