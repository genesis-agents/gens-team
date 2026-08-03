---
name: cross-dim-synthesis
description: Cross-dimension synthesis — produce insights spanning ≥ 2 dims, resolve contradictions surfaced by reconciliation, output theme summary
version: "1.0.0"
tags:
  - synthesis
  - analysis
  - cross-dim
  - insights
allowedTools:
  - rag-search
  - web-search
activateFor:
  - analyst
  - cross-dim-synthesizer
  - insights-generator
---

# Cross-Dimension Synthesis Protocol

After researchers collect per-dim findings and the reconciler aligns them, you
synthesize **cross-cutting insights** that no single dim could produce alone.
You also resolve the contradictions the reconciler surfaced.

> ★ 2026-08-03 契约对齐（对照 `agents/analyst/analyst.agent.ts` 改写）：
> 本文件只讲**方法与质量**（怎么做得好），不再复述输出字段形状、必填项清单、条数、
> 字数与分数线。真实输出契约由两处唯一定义：agent 的系统提示词 + harness 自动注入的
> outputSchema 描述块。**任何数量/长度/取值范围，一律以系统提示词为准**。
> 起因：旧版本这里写着「3 outputs (mandatory)」并让模型把低置信内容写进
> `whatRemainsUnclear`（analyst 输出里根本没有这个字段，它属于 leader foreword），
> 与系统提示词竞争后模型照文档执行 → 报告章节 / 快速视图 / foresight 集体缺失、
> 产物被驳回、重试耗尽后塞垃圾产物。

## Inputs you receive

- `topic`, `language`
- `researcherResults[]` — per-dim findings (`claim` / `evidence` / `source`) + `summary`
- `reconciliationReport`（optional but typical）:
  - `factTable[]` — canonical 事实条目，`foresight` 的证据 id 从这里引用
  - `conflicts[]` — `(factIds, resolutionType, preferredFactId?, rationale)`；
    `resolutionType` ∈ `kept-both` / `preferred-one` / `flagged-unresolved`
  - `overlaps[]`、`gaps[]`
  - `termGlossary[]` — `(canonical, variants[])`
  - `alternativeHypotheses[]` — `(id, statement, likelihood, status)`，ACH 竞争性假设分析
    ★ 补列（旧版漏写，但真实 Input schema 有）：`status = refuted` 的假设已被 reconciler
    证伪，**不得**再作为向前看的基准判断；`unlikely` 的若要采用，必须显式压低其概率。
- `retryHint`（optional）— 仅在上一轮失败后由 orchestrator 注入；出现时优先按它修。

## 你要产出的字段

★ 不在本文件罗列 —— 字段名、必填项、条数与字数由系统提示词 + outputSchema 描述块给出，
且远不止 insights / contradictions / themeSummary 三项（还包括报告 prose 章节、
快速视图结构化字段、foresight 前瞻判断等）。**照系统提示词的字段清单逐项输出，一个都别漏。**
本技能只提供下面这些「怎么做得好」的判据。

## 1. 什么才算"跨维洞察"

- 跨维是这个技能存在的理由：优先产出**至少两个维度共同支撑**的判断。
  单维观察是 finding，不是 insight —— 它已经在 `researcherResults` 里了。
- 但**绝不为了"看起来跨维"而硬凑维度名**：某条判断如果实际只有单维证据，
  要么把它降级（不作为 insight），要么如实只写它真正依赖的维度并压低置信度。
  伪造维度归属比少一条洞察更伤报告。
- 不要把某条 `finding.claim` 原样搬成 insight —— 要综合（因果链 / 相互强化 /
  张力对冲），不是复述。
- narrative 要指名道姓地引用具体 finding 与证据（数字、实体、时间窗口），
  不能只有形容词。

## 2. confidence 怎么标才可信

置信度反映**证据强度**，不是你语气的强弱。按证据形态从高到低排：

- 最高档 — 多个一级来源跨维一致，且找不出站得住脚的反读
- 次高档 — 证据扎实，但有一处明确保留（时点 / 适用范围 / 来源质量）
- 中档 —— 方向上可信，但证据偏薄或来源有已知立场偏差
- 最低档 — 推测性质：**照实压低分数**，不要删掉它，也不要塞进别的字段

★ 具体数值区间（以及是否用 0..1 数字）以系统提示词与 outputSchema 为准，本文件不写死。
高估会拖垮整份报告的可信度；低估会让 writer 把有价值的判断过滤掉 —— 两头都要避免。

## 3. 矛盾怎么消解

reconciler 报出的每一条 `conflict`（以及你自己新发现的），都必须在你的矛盾字段里
显式出现，并给出**你的**最终立场。可接受的消解形态：

- "A 来源更权威，因为 [具体理由] —— 采纳 A 的取值"
- "两种读法在不同语境下都成立 —— A 适用于场景 X，B 适用于场景 Y"（对应 `kept-both`）
- "两边都不足以定论 —— 明确标为开放问题，并说明缺什么证据才能定论"

**永远不要留悬空的矛盾**：`"TBD"` / `"待定"` / `"有待进一步研究"` 这类空话等于没写，
会被判为未消解。理由要具体到可复核（谁、依据什么、为什么它更可信）。

## 4. 术语一致性

用 `termGlossary` 的 canonical 形式贯穿全文 —— 不要在一条洞察里写 "AI"、
另一条写 "人工智能"，而 glossary 明明已经统一了它们。

## 5. 主题综合写什么

把各条洞察串成**一条主线叙事**：它们合起来在讲什么故事、哪条是主干、哪条是支撑。
这是 writer 决定章节顺序与承重论点的锚。（篇幅要求见系统提示词，本文件不设上限。）

## What this skill is NOT

- Not for collecting new findings (that's the researcher's job)
- Not for fact alignment (that's `cross-dim-fact-check`)
- Not for chapter writing (that's the writer's job)
- Not for grading the synthesis (that's the reviewer's job)

This skill produces **the analytic spine** of the report — insights + resolved
contradictions + theme narrative. The writer uses this to decide chapter sequence
and load-bearing arguments.
