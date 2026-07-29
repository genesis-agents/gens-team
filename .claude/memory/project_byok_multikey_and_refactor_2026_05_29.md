---
name: project_byok_multikey_and_refactor_2026_05_29
description: BYOK 同名多 Key 已落地(收敛到 admin secrets)；密钥体系收敛重构是下一个独立专项
metadata:
  node_type: memory
  type: project
  originSessionId: fb80b096-fc17-4ac0-ada9-a497016380db
---

2026-05-29：在 feat/byok-multi-key 分支落地"BYOK 同名多 Key，呈现对齐 admin"。承接 [[project_byok_tool_key_redesign_2026_05_28]] 的 L2。

**已做（5 commit，分支未合 main）**：

- P1 SecretsService/SecretKeysService 加可选 ownerUserId 作用域（admin 不传=原行为，向后兼容）+ listByUser/getByIdForUser。
- P2 `/user/secrets/:id/keys` 多 Key 子资源（GET/POST/PATCH/PUT value/DELETE/POST test），全程 req.user.id owner 隔离 + requireOwnedSecret 纵深防御。
- P3 工具运行时 ToolKeyResolver dual-read：先 secretKeys.getSecretKey(name, userId)（envelope v2 + 多 Key failover），回退旧 user_credentials。
- P4 前端 /me/api-keys 行→抽屉按 source 路由：llm→UserApiKeyDrawer（user_api_keys）、secret→SecretKeysDrawer（user-scoped secrets，baseUrl=/user/secrets，复用 admin 同款组件）。工具类 create/update/delete 收敛到 user-scoped secrets。
- 多路检视整改：getUserSecretValue 改 decryptAny（envelope v2 兼容）、create 写 keyHint、SecretVersion 用户作用域跳过、testKey 用户侧只回 errorCode。

**关键决策（血泪，勿再来回）**：

- **LLM key 不迁 secrets**。LLM（user_api_keys + key_assignments）已有成熟 KeyResolverService/KeyChain/KeyHealthStore 多 Key+failover+健康回写；迁 secrets 会拆毁它且无收益。数据现状 user_api_keys≈20(全 LLM)、user_credentials=0、secrets 用户行=0 → **无数据可迁**，PR-4 backfill 当前 no-op。
- 工具类（原 user_credentials，0 行）收敛到 user-scoped secrets；envelope v2 加密，读经 decryptAny。
- 方案文档：docs/architecture/byok-multi-key-plan.md（§5b 是这条修正）。

**下一个独立专项（用户明确要求，2026-05-29）：密钥体系收敛重构**。根因债=三套并行 key 体系（secrets/secret_keys、user_api_keys、user_credentials）+ key_assignments + 两个前端入口(/me/api-keys、/me/models) + 命名债(donated 实为 assigned) + 本次加的 dual-read 过渡债。目标：一套存储模型 + 一个 resolver + 一套多 Key UI，架构清晰/最佳实践。要求：独立计划 + 独立多路检视 + 高 blast radius（全用户取 key），不与功能混做。
