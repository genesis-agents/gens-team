---
name: feedback_schema_default_blocks_short_circuit
description: "Prisma `@default(N)` 与 `config.x || compute()` 短路组合让算法分支永远走不到；改用 `Math.max` 或 nullable"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

**禁止 `Prisma @default(非零值)` 字段与 `config.x || computeFallback()` 短路组合。** 设计期看着"有 fallback"实则永远短路。

**Why:** 2026-05-13 P0 真因：`UserModelConfig.defaultTimeoutMs Int @default(120000)` + `const timeout = config.defaultTimeoutMs || getTimeoutForModel(...)`。120000 非 0 永远短路 → reasoning model 该走的 540-780s 算法永远走不到 → axios 120s ECONNABORTED → BYOK reasoning mission planning 全死。同源对照：admin `AIModel` 路径有 `defaultTimeoutMs ?? (isReasoning ? 300000 : 120000)` 显式 fallback，所以 admin 系统模型不受影响——侧证根因。

**How to apply:**

- 写 `config.x || compute()` 时反问："如果 schema 默认值是 120000，compute() 还会被调用吗？" 答案是"不会"就改 `Math.max(config.x ?? 0, compute())` 或让 schema 改 nullable 配 `??`。
- code review 任何 `||` 短路 + 数值/字符串字段时验证：DB schema 那一列是不是 `@default(非零/非空)`？是 → 短路一定吃 DB 默认值。
- 单源化 `getTimeoutForModel` 配合 [[feedback_no_dual_sources]] —— 本轮 5 份重复实现已经有一份 maxTimeout 600000 vs 900000 漂移。
