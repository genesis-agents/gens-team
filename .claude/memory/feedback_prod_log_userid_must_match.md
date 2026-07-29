---
name: feedback-prod-log-userid-must-match
description: '用户截图报"X 失败"+ 我从 Railway prod log 随手挑一条同时段错误诊断，**必须先把 log 里的 userId 跟用户当前账号对一遍**。admin 看 prod log 跨用户可见，挑错 userId 会导出完全错误的根因链'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

诊断 prod 失败时如果挑了一条 Railway log，**先 grep 出 log 里的 userId / personal:<uuid> 前缀，跟用户当前账号比对**。admin 用户看 Railway log 是全局可见的，时段同步的别人错误很容易被误认作自己的。

**Why**：2026-05-12 wiki "Ingest 失败" 调查走了 2 轮弯路：

1. R1: 看到 prod log `[gpt-5.4|personal:c5d18b0f...:openai:default]` 3 次 timeout，给出"admin 默认 modelId 是错的"的诊断（错）
2. R2: 用户截图反驳"我用的 Grok"，又改诊断成"用户配了 OpenAI key 又配了 Grok key，没设默认"（也错）
3. R3: 查 DB 才发现 `c5d18b0f-...` 是另一个用户 user-A，**根本不是 admin 当前用户 18780216-...**。admin 的 CHAT 默认是 grok-4-1-fast-reasoning + xai key testStatus=success，最近 ingest 都成功
4. 真正的 admin 用户失败要么是更早的瞬时网络抖动，要么压根没失败（只是看到了别人 log）

**How to apply**：

1. **从 prod log 拿到错误后第一步**：
   ```
   grep -oE 'personal:[0-9a-f-]{36}' log_line
   ```
   把这个 userId 跟 `user.findUnique({where:{id:<uid>}, select:{email,role}})` 对一遍，**确认是当前用户**再继续
2. **如果 log 没带 userId**：让用户在前端 F12 → Network 看 `/v1/wiki/ingest` 响应里的 `requestId` / `traceId`，去 `Logger` 里 grep 这个 id 才能锁定**他这次请求**的链路
3. **Admin 用户特别危险**：admin 看 Railway log 是跨用户的，"刚才一条 timeout" 很可能是别人的
4. **沉淀诊断报告时**：必须写"DB-verified userId = X, email = Y" 而不是只写"用户 c5d18b0f..."

**触发条件**：用户截图前端报错（toast / banner）+ 我去翻 prod log 的所有场景。前端截图本身不带 userId，只有时段，所以匹配 log 行时**时段就近 ≠ 同一用户**。

链接：[[feedback-systematic-analysis]] [[feedback-user-default-overrides-admin-default]]
