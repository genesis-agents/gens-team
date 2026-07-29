---
name: project_local_reasoning_model_fc_2026_05_07
description: 2026-05-07 本地 reasoning model（Nemotron / Qwen / Llama-3）native function-calling 失败的多层根因 + 兜底矩阵
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# 本地 reasoning model native FC 调不动工具的多层根因（2026-05-07）

**起源**：用户本地跑 Nemotron-3-Nano-Omni-30B，发现 mission 里 `tool_call` 完全打不出去 —— LLM 应该调 tool 时 finalize 假 raw / 卡死。

下面 6 层是按"调试该走的顺序"排的，每层失败会让上一层的修复白做。

## 层 1：vLLM tool parser 没开（最常见，约 60% 案例）

**症状**：`response.toolCalls` 永远 `undefined` 或空数组；content 里看到 `<tool_call>{...}</tool_call>` 或 `{"name":"X",...}` 这种**未解析**形态字符串。

**根因**：vLLM serve 默认不解析 tool calls，整段 wire 格式被原样塞进 content。

**修复**：vLLM serve 命令必须加：

```bash
vllm serve <model> \
  --enable-auto-tool-choice \
  --tool-call-parser <name>
```

**parser 选型对照表**（必须按模型选对应 parser）：

| 模型家族                | tool-call-parser | 备注                         |
| ----------------------- | ---------------- | ---------------------------- |
| Llama 3.1+              | `llama3_json`    | OpenAI-style JSON            |
| Mistral / Mixtral       | `mistral`        | `[TOOL_CALLS]` token         |
| Nemotron-3 / 4          | `nemotron`       | NVIDIA 自己的 wire 格式      |
| Qwen 2/2.5 / Qwen-Agent | `hermes`         | `<tool_call>...</tool_call>` |
| Hermes-2-Pro            | `hermes`         | 同上                         |
| GLM-4                   | 无官方           | 走 prompt-driven fallback    |
| Phi-3                   | `pythonic`       | python-style 调用            |

**验证**：vLLM `/v1/chat/completions` 直接 curl 一次带 `tools` 字段；response 应该有 `choices[0].message.tool_calls` 数组。如果没有，parser 没装对。

## 层 2：协议方言（model 自家训练习惯）

即便 parser 装对了，模型可能吐 spec 之外的形态：

**Nemotron-3 toolId-as-kind 退化**：训练偏好把 toolId 当 kind 字段：

```json
// 不应该吐
{"kind":"tool_call","toolId":"web-search","input":{...}}

// 实际吐（toolId 直接当 kind）
{"kind":"web-search","input":{...}}
```

**项目已修复**：`react-loop.normalizeAction / normalizeToolCall` 加 toolId-as-kind 兜底（commit `f50b50d36a`）。触发条件：`a.kind 非空 + 非 RESERVED_ACTION_KINDS + a.input 存在` → 当 tool_call 处理。

**Qwen ChatML 包裹差异**：Qwen-Agent 训的版本会吐 `<tool_call>\n{json}\n</tool_call>`，没装 hermes parser 时直接散在 content 里。**项目兜底**：`extractJsonFromAIResponse` 工具会从 markdown / fenced block 提 JSON。

**Llama-3 字段名**：吐 `{"name":"X","parameters":{...}}` 而非 `{"name":"X","arguments":{...}}`。**风险点**：项目 `decisionFromToolCalls` 用 `tc.arguments`，如果 vLLM llama3_json parser 转成 `arguments` 就 OK；如果直接透了 `parameters` 字段则取不到。**需验证**：vLLM 各 parser 的 output 字段名是否统一规范化成 `arguments`（看 vLLM `tool_calls` schema）。

**arguments string vs object**：

- OpenAI raw API 返回 `arguments: string`（JSON 字符串）
- vLLM 多数 parser 已转 `object`
- 项目 `decisionFromToolCalls` 假设 `typeof tc.arguments === "object"` —— 如果某 parser 没转就丢失参数（兜底用 `{}` 空对象）

