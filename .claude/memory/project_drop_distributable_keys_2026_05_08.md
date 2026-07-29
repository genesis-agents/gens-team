---
name: BYOK 单源化重构（删除 DistributableKey 双源抽象）
description: 2026-05-08 删除 DistributableKey 表 + KeyAssignment 改为关联 AIModel.id；管理员秘钥从此单源走 AIModel，授权语义=用户↔模型。1 commit (757dc66af) 4 路评审 round 2 4/4 共识
type: project
originSessionId: 7d028ab3-e546-4f0f-9b44-f6ee8ffbc81d
---

## 背景

5 月 8 日用户在 admin 截图反馈：用 grok-4 模型授权时报 "No available pool for provider xai"。深挖后发现 BYOK 三层 key 来源（PERSONAL / ASSIGNED / SYSTEM）实际有 4 张表：UserApiKey + KeyAssignment + DistributableKey + AIModel.apiKey，其中 DistributableKey 和 AIModel.apiKey **是同一份 provider key 的双源录入**。用户拍板：删 DistributableKey 这层，管理员秘钥单源走 AIModel.apiKey，授权语义改为"管理员把某模型开放给某用户"（而非"分配密钥池"）。

## 决策

1. **DROP TABLE distributable_keys** + 整个 ai-infra/credentials/distributable-keys/ 目录 + admin 3 页面
2. KeyAssignment.keyId(FK→DistributableKey) → modelDbId(FK→AIModel.id)
3. 唯一约束 [userId, provider, modelId(string)] → [userId, modelDbId]
4. KeyAssignment 保留 provider/modelId 作为冗余字段（grant 时由 AIModel 派生填充，listing/filter 用免 join）
5. 池级 monthlyQuotaCents/currentSpendCents 直接删（spend 走 KeyAssignment.userSpendCents + CreditsService）
6. KeyRequest 工单流保留，approve 入参 keyId → modelDbId

## 关键修复（评审 round 1 4 项 P0/P1）

| ID    | 评审     | 问题                                                                                           | 修法                                                                                |
| ----- | -------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P0-S1 | 安全     | migration Step 2 把 DistributableKey AES 密文写入 AIModel.apiKey（运行时直接 trim 返回 → 401） | 删 Step 2 UPDATE 块，改注释要 admin 在 /admin/ai/models 重新配置 secret_key/api_key |
| P0-S2 | 安全     | GrantBatchDto 是 plain interface 无 class-validator，userId 可被任意伪造                       | 改 class + @IsString/@IsArray/@ValidateNested/@IsIn/@IsDateString                   |
| P0-D1 | 数据迁移 | 通配 `*` 行在 0-enabled-model provider 下 4d 静默删除（备份 key_id 也被 Step 6 DROP）          | 4d backup INSERT 加 CASE 区分两种情况，note 标识 "admin manual restore required"    |
| P1-T1 | 测试     | key-requests.service.spec 缺 grantBatch failed[] 路径覆盖                                      | 加 case：mock failed[] → assert reject + 状态不变 PENDING                           |
| P1-A1 | 架构     | 冗余字段漂移：AIModel.provider 改名时 KeyAssignment 不会刷新                                   | 加注释 acknowledge + defer（modelDbId FK 是单一源；同步 cron 是 OUT OF SCOPE）      |

## 评审记录

- Round 1（4 路并行）：
  - 架构：APPROVED-WITH-CONDITION（P1-A1）
  - 安全：NEEDS-CHANGES（P0-S1 + P0-S2）
  - 测试：APPROVED-WITH-CONDITION（P1-T1）
  - 数据迁移：NEEDS-CHANGES（P0-D1）
- 修完 5 项后 Round 2 重审：4/4 APPROVED → 满足 feedback_consensus_must_iterate_to_all_yes 红线，push commit 757dc66af

## 关键 commit

- `757dc66af refactor(byok): drop DistributableKey table, KeyAssignment now references AIModel directly`

## 涉及文件（用于回查）

**Backend**：

- backend/prisma/schema/models.prisma:9019-9067（DROP DistributableKey + KeyAssignment 改 modelDbId 字段 + AIModel.keyAssignments 反向关系）
- backend/prisma/migrations/20260508a_drop_distributable_keys/migration.sql（数据迁移 + DROP TABLE）
- backend/src/modules/ai-infra/credentials/distributable-keys/（整个目录删除）
- backend/src/modules/ai-infra/credentials/key-assignments/key-assignments.service.ts（grantBatch 改 modelDbId 输入；resolveActive 走 AIModel join；resolveModelApiKey 走 SecretsService → apiKey fallback）
- backend/src/modules/ai-infra/credentials/key-resolver/key-resolver.service.ts（ResolvedKey.keyId → modelDbId）
- backend/src/modules/ai-infra/credentials/scheduling/byok-maintenance.scheduler.ts（markStaleAssignments 触发条件改 AIModel.isEnabled=false）
- backend/src/modules/open-api/byok-admin/distributable-keys.controller.ts（删除）
- backend/src/modules/open-api/byok-admin/admin-key-assignments.controller.ts（GrantBatchDto class+class-validator）

**Frontend**：

- frontend/app/admin/access/distributable-keys/（页面删除）
- frontend/app/admin/access/key-assignments/（页面删除，用户行内 🔑 是新统一入口）
- frontend/components/admin/byok/DistributableKeysManager.tsx（删除）
- frontend/components/admin/byok/GrantKeyModal.tsx（modelId → modelDbId）
- frontend/components/admin/byok/KeyRequestsManager.tsx（ApproveModal 改"选 AIModel 行"）
- frontend/lib/admin/navigation.ts（删 2 nav）
- frontend/hooks/features/useByokAdmin.ts（删 useDistributableKeys；AssignmentView 加 modelDbId/STALE）

## 待用户验证（生产部署后）

1. `npx prisma migrate deploy` 跑 20260508a_drop_distributable_keys（事务安全）
2. 验证 \_orphan_key_assignments_backup 表里通配行的 note 字段区分两种情况
3. **Admin 必须**：进 /admin/ai/models 给每个之前依赖 DistributableKey 池的 provider 重新配 api_key 或 secret_key（migration 不自动迁密文）
4. UI 走通：用户管理行内 🔑 → 选模型 → 提交；KeyRequest 申请 → admin 审批选模型
5. 截图验证不再出现 "No available pool for provider"

## 元教训（沉淀新红线）

1. **双源识别**：admin "Configured" 状态的 AIModel.apiKey 和 DistributableKey.encrypted_value 是同一份 key 的两次录入。当配置入口 ≠ 调用入口时，往往就是双源。
2. **授权语义中心**：admin 直觉是"给 alice 开通 X 模型"，不是"给 alice 分配 X 池子"。建数据模型时先回答"用户拿到的是资源还是权益"，权益就别引"资源池"中间层。
3. **migration 不要自作主张迁密文**：加密字段格式不通用（不同 EncryptionService 配置 / 不同 IV / 不同 key version）时，宁可让 admin 手动重配也别静默写入，避免运行时 401。
