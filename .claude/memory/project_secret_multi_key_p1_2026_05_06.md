---
name: Secret 多 KEY 管理 P1+P2+P3 端到端落地（2026-05-06）
description: admin/access/secrets + BYOK 多 KEY 端到端完成 — schema/service/admin-UI/BYOK-UI/业务侧透明迁移/20 spec；零 caller 侵入；剩 P4 清理 dual-track 旧字段
type: project
originSessionId: 88bcab33-4afa-40e3-9995-d1e247e94ef0
---

# 概述

`admin/access/secrets` 编辑 modal 此前每个 secret 只支持 1 个 KEY；用户要求多 KEY 并存（fallback chain + 健康熔断），与 UserApiKey + KeyChain 形态对齐。BYOK 同形态需求由 v0.2 共享 `<MultiKeyTable>` 组件方案承接。

# 决策矩阵（v0.7 锁定）

| Q                        | 选项                     | 理由                                          |
| ------------------------ | ------------------------ | --------------------------------------------- |
| Q1 消费策略              | B fallback chain         | 与现有 KeyChain 对齐                          |
| Q2 状态判定              | D 手动 + 被动            | 0 cron 运维负担                               |
| Q3 rotation              | B 用并存替代             | 最少代码                                      |
| Q4 编辑形态              | C drawer（抽屉）         | 列表不被遮挡                                  |
| Q5 合并 DistributableKey | A 不合并                 | 最小 surface                                  |
| Q7 多 TAB                | KEY 管理 / 状态总览      | 状态查看 vs 编辑分离                          |
| Q10 状态 TAB 列          | NAME / CATEGORY / STATUS | 红线只是不要 Apply/Configure/分组，列数不强制 |

# Commits（端到端 7 笔）

| commit      | 范围                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `b22b9d549` | P1: schema 加 SecretKey + relation；migration `20260506d_secret_keys_multi`（CREATE TABLE + INSERT...SELECT 回填 'primary'，幂等）；设计文档 v0.7 |
| `f88518fc1` | P1: SecretKeysService + admin Controller + DTO + 12 spec                                                                                          |
| `a5f8e0809` | P1: design doc 回填 commit hash                                                                                                                   |
| `cee6a4992` | P2: admin frontend — drawer + 状态总览 tab + MultiKeyTable + useSecretKeys hook                                                                   |
| `301e35e1e` | P3: 业务侧透明迁移 — getValueInternal 委托 SecretKeysService + create/update dual-write                                                           |
| `1c384ecdd` | P2 BYOK: listUserApiKeys 暴露 label + UserApiKeyMultiKeyPanel 复用 MultiKeyTable                                                                  |
| `a4e7a8432` | P3 spec: 8 个 regression（委托 / dual-write / markSuccess/Failure）                                                                               |

# 关键设计

**dual-track**：保留 `secrets.encrypted_value/iv/key_version` 列；`getSecretKey` 在 SecretKey 表为空时降级读 Secret.encryptedValue → P3 业务层切换前不破坏。

**5min 失败熔断**：`SecretKey.testStatus='failed'` + `lastTestedAt` 5min 内的 KEY 跳过；全部熔断时兜底返回第一个让业务自然恢复 markSuccess。

**新 service / controller 而不是扩 SecretsService**：原因 — `secrets.service.ts` 已 1042 LOC god-class，扩展会加剧 audit:debt。SecretKeysService 边界明确：只动 `secret_keys` 表 + 读 Secret 元信息，不动 Secret CRUD。

# 实施差异 vs 原 v0.7 plan

1. **业务侧零侵入**（vs 原 plan 改 23 处 caller）：让 `SecretsService.getValueInternal` 内部委托 `SecretKeysService.getSecretKey`（含 fallback chain + 5min 熔断 + dual-track 兜底），所有 caller 不动。`markSecretSuccess/Failure` 作为 optional public API 暴露。
2. **BYOK endpoint 仅 1 行改动**（vs 原 plan 全套新增 endpoint）：发现 PUT/DELETE `/user/api-keys/:provider` 已支持 label（PR-2），仅 listUserApiKeys 缺 `select: { label: true }`，加一行即完成。
3. **共享组件 `<MultiKeyTable>`**：admin 抽屉 + BYOK 折叠面板两处消费，视觉行为一致。
4. **总工时**：1 工作日（vs 原 plan 估 3-3.5 周）。压缩主因：透明迁移 + 共享组件 + BYOK schema 已 ready。

# 多 session 协作教训（再次）

`feedback_lint_staged_pulled_other_session_2026_05_06` 的场景**确实又发生了**：

1. 我 stage 了 secret-keys.\* 文件 + 改 secrets.module.ts
2. lint-staged 运行时另一 session 同时 commit dispatcher spec 修复
3. lint-staged stash pop 把我的文件吸入到了 dispatcher spec 那个临时 commit `03c46c148`
4. 另一 session `git reset HEAD~1` 撤销，重新单独 commit dispatcher spec → `3fad2f88f`
5. 我的工作回到 stash，需要 `git stash apply` 恢复

**How to apply**：

- 多 session 并行时优先 `git stash list` 检查 lint-staged automatic backup
- 不要 `git checkout stash@{N} -- newfile`（新文件不在 working tree → "did not match any file"）；用 `git stash apply`
- pre-commit hook 失败重试时**必须**重新 `git status` 确认 stage 状态，不要假设保留

# How to apply（通用）

- **新 service 而不是扩 god-class**：单文件 > 1k LOC + 多职责时，新 service 比 method 添加更友好（audit:debt + reviewability）
- **dual-track 迁移**：旧字段保留 + 新表共存 → 业务层切换 → 删旧字段；P3 之前任何步骤都可独立 ship
- **熔断窗口 5min**：经验值（key 临时限流通常 1-5min 自愈，失败一次 5min 不再打）
- **测试覆盖优先级**：fallback ordering > 熔断窗口 > 兜底降级 > duplicate label > input validation
