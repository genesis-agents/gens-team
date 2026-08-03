---
name: chapter-quality-gate
description: Per-chapter QA gate — 6-criterion check (independent thesis / de-templating / evidence / argument / no-clichés / length) with pass-or-revise decision
version: "1.0.0"
tags:
  - review
  - chapter-level
  - writing-quality
  - quality-gate
activateFor:
  - chapter-reviewer
  - section-quality-gate
  - writer-self-eval
---

# Chapter Quality Gate Protocol

You inspect **one chapter** against 6 industry-aligned criteria and decide
`pass` or `revise`. The decision feeds the writer's revision loop.

## Inputs you receive

- `chapter.index`, `chapter.heading`, `chapter.body` — the chapter under review
- `chapter.wordCount`, `targetWordCount` — actual vs target

## 6 criteria (check all, in order)

### 1. Independent thesis claim per paragraph

- ✓ Each paragraph opens with a falsifiable, independent judgment
  ("This means...", "The core reason is...", "We cannot conclude that...")
- ✗ Paragraph opens by restating the chapter heading, or by paraphrasing evidence
  without a judgment

### 2. De-templating

- ✓ Each chapter has its own opening / closing rhythm
- ✗ Same template across all chapters: `> **核心判断**:` first paragraph + `**Implications**:`
  closing paragraph. If any 2 chapters in the report share the exact same opening
  / closing template, the chapter fails this criterion.

### 3. Evidence sufficiency

- ≥ 2 `[N]` citations in the chapter
- Each citation contains specific number / date / entity
- Citations are embedded **inside argument sentences** (not piled at paragraph end)

### 4. Argumentation completeness

- 3–5 middle paragraphs in the chapter (not counting opening/closing)
- Each middle paragraph elaborates ONE keypoint in 100–300 characters
- No telegram-style one-line paragraphs

### 5. No clichés / templated openings

Reject these openings (and analogous templates):

- "随着 X 的发展" / "with the development of X"
- "在当今" / "in today's age"
- "众所周知" / "as is well known"
- "综上所述" / "in summary"

These signal stale boilerplate. Replace with content-specific openings.

### 6. Length compliance

- `chapter.wordCount` must lie in `targetWordCount × [0.7, 1.3]`
- Outside this band → length fails

## Decision

| Outcome            | Score range | Conditions               |
| ------------------ | ----------- | ------------------------ |
| `decision: pass`   | 80–100      | All 6 criteria satisfied |
| `decision: revise` | < 70        | Any one criterion fails  |

`critique` (when revising) MUST be **paragraph-anchored**, naming which
criterion failed where:

```
§2 opens with chapter-heading restatement (criterion 1)
§3 closes with "**Implications**:" template (criterion 2)
§4 lacks any [N] citation (criterion 3)
```

Generic "the chapter could be improved" is rejected.

## Output JSON shape

> ★ 2026-08-03 修「文档形状 ≠ 真实 outputSchema」：此前本节教的形状带一个 schema
> 里根本没有的 `mode` 字段（会被模型具象成不存在的 action kind），只给了已废弃的
> `critique`，却**漏掉 schema 必填的 `index` 与 `summary`** —— 模型照文档写就必然
> 被 schema 驳回、白烧重试轮次。下面这份与 chapter-reviewer.agent 的 Output 逐字段一致。

```json
{
  "index": <chapter index int>,
  "decision": "pass" | "revise",
  "score": <int 0-100>,
  "issues": [
    {
      "severity": "must-fix" | "should-fix" | "nice-to-have",
      "dimension": "evidence" | "logic" | "structure" | "citation" | "length" | "style",
      "pointer": "<e.g. §2 第 3 段>",
      "issue": "<one-sentence problem>",
      "suggestion": "<one-sentence fix, verb-first>"
    }
  ],
  "summary": "<1-2 sentence overall verdict, ≤ 300 chars>"
}
```

- `issues` 最多 6 条；`pass` 时可以是空数组
- `summary` 必填且 ≤ 300 字符
- 没有 `mode` 字段，也没有 `integrate` 之类的 action —— 直接 `finalize` 上面这个对象

## Hard rules

- Always check all 6 criteria — do not stop at first failure
- `revise` decisions MUST tag which criterion(s) failed
- `pass` decisions MUST score ≥ 80; `revise` MUST score < 70 (the gap is intentional)
- Length-only failures are still `revise` — short or long chapters distort the report
- Do not soften criticism; do not invent failures

## What this skill is NOT

- Not for mission-level review (use `multi-judge-mission-review`)
- Not for citation verification (use `citation-audit`)
- Not for L4 meta-review (use `report-meta-critic`)

This skill operates per-chapter. N chapters call this skill N times. The writer
uses the verdicts to decide which chapters to revise before assembly.
