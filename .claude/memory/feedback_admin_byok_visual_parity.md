---
name: BYOK 与 admin 同概念 UI 必须视觉一致
description: 对管理员暴露的"密钥管理表格"与对终端用户暴露的"BYOK 密钥管理"是同一概念两个视角，组件结构必须一致（真 <table>、列结构、search/filter 布局），不要一处卡片一处表格
type: feedback
originSessionId: b563b5ca-9b52-4741-90db-57cabe79a67c
---

`/admin/access/secrets` 的 SecretsManager 用真 `<table>` + 列：
**Name / Category / Value / Status / Access Count / Actions**

`/me/ai?tab=keys` 的 BYOK 历史是 ProviderKeyCard 卡片+内联展开 form。
两者底层都是同一个"密钥管理"概念，admin 视角看全用户、user 视角看自己，
**UI 不一致让用户认知割裂**（用户原话"完全和其他页面不一致"）。

## How to apply

新增/重构面向用户的某能力时，如果 admin 已经有同概念的管理界面：

1. **查 admin 实现**：`grep` admin 同概念组件（如 SecretsManager、ModelsManager），
   照搬列结构 / 头部布局 / 搜索过滤位置 / 操作图标
2. **不要一边表格一边卡片**：admin 用 `<table>` 时 user 也用 `<table>`；
   admin 列名英文 user 也英文，column header 至少视觉对齐
3. **共享 drawer / modal**：admin 已有的 SecretKeysDrawer / SecretForm 这种
   detail 抽屉，BYOK 应直接复用而不是另起一份（已有 UserApiKeyDrawer 共享
   MultiKeyTable，但外层 tab 还是卡片就白搭）
4. **状态枚举对齐**：admin "Active / Inactive"，BYOK 至少给同样 pill 风格
   （Personal / Donated / Not configured 都用 rounded-full px-2 py-1 同款）
5. **commit `bb52c44a4` 是这次的范例**：BYOK 表格列结构、搜索过滤栏、图标
   按钮全部对齐 SecretsManager.tsx

## 反向教训：feature gating 不是 UI 双轨化的理由

ProviderKeyCard 给用户的"内联展开 + mode 选择 + advanced settings"原本
意图是"用户友好"——但代价是和管理员视图脱节。**简洁一致 > 信息密度堆砌**。
如需高级选项，统一进 drawer / modal，外层视图保持表格。
