---
name: KEY 状态字段端到端来自真使用反馈（2026-05-06 截图 36）
description: SecretKey + UserApiKey 的 testStatus / lastTestedAt / lastErrorCode / lastErrorMessage 现在统一由"手动 probe（真上游）+ 业务流量 markSuccess/markFailure"两条路径共写，UI 看到的状态永远是上次真实活动的结果
type: project
originSessionId: b563b5ca-9b52-4741-90db-57cabe79a67c
---

# 修复前的真相（截图 36 反馈）

`/admin/access/secrets` SecretKeysDrawer 表格 "STATUS=OK / LAST TESTED=just now" 是**假绿**：

- `SecretKeysService.testKey` 只校验 AES 解密成功，不调上游
  → 注释自承 `"decrypted (provider health check pending P3)"`
- `testStatus` / `lastTestedAt` 字段同时被手动按钮 + 业务流量 `markSuccess/markFailure` 写
  → 后写覆盖前写，UI 含义混乱
- 业务流量（`KeyResolver.MaterializedKeyChain.reportSuccess/reportFailure`）
  只更 `KeyHealthStore` in-memory cache，**不写 DB**
  → 一个生产里跑过 1000 次的 KEY 在 UI 仍显示"未使用"

# 修复后的契约（commit 待 push）

| 字段               | 写入路径                             | 含义                                            |
| ------------------ | ------------------------------------ | ----------------------------------------------- |
| `testStatus`       | 真上游探测 + 业务流量调用结果        | "成功 / 失败 / 未使用"三态                      |
| `lastTestedAt`     | 同上                                 | 上一次真实活动时间（手动 probe 或业务流量任一） |
| `lastErrorCode`    | 同上失败时                           | KeyErrorReason 同款归一化错误码                 |
| `lastErrorMessage` | 同上失败时                           | 不含敏感数据的简短错误，<=200 chars             |
| `accessCount`      | 业务流量成功时 +1（手动 probe 不增） | 真实业务调用次数                                |

# 错误码归一化

`AUTH_FAILED` (401/403) / `RATE_LIMIT_KEY` (429) / `QUOTA_EXCEEDED` (402) /
`PROVIDER_DOWN` (5xx) / `TIMEOUT` (AbortError) / `NETWORK_ERROR` (ECONNREFUSED 等) /
`DECRYPTION_FAILED` (AES 失败) / `UNKNOWN`

与 `KeyErrorClassifier.KeyErrorReason` 体系一致：业务流量 `classified.reason` 直接当
errorCode 写库；手动 probe `ProviderProbeService.classifyHttp/classifyError` 也产同样命名。

# 实现位置

| 路径                                                                               | 角色                                                        |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `ai-infra/credentials/health/provider-probe.service.ts`                            | 共享上游探测（admin + BYOK 都调）                           |
| `ai-infra/credentials/health/provider-defaults.ts`                                 | PROVIDER_DEFAULTS 单源（清三处重复）                        |
| `ai-infra/secrets/secret-keys.service.ts:testKey`                                  | 手动按钮：解密→调 probe→单写库                              |
| `ai-infra/credentials/key-resolver/key-resolver.service.ts:persistDbHealthOutcome` | 业务流量持久化：personal 类型写 user_api_keys               |
| `ai-infra/credentials/user-api-keys/user-api-keys.service.ts:testKey`              | BYOK pre-save 表单验证：只 return 不写 DB（不知具体 keyId） |
| `prisma/migrations/20260506f_secret_key_error_code/migration.sql`                  | DB schema                                                   |

# 反向教训（沉淀）

**1. 手动按钮"假绿"难以发现**

- testKey 只查解密返回 success → 用户看到 OK 以为可用 → 真实生产仍是 401
- 修复必须真发上游 HTTP；任何"P0 占位、P3 再说"的注释要立刻 backlog 跟踪

**2. 同一字段不能被多条路径无规则共写**

- `testStatus` 既被手动按钮写又被业务流量写 → 后写覆盖前写 → 含义不可解
- 解法：手动按钮和业务流量都走"标准化错误码 + 单写库"，让字段含义"上次真实活动结果"统一

**3. in-memory cache 不能替代 DB 持久化**

- KeyHealthStore 只在 pod 内活，pod 重启后清空；UI 也读不到
- 业务流量必须有 DB 持久化路径（write-through）
- 用 try-catch 包裹避免 DB 写失败阻塞业务调用链

**4. PROVIDER_DEFAULTS 三处重复**

- user-api-keys.service / user-model-configs.service / 还有第三处都各自定义
- 提到 `credentials/health/provider-defaults.ts` 单源，新增 provider 时只动一处

# How to apply

- 改"健康字段"前先 grep 所有写入点：`grep -rn "testStatus.*=" backend/src`
- 任何新加的"测试"按钮：必须真发 HTTP，不能只查解密
- 业务流量 success/failure 钩子：写 in-memory（fallback chain 决策）+ 写 DB（UI 显示）
- DB 写用 try-catch 不抛，避免业务被副作用拖死
- Prisma schema 注释里的"仅 X 模式累加"等遗留语义注释要随代码升级同步更新
