---
name: dimension-research
description: Single-dimension efficient research protocol — bounded search rounds, source-traceable findings, figure red-lines
version: "1.0.0"
tags:
  - research
  - data-collection
  - per-dimension
  - efficiency
allowedTools:
  - rag-search
  - web-search
  - fetch
  - parallel_tool_call
activateFor:
  - researcher
  - dimension-researcher
  - per-dim-collector
---

# Dimension Research Protocol

You collect evidence for **one dimension** of a multi-dim mission. Stay efficient —
do NOT iterate beyond what's needed. Other dims run in parallel.

## Inputs you receive

- `topic`, `dimension` (the one you own), `language`
- `toolHint.categories` and optional `toolHint.preferIds`
- `<available_tools>` block listing the tool catalog

## Workflow (4 phases, each at most one round)

### Phase 1 — Internal knowledge probe (optional)

If the tool catalog includes a `rag-search`:

- Issue ONE rag-search query to see if internal knowledge already covers the dim
- If high-quality hits → skip phase 2, go to phase 3
- If thin / outdated → continue to phase 2

### Phase 2 — One specialized search round

- Emit ONE `parallel_tool_call` with 2–4 search queries
- Vary terminology / angle; do NOT repeat the same query verbatim
- Prefer the categories in `toolHint.categories`

### Phase 3 — At most one scrape/parse round

- Pick the 2–4 highest-value URLs from phase 1/2 results
- One round of `fetch` to retrieve full content
- Do not chain fetch → fetch → fetch — pick well, fetch once

### Phase 4 — Finalize

> ★ 2026-08-03（生产实时日志实证）：本节原来画了一份输出 JSON 并注明
> `// 4-5 findings ideal`，下面的 Hard constraints 又写「**Target 4–5 findings**，
> Don't pad」。而 researcher.agent 的系统提示词要的是 **12-18 条**，业务硬门槛
> 是 **≥5 条**（`minFindingsThreshold`，低于即驳回）。三个数字互相打架，模型听
> 文档写 4 条，于是：
>
>     finalize rejected (1/3): Business: findings.length=4 (要求 ≥5)
>     finalize rejected 3 times in a row, accepting current candidate
>
> 这是修复上线后监控当场抓到的**正在发生**的重试风暴。
>
> 输出字段形状由 harness 自动注入的 `outputSchema` 给出，条数由系统提示词与业务
> 规则给出 —— **本文档一律不复述**，只讲怎么做研究。

按注入的 schema 直接 `finalize`，不要外套 action 包装。

## Hard constraints

- **条数以系统提示词给出的目标为准**（业务规则另有硬下限，低于即被驳回）；
  本文档不写死数字。宁可多找一条真实来源，也不要为了"精简"卡在硬下限上
- **但也不要为凑数注水**：每条 finding 必须是独立、可证伪、有真实来源的论断。
  重复同一事实、或把一条拆成三条，会在下游复审被扣分 —— 数量下限是底线不是目标
- **1 short evidence quote per finding** — not a multi-paragraph block
- **`source` 必须是可解析的引用**：`http(s)://` / `doi:` / `arxiv:` / `wiki-page:`
  / `kb-doc:` 前缀，或至少含 `.` 的域名。**"web-search tool results"、"搜索结果"
  这类描述性文字会被业务规则直接驳回**（生产实测正在发生）。
  拿不到真实 URL 就不要写这条 finding，编造 URL 是失职
- **Stay within the dim** — drift to neighboring dims is rejected by the reconciler
- **Stop when you have enough** — extra search rounds waste budget without adding evidence

## Figure red lines (4 rules — never violate)

When extracting figure candidates from sources, every `figureCandidate` MUST satisfy:

1. **No fabrication** — never invent figure URLs or generate "this would be a great chart"
2. **No stock photos** — generic stock imagery is rejected; only data-bearing figures count
3. **No AI-generated illustrations** — rejected at the verifier
4. **Real source URL** — `https://` only; the URL must be fetchable

If a dim has no genuine figure candidates → `figureCandidates: []`. Empty is correct.

## What this skill is NOT

- Not for cross-dim reconciliation (`cross-dim-fact-check` does that)
- Not for synthesizing a final report (writer does that)
- Not for self-grading (reviewer does that)

This skill produces **one dim's findings + figure candidates**. N parallel
researcher calls produce N independent dim outputs that the reconciler aligns.
