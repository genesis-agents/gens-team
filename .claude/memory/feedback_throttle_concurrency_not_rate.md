---
name: feedback-throttle-concurrency-not-rate
description: 外部 API 限速保护必须区分 concurrency（同时在飞数）和 rate（req/s）；p-limit 不防 burst 429，必须配合 token bucket
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

外部 API 三层限速保护必须各司其职：

| 层                    | 工具                                    | 防什么                                          |
| --------------------- | --------------------------------------- | ----------------------------------------------- |
| L1 cooldown           | static cooldownUntil + 自动 setCooldown | 429 后 N 秒 fast-fail，避免排队中的兄弟继续撞墙 |
| L2 rate limit (req/s) | token bucket (createRateLimiter)        | "瞬时同发"的 burst 突破外部 polite pool 上限    |
| L3 concurrency        | p-limit (createConcurrencyLimiter)      | 同时在飞数过多耗资源                            |

**Why**：2026-05-13 OpenAlex 429 复盘三个错位：

1. 原只有 concurrency=5；4 个 dim 并行 + Phase 1 双调用 = 5 req/秒 burst → polite pool 10 req/s 紧贴上限就 429
2. tool 内 static cooldown 是事后反应，第 1 个请求 429 设了 cooldown，但**已 in-flight 的 4 个并发**各自再撞墙 → log 看到"短时间多条 markKeyFailed"
3. 注释"100k/month, generous"过时（OpenAlex 已 freemium $1/day）

**How to apply**：

- 外部 API 限速配置必须同时设 `{ concurrency, reqPerSec }`，reqPerSec ≤ 外部上限 × 80%
- throttle.execute 入口 + queue 出列时双重 cooldown 检查 fast-fail
- catch 到 error 自动检测 429/"rate limit"/"too many requests" → 自动 setCooldown 30s
- 注释里写"100k/month generous"这种**外部计费策略**类参数必须定期校验（OpenAlex 已改 freemium，类似变化以后还会发生）
- ESLint 看不到，只能靠 reviewer 主动 grep `concurrency:` 看是否单独存在

实现源：

- `backend/src/common/utils/concurrency.utils.ts` (createConcurrencyLimiter + createRateLimiter)
- `backend/src/modules/ai-app/topic-insights/services/search/global-source-throttle.service.ts` (三层叠加)

相关：[[feedback_health_recheck_must_cooldown]] [[feedback_kb_silent_429_failmodes]] [[feedback_single_key_user_cooldown_lockout]]
