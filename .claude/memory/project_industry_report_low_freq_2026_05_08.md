---
name: industry-report-low-freq-2026-05-08
description: 2026-05-08 industry-report-search 调用频率低真因：leader plan prompt 缺 preferIds 启发式（commit 6a993d2c3）
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

## 2026-05-08 industry-report-search 调用频率低排查

**commit**：`6a993d2c3` (push main)
**用户痛点**："industry-report 工具使用频率很低，请系统排查，这是高质量数据源"

## 全链路验证（DB 真数据）

| 检查项                               | 状态                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| 工具注册（IndustryReportSearchTool） | ✅ 已注册                                                |
| DB tool_configs                      | ✅ 18 sources 全 enabled（SemiAnalysis/a16z/Gartner 等） |
| researcher tool recall               | ✅ 10/10 含 industry-report-search                       |
| Leader tool recall                   | ✅ 25 工具全召回                                         |
| **Leader plan preferIds 决策**       | ❌ **真因**                                              |

## 实证调用频率（最近 7 天 2629 次）

```
web-scraper:               1035 (39.4%)
web-search:                 801 (30.5%)
rag-search:                 179 (6.8%)
industry-report-search:     168 (6.4%)  ← 仅 web-search 1/5
arxiv-search:               136 (5.2%)
```

industry-report-search 不是 0，但远低于 web-search。

## 真因

Leader plan.md 决策启发式只列 category 无 preferIds：

```
商业 / 市场 / 竞品 → category=web / data    （旧）
```

让 LLM 误以为 web-search 通用即可，没显式指导何时优先 industry-report-search。

## 修复（plan.md + SKILL.md 同步）

```
商业 / 市场 / 竞品 / 行业趋势 / 战略分析 → category=web / data,
  preferIds=[industry-report-search]                          （新）
学术 → preferIds=[arxiv-search]
代码 → preferIds=[github-search, hackernews-search]
财经 → preferIds=[finance-api, industry-report-search]
```

## How to apply

- 工具调用频率排查必须 4 维度全验：注册 / 配置 / 召回 / **plan preferIds**
- 单纯让工具 available 不够，要让 Leader 知道**何时主动 preferred**
- 类似 reference_topic_insight_zero_results_2026_05_05.md（capabilityResolveTools 空 context 链路）— 工具 enabled 不等于会被调用

## 元教训

prompt 决策启发式必须**同时给 category + preferIds**，不能只给 category 让 LLM 自由选 — 默认行为永远倒向最通用的 web-search。

## 验证

效果在 next mission 里查 `agent_playground_mission_events` 中 industry-report-search 占比是否上升。当前 baseline 6.4%，目标提升到 10-15%（商业类维度比例约 30%，理论 industry-report-search 应占总调用 12-18%）。
