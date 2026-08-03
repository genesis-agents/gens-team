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

## Output

> ★ 2026-08-03（Railway 生产日志实证）：输出字段形状以 harness 自动注入的
> `outputSchema` 为准（agent-runner 的 `describeOutputSchemaForLlm`，唯一权威）。
> 本文档**刻意不再复述形状**：此前这里写的字段名与 dimension-integrator.agent 的
> schema 几乎全不一致，模型照文档写 → schema 连拒 3 次
> (`dimension: Required; chapters: Required`) → 触发"接受当前候选"兜底 → 该维度
> 拿到一份垃圾整合；文档里那个模式字段还被模型具象成协议里不存在的 action kind
> （日志实测 `unsupported action kind: "integrate"`）。
> 同一件事写两份，漂移只是时间问题 —— 所以这里只讲**内容与质量要求**。

直接 `finalize` 注入的 schema 所要求的对象，不要外套任何 action 包装。

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
