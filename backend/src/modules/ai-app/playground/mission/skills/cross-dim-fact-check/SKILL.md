---
name: cross-dim-fact-check
description: Cross-dimension reconciliation protocol — extract fact table, detect conflicts/overlaps/gaps, build figure candidate pool from N parallel research streams
version: "1.0.0"
tags:
  - reconciliation
  - fact-checking
  - quality
  - research
allowedTools:
  - web-search
  - fetch
  - rag-search
activateFor:
  - reconciler
  - fact-checker
  - cross-dim-reviewer
---

# Cross-Dimension Fact Reconciliation Protocol

When N parallel research streams have completed and downstream synthesis (analyst / writer)
is about to start, run this reconciliation pass. **Do NOT produce new research** — your job
is to align, deduplicate, and surface conflicts.

## Inputs you will receive

<!-- 2026-08-03 对齐：字段名照 reconciler.agent.ts 的 `const Input` schema 抄，
     此前漏了 plan.themeSummary 与 findings 的三个子字段，模型只能靠猜。 -->

- `topic` and `language`
- `plan.themeSummary` — the mission's overall framing
- `plan.dimensions[]` (`id` / `name` / `rationale`) — what each stream was supposed to cover
- `researcherResults[]` — per dimension: `dimension`, `summary`,
  `findings[]` (`claim` / `evidence` / `source`), and `figureCandidates[]`

## How to reconcile well

<!-- 2026-08-03 去竞争描述：原标题写死「5-step protocol (execute in order)」，
     但 agent 系统提示词里是 7 步（第 7 步 ACH 竞争性假设分析本文档从未提过）。
     技能文档以高优先级 reminder 注入同一次调用，一旦声称协议只有 5 步，模型就
     照这份少做。步骤清单与输出字段一律以系统提示词为准，本文档只讲「怎么做得好」。 -->

**权威口径**：完整步骤清单、输出字段、以及所有数值门槛（条数 / 比例 / 长度 / 上限）
**以系统提示词为准** —— harness 会把真实 outputSchema 一并注入。下面只讲判断方法。

### Extract fact table

Scan all findings, distill `(entity, attribute, value, sources[])` triples.

- `sources` is a list of URL or finding-source strings — multiple sources increase confidence
- Each fact gets a stable id like `fact-1`, `fact-2`, ...
- Prefer facts that downstream synthesis actually needs to cite over trivia that merely fills the table

### Detect conflicts

Same `(entity, attribute)` with different values → flag as conflict.

- `resolutionType`:
  - `preferred-one` — one source clearly more credible (gov / academic > blog) → set `preferredFactId`
  - `kept-both` — sources equally credible → keep both with annotation
  - `flagged-unresolved` — last resort, only when the inputs genuinely cannot settle it;
    reaching for it because deciding is hard is the failure mode this step exists to prevent
- `rationale` must state _why_ that resolution was chosen — name the deciding factor
  (source authority, recency, measurement method), not just restate the conflict

### Detect overlaps

Cross-dim claims with similar meaning (semantic, not exact-match).

- `similarityScore` 0–1 (judge by reading; you don't run embeddings)
- `resolutionAction`:
  - `merge-into-cross-dim` — core finding shared across dims → write once in cross-dim section
  - `keep-both` — different angle on same topic → keep in respective dims
  - `drop-from-second` — verbatim duplicate → keep in primary dim only

### Detect gaps

`plan.dimensions[i].rationale` promised aspects that findings don't cover.

- `severity: "critical"` if gap breaks the dim's purpose
- `severity: "minor"` if peripheral

### Aggregate figure candidate pool

Aggregate `researcherResults[*].figureCandidates` into a single deduplicated array.

<!-- 2026-08-03 删掉写死的「Cap at 20 figures」：上限由系统提示词 + validateBusinessRules
     持有，文档再抄一份，改一处就漂一处。排序方法是本技能的价值，保留。 -->

- Deduplicate by `sourceUrl` — keep the entry with the highest `relevanceHint`
- Rank by `relevanceHint=high` first, then by caption informativeness, and keep the
  top slice up to the cap stated in the system prompt
- **NEVER fabricate figures**, and never "suggest generating" one — only aggregate
  what researchers actually extracted
- Empty array is acceptable — prefer correctness over coverage

## Reconciliation report

<!-- 2026-08-03 删掉本节原有的章节模板代码块 + 「never use # or ## headings」那段：
     ① 模板与系统提示词第 6 步的小节清单是同一件事的第二份描述；
     ② 标题层级二者直接打架 —— 系统提示词明确要求 `# 对账总览` + `## 冲突/重叠/空白`，
        本文档却写「绝不要用 # 或 ##，改用 ###」，模型听文档那份就违背提示词；
     ③ 那段的理由（H2 会被前端切成多章）已被消费方消化掉了 ——
        segment-extractors.util.ts:203 `demoteTopHeadingsToH3` 在 fallback 时统一降级，
        其注释（同文件 185-190 行）写明「按本 SKILL.md 契约会写成 # / ## 子段」。
     结论：这段是过期约束，删掉；小节结构以系统提示词为准。保留下面的质量要求。 -->

Downstream Analyst & Writer **MUST** consume this report — it is their information
base, not a log. Follow the section structure and length limit given in the system
prompt, and make every line quotable:

- Name the specific entity / dimension, never "some sources disagree"
- For each conflict, say which value downstream should actually use
- The downstream-guidance section is the highest-value part — write it as an
  instruction the Analyst can act on, not a summary of what you did

## Quality discipline

<!-- 2026-08-03 原「Hard rules (never violate)」列表整段改写：里面 9 条全是数值/结构
     门槛的抄写（具体数值不在此复述），而真正的硬门槛在 reconciler.agent.ts 的
     validateBusinessRules（295-387 行）+ zod schema 上执行，且这份抄本已经不全
     （漏了 ACH 的证伪证据要求、refuted 的判定条件、假设数上限等；具体数值不在此复述）。
     一份自称 never violate 却不完整的清单，比没有更危险。改成不带数字的方法要求。 -->

阈值本身由系统提示词与 schema 强制，这里只说**怎样才不会踩到**：

- Fact ids must stay stable and unique — assign them once while extracting, then only reference them
- Anything referenced from `conflicts` must be a fact you actually put in the fact table
- Two facts sharing the same `(entity, attribute)` are **never** a silent duplicate:
  either they are one fact, or they are a conflict you must declare
- A figure without a real citation index and an `https://` source is not usable downstream — drop it rather than pad the pool
- Under-reporting conflicts to look clean is the worst failure here; surfacing them is the entire point

## What this skill is NOT

- Not for generating new research findings (that's the researcher's job)
- Not for writing the final report (that's the writer's job)
- Not for evaluating overall quality (that's the reviewer's job)

<!-- 2026-08-03 原句「it fails fast if the inputs are inconsistent or thin」措辞会被
     模型当成一个可执行动作（中止 / 报错返回），但协议里没有这种 action，模型仍必须
     正常产出。改为描述性说法。 -->

This is an **alignment** pass. Thin or inconsistent inputs are something you
_report_ (as conflicts and gaps), not a reason to abort — still produce the full
output. Well-covered inputs legitimately yield an empty `gaps` list.
