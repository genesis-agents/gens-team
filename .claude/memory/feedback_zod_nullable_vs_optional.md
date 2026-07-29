---
name: feedback_zod_nullable_vs_optional
description: 'emit 显式发 `score: null` 表达"无值"时 zod schema 必须用 `.nullish()`；`.optional()` 只收 undefined'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

**zod `.optional()` 接受 undefined 不接受 null。需要表达"显式无值"语义（abstain / no-score / payment-failed）必须用 `.nullable()` 或 `.nullish()`。**

**Why:** 2026-05-13 prod log 反复打 `Domain event "agent-playground.agent:reflection" payload validation failed: score:Expected number, received null`。ReflexionLoop force-pass 分支在所有 verifier abstain 时显式 emit `{ score: null }` 表达"无分可评" —— 这是有意义的语义信号（null = 显式没有，undefined = 字段缺失），不能强改成 undefined 丢失信号。schema 用 `.optional()` 不接 null 反复炸。

**How to apply:**

- 字段是"可能存在 + 可能显式无值"两态（abstain / payment-failed / not-yet-computed）→ `.nullish()` 或 `.nullable().optional()`
- 字段是"可能省略"单态（向后兼容、新加可选属性）→ `.optional()` OK
- emit 端 + schema 校验端要对齐：grep emit 那一侧实际传啥值（null / undefined / 缺省）再决定 schema 形态
- 配合 [[feedback_unitrack_audit_must_check_consumer]]：emit + consume 必须同 PR 校验
