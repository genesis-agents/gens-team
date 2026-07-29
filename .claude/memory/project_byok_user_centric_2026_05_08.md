---
name: BYOK 授权语义重构（用户中心 + 模型粒度 + 周期续期）
description: 2026-05-08 把 admin 授权入口从 Key 池侧迁到用户列表行内，加 modelId 粒度 + RECURRING 周期续期 + STALE 联动。PR-A/B/D 已落地，PR-C/E 待补
type: project
originSessionId: 3ec5f5a4-a3af-4582-8536-bbe9178f3c3e
---

## 背景

用户截图 `debug/Screenshot_17.png` 指向 `/admin/access/users` ACTIONS 列红框位置，明确要求"授权和分发应该在用户管理侧完成"。揭示当前架构把"授权语义中心"放错位置——3 个一级页面（distributable-keys / key-assignments / key-requests）都从 Key 池视角组织，用户工作流（5/7 场景从用户切入）无入口。

## 关键设计决策（用户拍板）

1. **入口语义中心 = 用户列表行内**（截图红框 ACTIONS 列加 🔑 按钮）
2. **Modal 选模型不选秘钥**：admin 直觉是"alice 能用什么模型"，不是"alice 拿到哪个池"
3. **支持多选 + 跨 provider**：一次发 GPT-4o + Claude + Gemini 三个权益（底层 N 条 KeyAssignment）
4. **支持周期续期**：单次 ONE_TIME 或 RECURRING（每月/每周/每年自动 reset spendCents=0）
5. **唯一约束 [userId, provider, modelId] 三键**：避免旧数据 modelId='_' 冲突；KeyResolver 优先具体 model 后 fallback '_'
6. **schema 兼容策略 modelId='\*' 通配符**：旧数据零迁移，新数据可指定具体 modelId
7. **联动 cron**：DistributableKey 停用 → 关联 ACTIVE → STALE（双向，重启池时自动恢复）

## 落地清单

- ✅ PR-A `29dd7aecf` schema 升级 modelid 粒度 + 周期续期 + stale 状态（注：migration.sql 在 `844550544` 别 session commit，因 lint-staged 吸入事故）
- ✅ PR-B `7a02245b2` grantbatch 模型粒度授权 + 周期续期 cron + stale 联动
- ✅ PR-D `d030531d3` 用户列表 actions 列加 keyround 按钮 + 模型多选弹窗
- ✅ PR-C `3ca7980ba` 收敛入口 — 删除 key 池侧旧 modal + 加用户管理跳转
- ✅ PR-E `a7f60c7eb` 47 tests pass（grantbatch + 双查路径 + cron 周期续期 + stale 联动）

## 评审记录

- R1（4 路）：A NO（缺 down SQL）/ B NO（跨月溢出 + STALE 反向恢复）/ C NO（envelope 假设）/ D YES
- 修 4 项 P0：down SQL 包 BEGIN/COMMIT / computeNextRenewalAt MONTH/YEAR clamp / 删反向 STALE→ACTIVE / `useApiGet<ActiveModel[]>` 裸数组
- R2（3 路重审）：A YES / B YES / C YES → 全局 4/4 共识达成（feedback_consensus_must_iterate_to_all_yes 满足）

## 待用户验证（CLAUDE.md `feedback_e2e_must_visit_ui` 红线）

1. `cd backend && npx prisma migrate deploy` 验证旧数据自动 modelId='\*' + validityType='ONE_TIME' 回填
2. UI 走通：`/admin/access/users` → 任一行 🔑 → 弹 Modal → 选 2 个模型 → RECURRING 月度 → 提交
3. KeyResolver 行为：alice 调 GPT-4o → 命中具体 modelId='gpt-4o' assignment；alice 调 GPT-3.5 → fallback modelId='\*'
4. cron 联动：admin 停用某 Key 池 → 1 小时内关联 assignment 变 STALE；重启 → 恢复 ACTIVE

## 涉及文件（用于回查）

- `backend/prisma/schema/models.prisma:9003-9097`
- `backend/prisma/migrations/20260508_byok_model_grain_recurrence/migration.sql`
- `backend/src/modules/ai-infra/credentials/key-assignments/key-assignments.service.ts`（grantBatch / findBestPoolForProvider / computeNextRenewalAt）
- `backend/src/modules/ai-infra/credentials/scheduling/byok-maintenance.scheduler.ts`（3 cron）
- `backend/src/modules/open-api/byok-admin/admin-key-assignments.controller.ts`（`POST /grant`）
- `frontend/components/admin/byok/GrantKeyModal.tsx`（新建）
- `frontend/components/admin/UsersSettings.tsx`（KeyRound 按钮 + state + Modal 渲染）

## 元教训

被这次 session 打回 2 次（"完全没有这个链接 / 选模型还是选秘钥"），沉淀两条新红线到 feedback：

1. 截图反馈优先级最高，admin 工具入口必须匹配工作直觉，不是按数据模型组织
2. 涉及"选什么"的 Modal 设计必须**先回答语义中心**（选资源还是选权益），再写代码
