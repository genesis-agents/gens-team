---
name: project_radar_keyword_match_mode_2026_05_21
description: AI Radar 关键词匹配语义 + 新增 matchMode（semantic/literal/hybrid）字段与编辑 UI
metadata:
  node_type: memory
  type: project
  originSessionId: cec928f6-be32-40f2-82ee-739559e9e817
---

AI Radar 关键词原本**全程是 LLM 语义评分，无任何字面匹配**：S4 relevance 把 `{name,description,keywords,entityType}` 喂给裁判 LLM 打 0-100 分；discovery 用 keywords 推荐信源；briefing/signal-editor 用 keywords 选 Top-N。**S2 collect 不按关键词过滤**（按已配置源全量拉）。

2026-05-21 新增：

- **编辑 UI**：之前 `RadarTopicConfigDrawer` 有 `keywords` 字段但**根本没渲染编辑器**，且 `page.tsx` handleConfigUpdate 漏传 keywords。新增「关键词」Tab（chip 编辑器，第 4 个 tab）+ 串通 keywords/matchMode。
- **matchMode 字段**（RadarTopic.match_mode VarChar(10) default 'semantic'，迁移 20260530_radar_topic_match_mode）：
  - `semantic`（默认，行为不变）/ `literal`（标题+正文未含任一关键词 → S4 判 0 分跳过 LLM 淘汰）/ `hybrid`（字面命中 LLM 分 +20 上限 100，不淘汰）
  - 逻辑全在 `s4-relevance.stage.ts`，子串大小写不敏感、OR 逻辑、范围=标题+正文（**固定，未做可配置**——用户明确选 YAGNI，未来若要 仅标题/AND 再扩）
  - `RADAR_LITERAL_MISS_REASON` 哨兵在 S4 写、S8 流失归因识别（否则 droppedItems 回落到通用「相关性 0 < 40」）

**Why:** 关键词匹配是软语义提示不是布尔过滤，改 keywords 只影响**下次「重新精选」**、不重算历史 item；用户常误以为是字面匹配。
**How to apply:** 改 radar 关键词/相关性行为先看 S4；literal/hybrid 复用现有 accepted 门槛（rel≥60 & qual≥50 @ S8），不要在 S2 加过滤。相关 [[project_radar_pr_dr2_implementation_2026_05_18]] [[project_ai_radar_v1_2026_05_16]]
