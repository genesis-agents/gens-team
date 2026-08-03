---
name: dimension-quality-review
description: Per-dimension quality scoring — how to grade a dimension well (axis names, bands and output shape come from the agent prompt + injected schema, not from this doc)
version: "1.0.0"
tags:
  - review
  - quality
  - scoring
  - per-dimension
activateFor:
  - quality-judge
---

# Dimension Quality Review Protocol

You score one dimension's integrated body. **轴名、轴数、分数线与 overall 口径
全部由系统提示词与注入的 schema 给出**，本文档不复述（见下方说明）。

> ★ 2026-08-03 重写（全量审计 + 生产日志实证）：本节此前列的输入字段名
> （`dimensionName` / `targetWordCount` / `integratedBody`）在 agent 的 Input
> schema 里**一个都不存在**，并且教了一套 5 轴
> （depth/breadth/clarity/accuracy/relevance）+ 等权平均 + 分数带 —— 而
> `dimension-quality-judge.agent` 的 schema 是**另外 6 轴**
> （breadth/depth/evidence/coherence/freshness/sources_sufficiency），外加必填的
> `dimension`、`grade` 枚举与 `summary`。
>
> 两套东西进同一次 LLM 调用（skill 正文由 skill-activator 注入），模型照文档写 →
> 字段与轴名全不匹配 → 该 agent 走 `loop: "simple"`，**一次校验不过即
> `state=failed`**。生产日志里的
> `[per-dim grade] dim "..." 首次评分 state=failed，容错重试一次` 就是这么来的。
>
> 轴名、轴数、分数线、overall 口径**一律以系统提示词与注入的 schema 为准**
> —— agent 的提示词里已经逐轴给了定义（广度 / 深度 / 证据 / 连贯性 …）。
> 本文档只讲**怎么评才算评得好**，不再复述任何契约。

## 评分方法（不是评分口径）

- **对着正文给分，不对着印象给分**：每个轴的结论都要能指到具体段落 / 具体引用
- **不为显得严谨而压分**，也**不为客气而抬分**——两种都是失真
- `summary` 必须点出至少一处**具体**的强项或弱项，不要写"整体尚可"这类空话
- 相对评分的轴（提示词里标注的那几个）要按本 mission 的实际供给比较，
  不要拿绝对理想值当基准——采集受限时苛求绝对量是结构性不可满足

## What this skill is NOT

- Not for cross-dim reconciliation (that's the reconciler's job)
- Not for mission-level review (that's the multi-judge mission review)
- Not for citation verification (that's the verifier's job)

This skill produces **one dim, one score block** — multiple dims call this skill in parallel.
