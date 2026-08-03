---
name: leader-foreword
description: M6 leader foreword — meta-level executive preface that grades each successCriterion + lists open questions + reading guide + follow-up recommendations
version: "1.0.0"
tags:
  - leader
  - foreword
  - executive-summary
  - mission-end
activateFor:
  - leader
  - mission-leader
  - foreword-writer
---

# Leader Foreword Protocol (M6)

After Writer / Reviewer / Critic complete their passes, the leader writes a
**meta-level foreword** that goes at the very front of the report. This is the
"boss's perspective" the user sees first.

**This is NOT the writer's executive summary.** Do not duplicate that content.
This is your honest, accountable take on what you actually delivered vs. what
you committed to at M0.

## Inputs you receive

> ★ 2026-08-03：字段名按 `leader.agent.ts` 的 `Input`（phase="foreword" 分支）逐字核对过。
> 原来写的 `qualitySnapshot.verdict` 在真实 schema 里叫 `finalVerdict` —— 模型照文档去读一个
> 不存在的字段，只能瞎编 verdict，这正是"文档与代码不一致→产物失真"的典型入口。

- `topic` / `description` / `language` — 任务本体与用户原始描述
- `myPlan.goals.successCriteria` — what you said success looks like at M0
- `myPlan.goals.qualityBar` — minSources / minCoverage / hardConstraints you committed to
- `myPlan.dimensions[]` — M0 拆的维度（id / name / rationale / facet）
- `myDecisions[]` — every key decision you made (phase / at / decision / rationale)
- `stageOutcomes.researcherStates[]` — per-dim final `state`（completed / degraded / failed）
- `stageOutcomes.reconciliation` — `factCount` / `conflictCount` / `criticalGaps[]`（可能缺省）
- `stageOutcomes.writerSections[]` — section list
- `stageOutcomes.qualitySnapshot` — `sourceCount` / `coverageScore` / `overall` / `finalVerdict`，
  以及选填的 `reviewerAvgScore` / `criticVerdict` / `criticBlindspots[]` / `criticBiases[]` /
  `objectiveScore` / `objectiveGrade` / `objectiveFeedback`

## 4 fields to produce

### 1. `whatWeAnswered[]`

For each `successCriterion`, answer with:

- `criterion` — restate the criterion verbatim (or close paraphrase)
- `addressed` — `"yes"` / `"partial"` / `"no"` — **be honest**:
  - degraded dims → `partial` or `no`
  - critic blindspots that map to a criterion → at most `partial`
- `evidence` — one sentence pointing to specific `§N` or `dim-X` as proof

### 2. `whatRemainsUnclear[]`

Open questions / underspecified areas / critical gaps the report didn't answer.

**优先级顺序**（有 degraded dim / critical gap / critic concern 时此项不得为空，业务规则会拦）：

1. `reconciliation.criticalGaps` 里的关键空白
2. degraded / aborted 的 dim
3. 后续修订仍未消化的 critic blindspot

> ★ 2026-08-03：原文写的是"MUST include **every** gap / degraded dim / blindspot"，与真实
> outputSchema 的数组条数上限冲突 —— 三类合计超上限时，模型照文档"全都列"必被 schema 驳回，
> 重试耗尽后反而兑出垃圾产物。改为**按上面优先级取前若干条**，条数上限以系统提示词与
> 自动注入的 outputSchema 为准，本文档不再写死数字。

Do not hide gaps. The user will use this report to make decisions; pretending
"comprehensive coverage" when there are real holes is dereliction. 条数受限时，
**留下最影响用户决策的那几条**，并在 `howToRead` 里点明"还有未列尽的弱证据区域"。

### 3. `howToRead`

一段紧凑的阅读引导（长度上下限以系统提示词 + outputSchema 为准，本文档不写死字数）：

- Which section(s) to prioritize
- Which sections have weaker evidence and should be supplemented with external sources
- Any sequencing tips ("read §3 before §5; §5 builds on §3's framework")

### 4. `recommendedFollowUp[]`

Forward-looking research directions **not** already covered in this report.
Not "more of the same" — genuinely new questions surfaced by reading the result.

> ★ 2026-08-03：本节原写死了字数上限与条数区间（具体数值不在此复述）。条数/字数只在系统提示词和 outputSchema
> 里有唯一权威值，文档再写一份就是竞争描述，一旦任一侧调整就把模型带向被驳回的那一份。

## Output shape — MUST use ReAct finalize wrapper

> ★ 2026-08-03：输出字段形状以 harness 自动注入的 `outputSchema` 为准（agent-runner 的 `describeOutputSchemaForLlm`，唯一权威）。
> 本文档**不再复述形状** —— 两份描述一旦漂移，模型会照文档写、然后被 schema 驳回、耗尽重试后兑成垃圾产物（2026-08-03 生产实证）。
> 本节只讲**内容与质量要求**。

## Hard rules（会被代码真拦下的）

> ★ 2026-08-03：这一节只保留 `leader.agent.ts` 的 `validateBusinessRules` / `outputSchema`
> **确实会 throw** 的门槛。原文把"每条 criterion 一条、顺序一致（===）"写成硬规则，而代码判的是
> **下限**（少于 successCriteria 条数才拒），顺序根本不校验 —— 写成等号会让模型在该多说时不敢说。

- 每条 `successCriterion` 都必须在 `whatWeAnswered` 里有对应条目（**少一条即被业务规则拒**）；
  建议按 successCriteria 原顺序排，便于用户逐条对照
- `addressed` 只能取 schema 里的枚举值 —— 不接受 "mostly" / "kind-of" / "yes-but"
- 存在 degraded/failed dim、`criticalGaps`、或 critic 判 fail / 提了 blindspot 时，
  `whatRemainsUnclear` **不得为空**（Lead 必须诚实，业务规则强制）
- 外层必须是 `{thinking, action: {kind: "finalize", output: ...}}` ReAct wrapper（loop=react，缺了会被 finalize 闸驳回）

## 质量要求（无代码拦截，但这是本技能的价值所在）

- `evidence` 指向具体 section / dim，不写 "throughout" / "全文均有体现"这类无法核对的话
- `recommendedFollowUp` 必须是**新方向**，不是把报告已有结论换个说法
- 不要塞正文段落 —— foreword 要能被扫读

## What this skill is NOT

- Not the writer's executive summary (that's already in the report body)
- Not the leader's signoff (`leader-signoff` is M7, after this)
- Not a per-section review (`dimension-quality-review` covers that)

This skill produces **the front matter the user sees first**. M7 signoff
references the foreword content (`whatWeAnswered`, `whatRemainsUnclear`) for
the accountability note.
