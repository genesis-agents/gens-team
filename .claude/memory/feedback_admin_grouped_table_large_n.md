---
name: admin-grouped-table-large-n
description: admin table N>50 条同质资源必须按 category/layer 分组渲染，不能扁平 + 翻页
metadata:
  node_type: memory
  type: feedback
  originSessionId: a67ed222-b220-4885-9230-033fd6d1e8ea
---

admin 任何资源管理 table（skills / tools / providers / models / agents / ...）数据条数 >50 时，**必须**按主要分类字段（layer/category/domain）分组渲染，不能用扁平 table + 分页。

**Why:** 2026-05-11 技能管理截图反馈：149 条 skill 扁平 + 50/page → 用户找不到"哪些层有哪些技能"。工具管理已经做了分组（BuiltinToolsTable），用户对比起来一眼看出"技能页应该学工具页"。

**How to apply:**

1. 视觉模板照抄 `BuiltinToolsTable`：彩色 header section + 段内 sub-table + 段头计数徽章（`{N} 个` `{M} 已启用`） + 图标
2. 主过滤器选"全部"时分组，选具体类别时回到平铺单表（专注当前类别）
3. 段内 sub-table 复用同一行渲染组件，禁止 group 版 / flat 版各自实现（双源）—— 抽出 `XxxTableBody` 子组件
4. 段排序按业务优先级（如 SKILL_LAYERS 的定义顺序），不要按 alphabetical
5. 不要在分组渲染里再叠分页；段内全显示即可，段外段间用滚动条
