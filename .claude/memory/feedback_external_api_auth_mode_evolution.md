---
name: feedback-external-api-auth-mode-evolution
description: 外部 free API freemium 化时常改认证模式（mailto→api_key），代码需 format detect 双通道，否则用户配 API key 被当 email 用 → 静默走 anonymous → 失去 budget/quota tracking
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

外部 free API 走 freemium 商业化路径时，**几乎一定会改认证模式**：
旧：`?mailto=user@x.com` 进 polite pool（免费，不计 budget）
新：`?api_key=KEY` 或 `Authorization: Bearer KEY` 进 free tier（$N/day budget，用户 dashboard 可观测）

**Why**：2026-05-14 OpenAlex 事故。admin 把 API key 配进 SecretKey "openalex-api-key"，但 tool 代码无条件塞 `params.mailto = configuredKey`。OpenAlex 服务端看到非 email 字符串就忽略 → 请求按 anonymous 处理 → polite pool 仍能跑但**用户 OpenAlex dashboard 永远 0 消耗 / 100% remaining**，看起来像"OpenAlex 从未被使用"。Admin 反复确认 key 有效仍无效，prod log 看 `total indexed: 0` 误以为"调了但 query 烂"。

**How to apply**：

1. 任何取过 mailto 的外部 API 接入点，加 format detect：
   ```typescript
   if (cred.includes("@")) params.mailto = cred;
   else params.api_key = cred; // 或 Authorization header
   ```
2. 注释顶部明确写两种模式的差异（享受什么 / 不享受什么），方便后人理解 admin 行为
3. **检测点**：用户截图后台 dashboard 显示 budget 100% remaining + 我们 prod log 显示在调 → 80% 概率是 auth 模式错配
4. 同样需要警惕的 API：Crossref、Semantic Scholar、ORCID 等所有"polite pool"出身的学术/公益 API，都可能正在 freemium 化

**误诊陷阱**：用户报"OpenAlex 没被使用"时，不要先信代码层 log "[doExecute] Searching OpenAlex..."—— 那只是 caller-side log。真相在外部服务后台。budget 是 ground truth。

相关：[[feedback_test_connection_must_verify_runtime]]（只检 auth 不等于真用） [[feedback_no_hardcoded_provider_metadata]]
