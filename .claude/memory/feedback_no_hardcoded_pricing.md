---
name: 禁止硬编码模型价格，走 ModelPricingRegistry 单一源
description: 任何模型成本估算必须从 ai_models 表读价格（priceInputPerMillion/priceOutputPerMillion），禁止在代码里写死
type: feedback
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

LLM 成本计算（estimateCost）禁止持有任何硬编码价格表。模型每月新增 + 价格调整，
硬编码必然过时；多份散落硬编码必然漂移。

**Why:** 2026-05-06 用户原话："谁他妈的让你硬编码的"。审计发现 3 份重复硬编码：

- `ai-engine/planning/budget/cost.calculator.ts`
- `ai-harness/tracing/observability/ai-observability.service.ts:87`
- `ai-infra/monitoring/metrics/ai-metrics.service.ts:56`

且**互不一致**：gpt-4o 在三份里分别是 0.0025/0.01、0.0025/0.01、0.005/0.015。
项目本来就有 `ModelPricingRegistry`（注释明文："不再持有 DEFAULT_TABLE 硬编码"），
被这 3 份绕过。

**How to apply:**

- 单一权威源：`ai_models` 表的 `price_input_per_million` /
  `price_output_per_million` 列，admin UI 配置
- 服务侧：注入 `ModelPricingRegistry` (在 `ai-engine/llm/pricing/`)，调
  `registry.estimateCost(modelId, inTok, outTok)`，返回 `null` 表示模型未配价格
- 调用方处理：`?? 0` 兜底（"未配价格 = 0 USD"）；若需精确数字让 admin 补价格
- 写新代码前 `grep -rn "COST_PER_1K_TOKENS\|MODEL_COSTS"`，发现新硬编码立即拒
- 不要绕过 `ModelPricingRegistry` 自己 import OpenAI/Anthropic 价格常量
