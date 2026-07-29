---
name: user-action-rate-limits-must-be-loose
description: 用户主动交互的 endpoint 限流必须宽松（30/60s 起步），紧的限流配宽松业务闸而不是 controller 闸
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

## 规则

playground / 创建 / 重跑 / 写入类用户主动交互 endpoint 的 controller `@RateLimit` 不能配 5-10/60s 这种紧档；标准是 **30/60s** 或更宽。真正的滥用闸放在业务层（如 `RERUN_FREQUENCY_LIMIT_PER_24H=50` 滑窗 24h）。

## Why

用户连点 / 调试 / 演示场景下，5/60s 极易踩满（5 次创建 mission 立即 429），用户体验崩盘。"过严限流"出现两次（2026-05-08：rerun + team/run）都是同种心智——controller 层当成"DDoS 防护"配 5/60s。但 controller 限流真正职责只是反爬虫 + 反恶意刷，恶意成本控在业务层（24h 总闸 + cost guard + concurrency 限制）才是正确切面。

## How to apply

- 新建 user-facing POST endpoint 时 `@RateLimit` 默认 30/60s（authenticated）
- `keyType: "ip"` 公开端点（无 auth）保持 3-5/60s 防爆破
- 长窗滥用闸（24h / cost / concurrency）落在 service 层，不在 controller
- 已存在的紧档 5-10/60s 见到立即拉到 30/60s（无需用户提醒）
- 三层限流分工：
  - **controller `@RateLimit`** = 短窗反 spam，30/60s 起步
  - **service 业务层** = 长窗反滥用 / cost / concurrency
  - **NestJS Throttler / API Gateway** = 真 DDoS 防护

## 反例（已修复）

- 2026-05-08 commit 46e15586f：local-rerun 10/60s → 30/60s
- 2026-05-08 commit aac2ec83f：local-rerun service 5/24h → 50/24h
- 2026-05-08 commit be619ac3d：team/run 5/60s + missions/:id/rerun 5/60s + todos rerun 10/60s → 全 30/60s
