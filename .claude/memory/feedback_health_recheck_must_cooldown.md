---
name: feedback-health-recheck-must-cooldown
description: 外部服务健康检查失败后必须 cooldown（≥60s）才能重试，否则每次调用都 retry → ECONNREFUSED 日志风暴
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

外部依赖（FlareSolverr / Semantic Scholar / 任何 ECONNREFUSED 风险服务）的健康检查失败后必须有 cooldown 期（≥60s），cooldown 内 fast-fail 不重新探测。

**Why**:

- 2026-05-13 FlareSolverr #23：service 永久 down，FlareSolverrService 的 `fetchPage` 每次都 `if (!isAvailable) await checkHealth()` 重新探测 → Railway log 出现 ECONNREFUSED 风暴（每秒级刷屏）
- 2026-05-13 Semantic Scholar #17 同模式：global cooldown 设了 60s 但 fetch 流程不 fast-fail，每个请求仍 await acquireSlot → caller 阻塞 60s 而不是立即 fallback 到 arxiv/openalex

**How to apply**:

cooldown 三件套：

1. **失败时记 `lastFailedAt`**（timestamp）
2. **下次调用先检查 `Date.now() - lastFailedAt < COOLDOWN_MS`**，是 → 立即 throw / return fast-fail（不发新请求）
3. **fail-fast 错误消息显示剩余冷却秒数**，让 orchestrator 知道路由到 fallback provider

COOLDOWN_MS 选择：

- 临时性故障（429 / 5xx）：30-60s
- 配额耗尽 / 服务永久 down（402 / ECONNREFUSED）：5-30 分钟
- 用户能在 admin / 控制台手动 `resetCooldown(provider)` 强制重试

**反模式（严禁）**：

- `if (!isAvailable) await checkHealth()` 每次调用都重新探测
- 失败时只 log.warn 不记 timestamp
- caller 阻塞等 cooldown 而不是 fast-fail（fallback 路由失败）

文件参考：

- backend/src/modules/ai-app/library/proxy/flaresolverr.service.ts:61 (lastHealthCheckFailedAt + 60s cooldown)
- backend/src/modules/ai-engine/tools/categories/information/academic/semantic-scholar-search.tool.ts:267 (cooldownUntil fast-fail)
- backend/src/modules/ai-engine/knowledge/search/search.service.ts:88 (per-error-type cooldown matrix)

相关：[[feedback_fk_storm_circuit_breaker]]
