---
name: feedback_bridge_inmemory_health_to_db
description: '业务模块内的 in-memory KeyHealthMap 必须 bridge 到 SecretKey.testStatus DB 写，否则 admin UI 永远显示"正常"看不到熔断'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

业务模块（SearchService 等）自维护 in-memory `Map<keyHash, KeyHealth>` 标 Key
失败 + cooldown 时，必须 _同时_ 写到 SecretKey 表的 testStatus / lastUsedAt /
lastErrorCode 字段，让 admin /admin/access/secrets 和 /admin/ai/tools 看到真实
状态。否则会出 Screenshot_59 类用户反馈："日志被熔断了，但 Key 的状态还是正常"。

**Why**：2026-05-12 用户截图反馈。SearchService.markKeyFailed 只动内存
keyHealthMap，admin 列表读 SecretKey.testStatus 永远 success。Tavily/Serper 429
风暴时 admin 误以为 key 健康，业务全 fallback DDG 用户体验崩。
修法 commit `1a1bace4b`：SecretsService 加 `getValueInternalAllKeys` 返回
Array<{value, keyId}>；SearchService 在 markKeyFailed 后追加
`secretsService.markSecretFailure(name, msg, keyId, errorCode)` 同步 DB。

**How to apply**：

- 任何业务模块自维护"私有健康状态 Map"必须做 bridge：
  1. 拿到 raw key 时同时拿 keyId（用 `getValueInternalAllKeys` 平行数组）
  2. mark fail → 内存 + DB 双写
  3. mark success / clear failure → 内存 + DB 双写
- DB 写走 `secretsService.markSecretFailure(name, msg, keyId, errorCode)` /
  `markSecretSuccess(name, keyId)` 单源 API
- HTTP status → SecretKey.lastErrorCode 必须归一化（AUTH_FAILED /
  QUOTA_EXHAUSTED / RATE_LIMIT_KEY / PROVIDER_5XX）保 admin badge 一致
- env-fallback / legacy comma 模式 keyId=null 静默跳过 DB（不抛）
- admin 工具列表 enrich：ToolConfig.secretKey → Secret → SecretKey 聚合
  （多 KEY 求和 hits / 取 max lastUsedAt / RANK 优先 success > unknown > failed）

关联：[[feedback_no_dual_sources]] [[feedback_admin_byok_visual_parity]]
[[project_secret_reference_audit_2026_05_07]]
