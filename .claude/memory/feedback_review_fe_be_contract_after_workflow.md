---
name: feedback_review_fe_be_contract_after_workflow
description: workflow/子 agent 生成的前后端联动，必须人工核对响应契约——tsc 被 apiClient.get<T> 泛型断言瞒过，形状错配只在运行时炸
metadata:
  node_type: memory
  type: feedback
  originSessionId: ddcd77c4-e70e-46b7-960b-48ea2314f65d
---

workflow / 子 agent 生成"前端 store 接后端 CRUD"这类联动后，**tsc 全绿不等于对**。`apiClient.get<T>()` / `post<T>()` 的泛型是**编译期断言、无运行时校验**：后端返回的真实形状若与前端声明的 T 不一致，tsc 照样 0 error，但运行时整页坏。

**Why（2026-06-07 一人公司 OS W2）**：workflow 把 companyStore 改成 API-backed，loadCompany 直接 `set({ hired: snap.hired, teams: snap.teams, ceoId: snap.profile.ceoId })`。但后端 Prisma 行形状 ≠ 前端 UI 形状：

- 后端 `hired[].id` / 前端要 `instanceId`；后端无 `seniority`/`avatarGradient`（UI 字段）
- 后端 `teams[].members[{hiredAgentId}]` / 前端要 `memberIds: string[]`
- 后端 `profile.ceoHiredAgentId` / 前端读 `profile.ceoId`
- 后端 workflow `origin:'marketplace'` / 前端类型 `'market'`
  tsc 全过（泛型断言），但 memberOf(instanceId) 全 miss、头像渐变空、seniorityLabel 崩。修法：前端加 adapt 层（backend 行 → FE 形状，UI 字段如 avatarGradient 按 id 哈希补）。

**How to apply**：审查 workflow/agent 的 FE-BE 联动时，**逐字段比对**「后端 service/repository 实际返回形状」与「前端 store/组件消费形状」，重点：主键名(id vs instanceId)、关系展开(members[] vs memberIds 扁平)、命名差异、UI-only 字段(头像/色/资历，后端不该存→前端补)、枚举字面量。tsc 0 不是验收标准，必要时真跑或读两端类型对齐。关联 [[feedback_lint_staged_stash_safety]]（同次 workflow 越权建的孤儿文件被 lint-staged stash 丢弃，恰好无引用）。
