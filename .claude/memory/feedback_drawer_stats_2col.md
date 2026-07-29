---
name: drawer-stats-cards-2-col
description: "AdminDrawer ≤640px 渲染 AdminStatsCards 必须 columns={2}；4 卡 + text-2xl + 大数 = mid-comma wrap"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a67ed222-b220-4885-9230-033fd6d1e8ea
---

在 `AdminDrawer`（默认 size="lg" = 640px 宽）内渲染 `AdminStatsCards`，**必须**传 `columns={2}`，不能用默认的 4 列。

**Why:** 640px - 48px padding - 3×16px gap = 每卡 ~135px。`text-2xl font-bold` 数字超 10 字符（如 31,199,864）会 break in mid-comma group，显示成 "31,199,86\n4"，丑且数值难读。2026-05-11 用户管理 UserCreditsDrawer / UserBillingDrawer 截图反馈触发。

**How to apply:**

1. 任何 `<AdminStatsCards />` 在 `<AdminDrawer>` 内一律 `columns={2}`
2. `<AdminStatsCards />` 在 page-top（AdminPageLayout 下、≥lg 视口）保留默认 4 列
3. 卡片 value 永远加 `tabular-nums` + `truncate` + `title={value}` 兜底（已加在共享组件里）
4. 卡片个数仍受 4 上限约束（standards/20 § 1）—— 2x2 是上限，不要为了避免 wrap 而塞 6 卡
