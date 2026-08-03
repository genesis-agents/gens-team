---
name: critical-review
description: Critical review protocol for catching logical gaps, weak evidence, and bias
version: "1.1.0"
tags:
  - review
  - critic
  - quality
# 2026-08-03：真实消费方是 playground.analyst（analyst.agent.ts:218 `skills: ["critical-review", ...]`），
# 原来只列 critic/reviewer/devil-advocate，与实际激活方不符，补上 analyst。
activateFor:
  - analyst
  - critic
  - reviewer
  - devil-advocate
---

# Critical Review Protocol

这是一套**自查方法**，不是一份独立的任务。
你仍然在做系统提示词交给你的那份工作；本技能只规定"定稿前怎么把自己的稿子压测一遍"。

> ★ 2026-08-03 改：原文开头是 "Your job is to stress-test the given content. You are
> NOT here to agree."。本技能被 skill-activator 以 high 优先级 reminder 注入**同一次
> LLM 调用**（skill-activator.ts:110-130），与 agent 系统提示词并存；模型会照这句把自己
> 当成 critic，改写整个任务目标。角色口径一律以系统提示词为准。

## Review passes (do all three, in order)

### Pass 1 — Logical integrity

- Check every claim for: valid premises, valid inference, absent fallacies.
- Flag: circular reasoning, affirming the consequent, hasty generalization, false dichotomy.
- 尤其查"跨来源拼接"出来的推理链：A 的前提 + B 的结论，中间那一步是否真的成立。

### Pass 2 — Evidence quality

- 输入里每条 claim 都带 `evidence` 与 `source`（`researcherResults[].findings[]`）：
  逐条确认 source 是否真的支持该 claim，而不是"沾边"。
- 没有 source 支撑的论断：判断它是否承重。承重就必须补证据或降级表述，不能留着。
- Reconciler 已经把冲突 / 缺口 / 已证伪假设分别放在 `reconciliationReport.conflicts[]`、
  `gaps[]`、`alternativeHypotheses[]`：这些是别人已经查出来的问题，自查时先对着它们过一遍，
  不要重新发明，更不要假装没看到。
  <!-- 2026-08-03 改：原文只说 "for each claim with a citation"，没对齐真实 Input schema
       的字段名（analyst.agent.ts:11-74），模型只能猜输入长什么样。 -->
- Weight: peer-reviewed > official filings > reputable news > blogs > social media.
- 单一来源 + 二手转述 + 无日期 = 三个减分项叠加，别当成一条强证据。

### Pass 3 — Bias / blind spots

- What perspective is missing? Who would disagree with this, and why?
- Are there anecdotes presented as evidence?
- Are counter-examples considered?
- 查"顺向偏差"：所有结论是否都指向同一个方向？现实很少这么整齐，通常意味着反面证据被过滤掉了。

## 复审结论落到哪里

- 站不住的论断：改写或删掉，不要留在稿子里等下游发现。
- 证据薄但仍要保留：**降低 `confidence`**，而不是保留原分数再补一句"证据不足"。
- 来源互相冲突：写进 `contradictions`，并写清你采信哪一方、为什么。
- 真正说不清的分歧：放进"承认不确定"的字段（如 `foresight.criticalUncertainties`），
  不要包装成确定结论。

> ★ 2026-08-03 删：原文这里有一个"Output format"章节，要求返回
> `## 🔴 Must fix / 🟡 Should fix / 🟢 Strengths` 三段 markdown 评语。
> 消费方真实产物是结构化 JSON（analyst.agent.ts:76-209 的 outputSchema），
> 框架已把该 schema 转成 JSON Schema 注入并做 Zod 校验，还会追加
> "Return ONLY a valid JSON object. No prose, no markdown."（llm-executor.ts:403-424、
> 505-507）。文档再写一份输出格式就是竞争描述——生产日志证明模型听文档那一份，
> 然后被 schema 驳回、耗尽重试、触发"接受当前候选"塞垃圾产物。
>
> **本技能不定义任何输出字段 / 条数 / 分数线 / 比例**：输出形状与数量口径一律以系统提示词
>
> - 框架注入的 outputSchema 为准。本节只说"自查发现的问题该落到哪个既有字段"，不新增字段。

## Hard rules

- 自查时不要放自己一马——不要用"整体还不错"糊过去，该改就改。
- 定位到具体的那句话 / 那条 claim，不要泛泛地说"证据不足"；改的是稿子本身，
  不需要在产物里额外附上被批评的原文或评语。
  <!-- 2026-08-03 改：原文 "Quote the exact passage you are critiquing" 会让模型在
       结构化产物之外多吐一段引文+评语，直接破坏 JSON-only 输出。 -->
- 三轮都没找到问题，就照原样定稿：**不要为了显得严格而编造缺陷，也不要无理由压低
  `confidence`**。
  <!-- 2026-08-03 改：原文是 "say so explicitly"，等于要求在产物外多输出一段说明。 -->

## What this skill is NOT

- 不是让你产出一份独立的评审报告——你的产物形状由系统提示词 + outputSchema 决定。
- 不是给稿子打分：reflexion 的 self / critical verifier 是另一条独立链路
  （ai-harness/evaluation/verify/judge.service.ts:49-64），它有自己的 prompt 和分数口径，
  与本技能无关，别在这里自行输出分数。
