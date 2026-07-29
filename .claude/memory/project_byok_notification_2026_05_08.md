---
name: byok-notifications-and-provider-drop-2026-05-08
description: 2026-05-08 KeyRequest 全生命周期接入 W4 通知系统 + 用户提交不再选 provider（commits 06b17da46/8f9a6cda2/955d275bc）
type: project
originSessionId: 7d028ab3-e546-4f0f-9b44-f6ee8ffbc81d
---

2026-05-08 BYOK 三连改：

1. **commit 06b17da46** —— hotfix admin GrantKeyModal 撤销假成功（fetch 加 status=ACTIVE + 按钮按状态守卫）
2. **commit 8f9a6cda2** —— KeyRequest 接入 W4 通知 + 删用户侧 provider 选择
   - NotificationType +4 枚举：KEY_REQUEST_SUBMITTED/APPROVED/REJECTED + KEY_GRANTED
   - NotificationPresetsService +4 preset 方法（admin fan-out / 用户单点回推）
   - KeyRequestsService.create→fan-out admin / approve→KEY_REQUEST_APPROVED / reject→KEY_REQUEST_REJECTED
   - KeyAssignmentsService.grantBatch→KEY_GRANTED（admin 主动授权）
   - 用户 RequestKeyModal 删 provider 字段；KeyRequest.provider 改 nullable
   - admin KeyRequestsManager 审批模态展示**所有** enabled AIModel 按 provider 分组
3. **commit 955d275bc** —— fix approve 路径 grantBatch 加 skipUserNotification=true，防 KEY_GRANTED + KEY_REQUEST_APPROVED 双重通知

**Why**：用户 3 次反馈"admin 未必有对应 provider"+"provider 持续更新"+"用户不要指定具体模型"；同时反馈"撤销显示成功实际没撤销"

**How to apply**（未来类似改造）：

- 通知接入 ai-infra→ai-infra 直接注 `@Optional() NotificationPresetsService` + fire-and-forget；ai-app→ai-infra 走 EventEmitter2 + notifications-bridge listener
- 同一业务事件多路径触发时，下游必须有 `skipUserNotification` 类似闸防双发
- 用户 fan-out 通知用 batchCreateNotifications（DTO 不支持 relatedType/relatedId，把 ID 塞 metadata）
- 数据库 enum 加值用手写 SQL `ALTER TYPE T ADD VALUE IF NOT EXISTS 'X'`，不能放 DO $$ EXCEPTION 子事务

**Railway prod 已手工执行**：

- 20260508b_notification_type_key_request（4 enum 值）
- 20260508c_key_request_provider_nullable（DROP NOT NULL）
- 已 INSERT 进 \_prisma_migrations 防 deploy-migrations 重跑

**未做**（follow-up）：

- 侧栏 "Key Requests" 红点徽章（基于通知未读数已可推导，但无独立 pending-count 端点）
- /admin/access/users 用户行内 "申请中 N" 提示
- 邮件通知（W4 系统已支持 email 字段，KeyRequest 类暂未启用）
