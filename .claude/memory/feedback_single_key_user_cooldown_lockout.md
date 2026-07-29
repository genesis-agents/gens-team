---
name: feedback_single_key_user_cooldown_lockout
description: cooldown 设计默认 N≥2 key 失败时 failover；N=1 用户偶发失败 = 整 user 锁死，必须 degraded fallback
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

**Key 健康 cooldown 机制设计前提是"多 key failover"。单 BYOK key 用户偶发 timeout/rate-limit 就会把整个 cooldown 窗口锁死，多个 mission 并发时雪崩。filterUsable 在全部 finite cooldown 时必须返回 cooldownUntil 最早结束那个作为 degraded fallback。**

**Why:** 2026-05-13 prod log 01:17:58 KeyExecutor warn "personal:\*\*\*:openai:default failed (TIMEOUT)" → 01:18:02 起 5 个 ReActLoop trace 全部 "No API Key available for provider openai"。用户只有 1 BYOK key，30s cooldown 期间 filterUsable 返 []，chain.size===0 直接 throw `NoAvailableKeyError`。多 mission 并发让"健康 cooldown"变成"健康熔断"。

**How to apply:**

- 任何"过滤不可用资源后返回剩余可用"的 filterUsable 必须想：N=1 场景过滤后剩 0 怎么办？默认应该是 degraded fallback（返回最快恢复那个）+ warn log，而不是空集
- 排除条件保持严格：DEAD（AUTH_FAILED）+ cooldownUntil=MAX_SAFE_INTEGER（QUOTA_EXCEEDED）不作为 fallback —— retry 浪费
- 这种 fallback 不会进入死循环：retry 失败后 cooldownUntil 刷新到 now+window，下次仍然能选回它但效果一样（每次"试一次"而非"无限试"）
- 配合 [[feedback_byok_must_check_layers_above_chat]] / [[feedback_fk_storm_circuit_breaker]]：所有"熔断/健康"机制需要明示假设的"健康池规模"，单实例场景必须有 degraded mode
