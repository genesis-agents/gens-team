---
name: feedback-llm-recovery-mechanism-not-hardcode
description: "LLM 格式/能力问题必须机制级解决(capability 链驱动 + 从运行时输出自纠),禁 provider/modelId 硬编码;恢复信号不能只认 4xx,要含 200 退化输出"
metadata:
  node_type: memory
  type: feedback
  originSessionId: aa7b8f6c-d97e-4b52-a56e-ff61bfd4e543
---

处理 LLM 调用的格式 / 能力 / 错误恢复时，**必须在机制层面解决，禁止任何
provider / modelId 字符串硬编码**。用户原话："杜绝任何硬编码，必须在机制上解决"。

**Why:** 2026-05-25 agent-playground researcher 反复失败。根因是 deepseek-v4-flash
思考模式被强制 `response_format: json_object` → 返回 **HTTP 200 但 content 空 /
重复畸形 JSON**（推理 token 全花在 reasoning_content）。而整套恢复机制
(in-request 降级 / capability self-heal 持久化 / model-failover)**只在 provider
显式 4xx 拒绝格式时触发** → 静默 200 退化绕过所有恢复层 → 维度硬失败。历史上
同类 bug 反复出现(2026-05-24 v4-pro 因 `includes("deepseek-reasoner")` substring
误判发 json_schema 崩)，都是硬编码模型名判定惹的祸。

**How to apply:**

1. **能力判定走 capability catalog + chain**（`ModelCapabilityService` /
   `deriveStructuredOutputChain` / `computeSelfHealDegrade`），不在业务代码写
   `if (modelId.includes("xxx"))` / `if (provider === "deepseek")`。catalog 是
   "先验猜测"，**运行时输出是 ground truth**：错了就让 self-heal 从输出自纠。
2. **恢复信号必须含"退化成功"(degenerate success)**，不能只认 4xx 拒绝。判据：
   200 但 content 空(非纯 tool_call) + 推理 token 占比高 / 被强制结构化输出。
   命中 → ① in-request 当次降级(撤/降 response_format 重试，chain 派生下一档)
   ② 合成 `degenerate_output`(httpStatus=200) 信号喂 self-heal 持久化降档
   ③ 仍空则 model-failover 换模型(`isModelLevelFailoverError` 含空响应模式)。
3. 推理耗尽判定 `finish_reason` 要含 `stop`(不止 `length`)——DeepSeek thinking
   空响应返回 stop。
4. 落地位置：`ai-api-caller.service.ts`(检测+in-request 降级)、
   `capability-self-heal.service.ts`(200+degenerate_output 白名单，仅配对放行)、
   `error-signal.types.ts`(`buildDegenerateOutputSignal`)、
   `model-failover.classifier.ts`(空响应/推理耗尽→failover)。
   配合 [[feedback-background-spenders-default-off]] / [[feedback-byok-never-admin-fallback]] 同属 BYOK 韧性。