## 层 3：prompt 协议冲突（flag-on 时）—— 2026-05-07 反转修复

**冲突点**：flag-on 时仍 append `<available_tools>` catalog block 进 system prompt，里面带 `example: {"thinking":"...","action":{"kind":"tool_call","toolId":"X","input":{...}}}` 这种 envelope 形态。

**初版修法（错的，已撤回）**：`DECISION_FC_SUFFIX` 只保留运营段不含 envelope 协议描述，假设"prompt 干净"减少模型困惑。

**反转真因（用户 prod 卡死复盘）**：vLLM 没装 `--tool-call-parser <name>`（用户最常见 setup 失败模式）时，LLM 没指引怎么吐 tool call —— `response.toolCalls` 永远空 + content 不吐 envelope JSON。**双层网第二层 parseDecision 真兜底拿不到 JSON 来 parse**。Layer 6 等于失效，工具调用全无。

**正确修法**（commit `7db2b3e17`，2026-05-07）：

```typescript
// react-loop.ts:154-169
const DECISION_FC_SUFFIX = DECISION_SYSTEM_SUFFIX; // ★ 字节字面别名
```

三个考量：

1. parser 装对：prompt 多一份 envelope 描述无害（LLM 自然走 native tool_calls）
2. parser 没装/装错：prompt 引导 LLM 走 envelope JSON content，fallback parseDecision 真生效
3. 字节与 DECISION_SYSTEM_SUFFIX 一致：prompt cache prefix 对 flag-on/off 切换稳定

**Spec 锁**：`react-loop.native-fc.spec.ts` Case E "layer 6 invariant" 字节级断言 SUFFIX 含 `## Decision Protocol` / `EXACTLY this two-level wrapper` / `parallel_tool_call` / 保留 kind 警告等 8 个签名。

**元教训**："prompt 干净"在有 fallback 通道时是反模式 —— fallback 通道必须 prompt 自洽，否则等于不存在。

## 层 4：chat() 接口层 callId 配对

**当前限制**：`ChatMessage.role` 类型只支持 `"system" | "user" | "assistant"`，不支持 `"tool"`。`buildMessages` 把 envelope role:"tool" 降级 → role:"user"，**丢失 tool_call_id 配对**。

**P1#2 partial 修复**（同 commit review）：buildMessages 把 callId 嵌入 content prefix `[tool_result name=X call_id=Y] ...`，让 LLM 至少能识别配对（不依赖 native）。

**完整修复（独立 PR）**：

1. ChatMessage 加 `role: "tool"` + `toolCallId: string` 字段
2. provider adapter（openai / anthropic / vllm）原生透传到 wire 格式
3. AnthropicLlmAdapter 用 `tool_use_id`，OpenAILlmAdapter 用 `tool_call_id`，vLLM 跟 OpenAI

**当前影响**：本地 vLLM + native FC 模式下，多轮 tool_call 时模型看不到 native tool_use_id 配对，但能看到 `[call_id=...]` 文本提示——大多数 reasoning model 能 handle，少部分严格模型可能困惑。

## 层 5：Provider 透传断点

**ai-api-caller.service.ts** 是项目对 vLLM / OpenAI / Anthropic 的统一入口：

- `tools` 字段：当前已透传（`ChatOptions.tools: FunctionDefinition[]` → adapter 处理）
- `tool_call_id` / `tool_use_id`：当前**没有透传**（ChatMessage 没字段）

**意味着**：layer 4 不修，layer 5 也不会修；两层是耦合的。

## 层 6：双层网兜底（最后防线）

ReActLoop 的双层网设计能让所有上述失败优雅降级到 prompt-driven JSON：

```
flag-on + parser 工作 + 协议正确 → response.toolCalls 走 native 路径
                ↓ 失败任何一项
flag-on + parseDecision JSON → toolId-as-kind 兜底
                ↓ 仍失败
finalize-raw（把整段 content 当 finalize.output 给 reflexion 重试）
```

这是 commit `f50b50d36a` 的核心设计：永远有兜底，不挂。

