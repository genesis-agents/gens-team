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

> ★ 2026-08-03：本节原写死「≥ 2 处引用」。而 chapter-reviewer 的系统提示词里，
> 引用下限是按本章**实际分到的唯一来源数**派生的（`deriveCitationFloor`，可能是
> 0 或 1）—— 2026-05-21 那次修复正是为了治"采得少却要求 ≥2 → 结构性不可满足 →
> 重写循环"。技能文档写死 2 等于把那次修复在同一次 LLM 调用里抵消掉。
> 引用下限**只以系统提示词给出的那个数为准**，这里不再写死任何数字。

- 引用数量下限以系统提示词给出的为准（按本章实际来源数派生），**不要自行假定**
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

> ★ 2026-08-03：本节原写「必须落在 `targetWordCount × [0.7, 1.3]`，超出即 length fails」，
> 与 chapter-reviewer 的系统提示词「**字数永不触发 revise**」正面冲突，而且那个
> `0.7` 正是本轮事故里模型精确贴住的那个锚（生产实测多章恰好写到 0.7×）。
> 字数是否达标由 pipeline 的**交付线闸门**判定（唯一权威，见
> `playground-runtime.config.ts` 的 `chapterMinDeliveryRatio`），不由本技能判。

- 字数**不作为 revise 的理由**：即使章节偏短，只要观点/证据/引用/去模板化达标就 `pass`
- 字数只影响评分里权重最低的那一项；具体判定线由系统注入的提示词给出，
  **不要在这里自行假定任何比例**

## Decision

> ★ 2026-08-03：本节原写「pass = 80–100 / revise < 70」，而 chapter-reviewer 的
> 系统提示词写的是「**≥ 60 分 → pass**」。两个门槛同时进同一次 LLM 调用，模型只能
> 二选一，实测它跟文档 —— 于是 60–79 分的合格章节被判 revise，白烧一轮重写。
> 通过线**只以系统提示词为准**，这里不再写死分数带。

- 通过/打回的分数线由系统提示词给出（唯一权威），本文档不复述
- 任一判据失败 → `revise`，且必须指名是哪一条、在哪一段

`critique` (when revising) MUST be **paragraph-anchored**, naming which
criterion failed where:

```
§2 opens with chapter-heading restatement (criterion 1)
§3 closes with "**Implications**:" template (criterion 2)
§4 lacks any [N] citation (criterion 3)
```

Generic "the chapter could be improved" is rejected.

## Output

> ★ 2026-08-03（Railway 生产日志实证）：输出字段形状以 harness 自动注入的
> `outputSchema` 为准（agent-runner 的 `describeOutputSchemaForLlm`，唯一权威）。
> 本文档**刻意不再复述形状**：此前这里教的形状带一个 schema 里根本没有的模式字段
> （会被模型具象成不存在的 action kind），只给了已废弃的 `critique`，却漏掉
> schema **必填**的 `index` 与 `summary` —— 照文档写必被驳回、白烧重试轮次。
> 同一件事写两份，漂移只是时间问题 —— 所以这里只讲**内容与质量要求**。

内容要求：`issues` 逐条锚定段落与失败判据；总评摘要要一两句话说清结论。
直接 `finalize` 注入的 schema 所要求的对象，不要外套任何 action 包装。

## Hard rules

- Always check all 6 criteria — do not stop at first failure
- `revise` decisions MUST tag which criterion(s) failed
- 分数与 `decision` 必须自洽；具体通过线以系统提示词为准（本文档不写死数字）
- Length-only failures are still `revise` — short or long chapters distort the report
- Do not soften criticism; do not invent failures

## What this skill is NOT

- Not for mission-level review (use `multi-judge-mission-review`)
- Not for citation verification (use `citation-audit`)
- Not for L4 meta-review (use `report-meta-critic`)

This skill operates per-chapter. N chapters call this skill N times. The writer
uses the verdicts to decide which chapters to revise before assembly.
