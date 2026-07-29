---
name: project-structured-output-root-type-none-2026-06-29
description: "discriminatedUnion 根 → zodToJsonSchema 漏 case 返回 {} 无 type → OpenAI structured-output 反复 400 烧 BYOK key"
metadata:
  node_type: memory
  type: project
  originSessionId: aaffe7ef-6e9d-4b66-8c29-31c091cfd637
---

**生产事故 2026-06-29（提交 2059b7114）**：某 reasoning 模型(gpt-5.4)的 mission 25 分钟内 474 次 `Invalid schema for response_format 'structured_output': schema must be a JSON Schema of 'type: "object"', got 'type: "None"'`，mission 卡死空烧用户 BYOK key。Railway 部署本身成功（迁移 OK、应用 started），纯运行时 bug；日志里 `FAILED: 12 个` 只是数据源状态统计，不是部署失败——别被它误导。

**根因**：Leader 类 agent 的 `outputSchema` 根是 `z.discriminatedUnion("phase", [...])`。`backend/src/modules/ai-harness/runner/executor/llm-executor.ts` 的手写 `zodToJsonSchema` **没有 ZodDiscriminatedUnion 分支** → 落到 fallback 返回 `{}`（无 type，且违背 line 159 注释"退化为 {type:object}"的承诺）→ OpenAI `response_format.json_schema.schema` 根非 object 直接 400。`llm-executor.ts:452` 把转换结果当 wire 根直接发。

**Why**：OpenAI / 兼容 provider 的 structured-output 根**必须** `type:"object"`，连 root anyOf 都拒。Zod 根是 discriminatedUnion/union/any 等非 object 时转换结果根缺 type。

**How to apply / 修复**：在 `zodToJsonSchema` 三处下手——①新增 ZodDiscriminatedUnion 分支产出带判别字段 enum 的宽松 object（不是 anyOf，因 OpenAI 拒 root anyOf；variant 精确形状由 agent Zod `safeParse` 在 post-parse 兜）②fallback 改 `{type:object,additionalProperties:true}` ③加 depth-0 根兜底：任何非 object 根强制成 object。这是全项目唯一 Zod→JSON Schema chokepoint，一改即修好 playground + social + marketplace 所有 discriminatedUnion-root agent（同源同病）。测试 `__tests__/zod-to-json-schema.spec.ts`。

**踩坑**：写在 ai-harness 源码注释里别提业务唯一名（playground/topic-insights），架构 spec `src/__tests__/architecture/layer-1-topology/layer-boundaries.spec.ts` 的 `ai-harness 不得提及业务唯一名` 断言会在 pre-push 拒推（`/\bplayground\b/i`）；.spec.ts/**tests** 被排除不扫。承接 [[project_mission_runaway_systemic_2026_06_21]]（同属"结构化输出契约全平台脆弱"症候）。

**第一版修错路径（教训）**：sub-agent 报告 leader(discriminatedUnion) 经 llm-executor.zodToJsonSchema 致 bug，照修后部署仍 474 次/分。真因：reviewer/verifier 类 agent 用 `loop:"simple"`(非 react/executor)，simple-loop 发 `SIMPLE_LOOP_OUTPUT_JSON_SCHEMA={oneOf:[object,array]}`(根无 type)；只有 json_schema 策略的模型(gpt-5.4)被拒，故只此 BYOK 用户中招。教训：转述 sub-agent 的链路结论前要自己核 `loop:` 字段确认真实执行路径。

**彻底修复(commit dcb3e7172 + 8c7309842，经 workflow 22→8 真问题审视)**：①SIMPLE_LOOP schema 改 object 根 ②`adapters.ts` 导出 `ensureOpenAiObjectRoot` 根守卫，所有 json_schema(\_strict) adapter + openai-caller legacy×2/degrade + xai-caller legacy×2 共用 ③`strictCompatible` 必须递归 `isStrictSafe`(每层 object 都 additionalProperties:false 且 required 覆盖全字段)——只看根一层是必要非充分，含可选字段的 schema(RESEARCHER_FINALIZE/多数 agent)会误判 strict→400，靠 in-request degrade 兜底但 strict 静默失效 ④nullable 根 type:["object","null"] 要识别数组形 type 归一标量 object。**OpenAI strict 三铁律**：根 object + 每层 additionalProperties:false + required 含全部 properties key(可选字段须 union-null 仍列 required)。**暂缓(low/latent,当前不可达)**：Gemini/Anthropic adapter 的 wire 边界根守卫(input_schema/responseSchema/output_config 仍裸发,靠"所有来源已 object 根"不变量护住)。验证方式：Railway `railway logs | grep "type: .None"` 计数归零 + `railway status --json` 取 backend commitHash 确认部署版本。
