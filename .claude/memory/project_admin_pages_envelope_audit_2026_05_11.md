---
name: admin-pages-envelope-audit-2026-05-11
description: 2026-05-11 一轮 admin UI 截图反馈批量修：4 类 envelope/数据 shape 问题 + 1 类 drawer 4-card 大数 wrap + 2 类位置/分组 UX
metadata:
  node_type: memory
  type: project
  originSessionId: a67ed222-b220-4885-9230-033fd6d1e8ea
---

2026-05-11 单轮 8 个截图反馈集中暴露 admin 页面三类系统性问题（commit pending push）：

## 1. ResponseTransformInterceptor 解包遗漏（4 处）

| 页面                                                               | 文件                                                                      | 错误                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 用户管理 → 登录历史                                                | `frontend/hooks/domain/useAdminUsers.ts:198`                              | `result.history` 永远是 undefined（应解 `result.data.history`）→ 显示"暂无登录记录" |
| 数据管理 → 数据治理                                                | `frontend/components/admin/data-management/DataQualityManagement.tsx:127` | `metricsData.data` 是 `{ data: [...], stats: {...} }` 不是数组 → `.filter` 崩       |
| AI Harness → 治理评估 → Guardrails                                 | `frontend/app/admin/ai/guardrails/content.tsx:44`                         | `data.input.length` undefined（Pipeline 未 ready 时后端可能 null）→ 渲染期炸        |
| （已正确处理：useAdminKeyRequests / apiClient.get / Eval content） |                                                                           |                                                                                     |

**Why:** 全局 ResponseTransformInterceptor 包 `{ success, data: T, metadata }`，每个直写 `await res.json()` 的地方都得自己解；Karpathy 原则"暴露多义性"指的就是这种数据 shape 不确定的地方必须三件套（解包 + Array.isArray + 兜底）。

**How to apply:**

1. 修复模板（参考 commit 8ed0... 后续 push）：
   ```ts
   const result = await res.json();
   const payload = result?.data ?? result;
   const list = Array.isArray(payload?.field) ? payload.field : [];
   ```
2. 渲染前所有 `.length` / `.filter` / `.map` 调用必须确认数组源
3. 引入 ErrorBoundary 后崩溃面板会显示错误详情，但根因仍要修 — 不要靠 ErrorBoundary 吞错
4. **新代码尽量走 `apiClient.get<T>()`**（已自动解包）；裸 fetch 视为遗留路径

## 2. AdminDrawer 4-Card 大数字 wrap（2 处）

| Drawer            | 问题                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| UserCreditsDrawer | 大额积分（如 31,199,864）在 4-col 窄 drawer 里 wrap 成"31,199,86\n4" |
| UserBillingDrawer | 同上                                                                 |

**根因：** `AdminStatsCards` 默认 `lg:grid-cols-4`，drawer 宽度 640px - 48px padding - 3x16px gap = 528 / 4 = 132px 每卡，`text-2xl` + 10 字符数字超宽。

**修复：** `AdminStatsCards` 加 `columns?: 2 | 4` 默认 4；drawer 传 `columns={2}` → 2x2 布局，每卡 ~280px 宽，10 字符数字 fits。

**Rule（写入项目脑模型）：** 在 `AdminDrawer` 里渲染 `AdminStatsCards` 一律 `columns={2}`；只有页面 top（lg viewport ≥1024px）用默认 4。

## 3. 顶部 Action 按钮位置/视觉一致性

**用户管理"待审批"按钮** 原本在 stats cards 上方独立一行 + amber bordered 弱化样式，用户截图反馈："建议保持和添加用户的按钮在一个位置，颜色格式也和添加用户一致，挪到上面去"。

**修复：** 抽出 `UsersPendingApprovalButton`（同 `UsersAddButton` 同样式 bg-blue-600 + 内嵌白色半透徽章），状态上移到 page.tsx → `actions={<div>...</div>}`，UsersSettings 收 `showPendingApproval/setShowPendingApproval` props。

**Rule：** admin top-actions 区是"用户即将做的事"的语义中心；不要把入口按钮散落在 stats cards / 工具栏间 —— 全部聚在 `AdminPageLayout.actions` 里、同等视觉权重。

## 4. 技能管理 — 学工具管理分组

149 个本地技能扁平列表，用户截图反馈"应该学习工具管理，进行分组显示"。

**修复：** `LocalSkillsTable` 当 `layerFilter='all'` 时按 `s.layer` 分组渲染（彩色 header section + 段内子 table + 各段计数徽章），单 layer 过滤时回到平铺。抽出 `SkillTableBody` 子组件避免双源。

**Rule：** 任何 N>50 条同质资源的 admin table 一律按 category/layer 分组渲染，不要靠分页翻；分组 header 必须配色+图标+计数，让用户一眼看到分布。

## 5. AI Harness Memory — Recent Processes 行点击应弹抽屉

用户截图反馈"点击无法抽屉展开，没有详情"，原行点击只 setProcessId + fetchMemory（结果在页面下方，用户不知道）。

**修复：** 加 `drawerProcess` state + `handleProcessRowClick` 同时 setProcessId、fetchMemory、打开 AdminDrawer 显示进程元数据 + 内嵌 memory entries 子表。

**Rule：** admin 列表行点击不能只是"软选择 + 在别处加载"；要么直接跳详情页，要么开抽屉展示完整详情 —— 让点击事件有可视反馈。

## 元教训

- **截图反馈优先级最高**：用户一句"点不开抽屉"等于一个 P0 bug ticket
- **直接 await res.json() 是反模式**：渐进替换为 apiClient.get<T>() 才是治本
- **AdminStatsCards 在 drawer 里默认 2 列**：把这条加进 `standards/20-admin-ui-design.md` § stat cards
