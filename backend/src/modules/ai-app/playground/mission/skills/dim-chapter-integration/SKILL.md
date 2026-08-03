---
name: dim-chapter-integration
description: Per-dim chapter integration — knit N chapter drafts into a coherent dim section with transitions, dedup, and a closing takeaway
version: "1.0.0"
tags:
  - writing
  - integration
  - per-dimension
  - cohesion
activateFor:
  - writer
  - dim-integrator
  - chapter-knitter
---

# Dimension Chapter Integration Protocol

You merge N parallel-drafted chapters into a single coherent dim section. The
inputs are good chapters; your job is **flow, dedup, and a closing line**.

## Inputs you receive

- `dimensionName` — which dim's chapters you're knitting
- `chapters[]` — each with `index`, `heading`, `wordCount`, `body`

## Integration rules (do all four)

### 1. Transitional sentences

- Between consecutive chapters, add a 1–2 sentence transition that links them
- Transitions name the **substantive** connection (cause → effect, contrast,
  generalization, etc.) — not "additionally" / "moreover" filler

### 2. Deduplication

- When multiple chapters cite the same fact, **keep only the strongest citation**
  (primary source > secondary; recent > old; quantitative > qualitative)
- Drop the redundant restatement; preserve the strongest version inline

### 3. First chapter as the dim opener

- The first chapter's opening becomes the dim's opener — preserve its framing role
- Do not insert a meta-introduction before it ("This dimension covers...")

### 4. Closing takeaway paragraph

- Last paragraph (≤ 5 sentences) summarizes the dim's **core takeaway**
- Tie back to the dim's `rationale` if known
- Do NOT use templated closings like "综上所述" / "in summary"

## Preserve chapter sub-headings

Keep each original chapter heading as a `###` subheading inside the integrated body.
This lets downstream Reviewer trace which chapter each claim came from.

## Output JSON shape

> ★ 2026-08-03 修「技能文档与真实 outputSchema 两套形状」（Railway 生产日志实证）。
> 此前本节教的字段名与 dimension-integrator.agent 的 outputSchema 几乎全不一致，
> 且带一个 schema 里不存在的模式字段。模型照文档写 → schema 连拒 3 次
> (`dimension: Required; chapters: Required`) → 触发"接受当前候选"兜底 → 该维度
> 拿到一份垃圾整合；那个模式字段还被模型具象成了协议里不存在的 action kind
> （日志实测 `unsupported action kind: "integrate"`），白烧整轮迭代。
> 文档说什么模型就写什么 —— 所以这里必须与 schema 逐字段一致。
> 旧字段名刻意不在此复述：把错误形状写进文档，照做型模型照样会照抄。

Emit **exactly** this object as your `finalize` output — no action wrapper, no
`mode` field, no extra keys:

```json
{
  "dimension": "<dim name>",
  "abstract": "<short abstract of this dimension>",
  "keyFindings": ["<finding 1>", "<finding 2>", "<finding 3>"],
  "totalWordCount": <int>,
  "fullMarkdown": "<coherent markdown with ### subheadings + transitions>"
}
```

## Hard rules

- `fullMarkdown` must contain every chapter's `###` heading exactly once
- `keyFindings` must have **3–7** entries (schema-enforced; fewer or more is rejected)
- `totalWordCount` matches actual `fullMarkdown` word count (± 5%)
- Don't drop chapters — every input chapter contributes to the output
- Don't invent new claims during integration — only restructure / re-phrase / remove duplicates
- There is **no `integrate` action** in this protocol. The only action kinds are
  `tool_call`, `parallel_tool_call`, `finalize`. Do the integration yourself and
  `finalize` with the object above.

## What this skill is NOT

- Not for writing original chapters (that's the chapter writer's job)
- Not for reviewing quality (that's `chapter-quality-gate` / `dimension-quality-review`)
- Not for cross-dim integration (that's a higher-level mission-knit step)

This skill produces **one dim's integrated body** — the unit the dimension
reviewer scores and the report assembler stitches.
