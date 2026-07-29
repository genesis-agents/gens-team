---
name: feedback-tool-classify-by-id-not-category
description: 工具分组按 toolId 精确匹配，不要靠 DB category 字段，因为 category 普遍粗粒度，落不进具体桶
metadata:
  node_type: memory
  type: feedback
  originSessionId: ce962b97-346a-4c98-ae26-9cff763089b3
---

工具/资源分组 UI 不要单靠 DB 里的 `category` 字段做分类——很多时候 backend 给的 category 是粗粒度的（如 "external" / "information" / "generation"），细分桶（网页搜索/学术/政策）无法命中，最后全部塞进"其他"组。

**Why:** 2026-05-11 admin 工具管理 / API 服务工具 tab 所有工具都被归入"其他"组，因为 USE_CASE_GROUPS 期望 category="external-search" 但 DB 实际只给 "external"。用户截图反馈"为什么API服务工具没有分类呢"+"用一个块括起来，并且用不同颜色区分"。

**How to apply:**

1. 工具分组优先靠 **toolId 精确匹配**（业务语义最直接，作者意图就是 toolId → 桶）
2. category 关键词作 **兜底**（toolId 没命中时再用），不是主路径
3. 每个用途桶配主题色（border/headerBg/headerText/badge 一套）：仿 MCP 工具市场视觉
4. 同样模式适用：admin/models 按 modelId / admin/skills 按 skillId

反模式：

- ❌ 用 backend 单字段 category 做分桶就以为够细
- ❌ 全部塞"其他"组但 UI 上没有任何反馈"这里分桶失败了，需要补 toolId 映射"
- ✅ 优先 toolId map，未命中走 category 兜底，未命中再"其他"，分级 fallback
