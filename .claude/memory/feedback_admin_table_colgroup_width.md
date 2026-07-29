---
name: feedback_admin_table_colgroup_width
description: 'admin 同分类多 section 表格必须 table-fixed + colgroup 显式 width 百分比，否则不同分类 toolId 长度不一会"东倒西歪"'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

admin 页面同一 tab 内含多个 category section（按工具分类彩色分组的 table 列表），
每个 section 必须用 `table-fixed` + `<colgroup>` 显式 width 百分比，否则不同
section 列宽随内容长度变化对不齐，看起来"东倒西歪"。

**Why**：2026-05-12 Screenshot_61 用户反馈。BuiltinToolsTable / APIServicesTable /
ScrapingSourcesTable 之前用 `min-w-full` 让浏览器自动分配列宽。toolId 长短不一
导致：内置工具 tab 里 "web-search" 行的"名称"列窄，"perplexity-deep-research"
行的列宽。切到第三方工具 tab 时列宽又变 → "东倒西歪"。
修法 commit `1d1cac6c1`：所有三 tab 统一 `table-fixed` + 同款 colgroup 百分比
配方（24/18/14/12/14/8/10），加 truncate 限制长内容溢出。

**How to apply**：

- admin 多 section / 多 tab 表格必须 `<table className="min-w-full table-fixed">`
- 配 `<colgroup><col style={{ width: 'X%' }} /></colgroup>`
- 同 tab 内多 section + 跨 tab，**百分比配方一致**
- 文本类列加 `max-w-[Xpx] truncate whitespace-nowrap` 防溢出
- 长内容用 `title=` 给悬停 tooltip 还原全文
- 新加列前先核对总和不超 100%；列数变化时跨 tab 同步更新配方

关联：[[feedback_admin_grouped_table_large_n]] [[feedback_admin_workflow_must_match_intuition]]