## 实战调试 checklist（按顺序）

遇到本地模型 FC 不工作时按这个序：

1. **vLLM serve 命令是否带 `--enable-auto-tool-choice --tool-call-parser <name>`？**
   - 没装：装上重启
   - 装错（parser 名字与模型不匹配）：照"parser 选型对照表"修

2. **curl 直 vLLM 测试 native tool_calls 工作不工作？**
   - 不工作：vLLM 配置问题，与项目代码无关
   - 工作但 toolCalls 字段名错（如 `parameters` 而非 `arguments`）：vLLM 版本 parser 实现差异，可能要升级

3. **flag `HARNESS_REACT_NATIVE_FC=true` 设了吗？**
   - 没设：走 prompt-driven 路径，任何 native FC 修复都不生效
   - 设了：看下面

4. **Mission 跑起来后，看 react-loop 日志里 `[react-loop:native-fc]` 三态：**
   - `path=tool_calls count=N` → native 工作正常
   - `path=fellback_json` → toolCalls 没到，走 JSON 路径（JSON 内容在不在？看 content_len）
   - `path=finalized_raw` → JSON 也没拿到，被当 finalize raw 兜底

5. **fellback_json 时是不是 toolId-as-kind 形态？**
   - 看 `normalizeAction` 是否走 `RESERVED_ACTION_KINDS` 兜底分支日志（没日志可加）
   - toolId 是否在 `<available_tools>` 列表里（不在的话 toolId-as-kind 也救不了，会 ToolNotFound）

6. **多轮 tool_call 失败：**
   - 看 buildMessages 输出是否包含 `[tool_result ... call_id=...]` 标记
   - 标记在但模型仍调不出第二个 tool：layer 4/5 完整修复（ChatMessage 扩 role:"tool"）

## 与项目设计的对齐建议

1. **ai_models 表加 tool_parser 字段**：每个本地模型记录用什么 vLLM parser，前端管理界面让管理员选；可与 `project_llm_capability_matrix_2026_05_06` capability matrix 联动。

2. **flag 粒度细化**：当前 `HARNESS_REACT_NATIVE_FC` 全局 boolean。建议改成"按模型决定"：模型 capability 表里有 `supports_native_fc: true` → loop 自动 ON，否则 OFF。

3. **canary 灰度方案**：先选 1 个商用模型（GPT-4o / Claude）验证 layer 4/5 完整路径，再切本地 Nemotron 验证 layer 1-3 兜底。

## 关联 commit

- `f50b50d36a` — PR-1 native FC 主体 + toolId-as-kind 兜底（layer 2 + layer 6 雏形）
- `d5ea3f157` — P1 review 修 + zombie heartbeat 双信号（layer 4/5 partial via content prefix）
- `9ec430bb7` — **layer 4/5 完整透传**（ChatMessage role:"tool"+toolCallId / OpenAI tool_call_id / Anthropic tool_use_id / Gemini functionResponse / xAI 透 OpenAI 兼容；4 modules 104 spec pass）
- `7db2b3e17` — **layer 6 真兜底 + FC 路径保留 kind 对称防御**：
  - `DECISION_FC_SUFFIX = DECISION_SYSTEM_SUFFIX` 别名（修反转，layer 3）
  - `decisionFromToolCalls` 加 `RESERVED_ACTION_KINDS` 拒绝（FC 路径与 prompt-driven `normalizeAction` 对称防御 skill_invoke / subagent_spawn / llm_generate）
  - 主调度 try-catch → finalize-raw fallback
  - spec Case E 锁 layer 6 不变量；spec Case F 锁 FC 保留 kind 拒绝（3 reserved × 4 重断言，含 ToolRegistry 注册 PWNED 同名最坏场景）
  - R2 4/4 共识（2 轮：security R2 CHANGES-REQUIRED → R3 修 Case F 后 YES）
- 待修 — ai_models 表加 tool_parser 字段（layer 1 自动化）
- 待修 — flag 粒度从全局 boolean 改成"按模型 capability 决定"
