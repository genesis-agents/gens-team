---
name: report-meta-critic
description: Independent meta-review (L4) of a finished report — find blindspots, biases, and improvement directions that L3 reviewers miss
version: "1.0.0"
tags:
  - review
  - critic
  - quality
  - meta-review
activateFor:
  - meta-reviewer
  - critic-l4
  - mission-critic
---

# Report Meta-Critic Protocol (L4 — independent review)

The L3 reviewer has already graded structural quality (citations, length, format).
Your job is the **L4 independent review** — what L3 cannot catch by checking rules.

> ★ 2026-08-03 适用范围（本技能被两个 agent 共用，故此处点明）：
> `agents/reviewer/mission-critic.agent.ts`（复审已完成报告）与
> `agents/reviewer/forecast-red-team.agent.ts`（对前瞻判断做 pre-mortem 对抗复核）。
> 两者的输出字段并不相同。所以：**这一轮要交什么字段、列几条、怎么分档，
> 一律以系统提示词 + harness 注入的 `outputSchema` 为准**；本文档只负责"怎么评得准"的方法。

## What you look for (报告复审场景的三类产出)

### 1. Blindspots — what's missing

Questions the report **should answer but didn't**.

- "未讨论 A 在边缘场景的稳定性"
- "comparison includes B vs C but ignores D which is a stronger competitor"
- "claims market leadership but no segmentation analysis (geo / vertical)"

### 2. Bias flags — implicit positioning

Hidden stance, leading framing, asymmetric evidence.

- "结论先行，'标准范式'被使用 5 次但证据不足"
- "every counterexample is dismissed in one sentence; supporting evidence gets full paragraphs"
- "uses positively-loaded terms ('breakthrough', 'paradigm shift') without quantitative support"

### 3. Suggestions — actionable improvement

Concrete directions if the report were to be redone. Each suggestion **starts with a verb**.

- "增设 §6 限制章节，用 matched-compute 数据对比 A/B"
- "Replace §3's case study with two — current case study is the same vendor as primary source"
- "Add an explicit assumptions section listing the 3 load-bearing assumptions"

## 判定口径（分档与条数以系统提示词为准）

<!-- ★ 2026-08-03：此处原有一张写死的判定分档表，与消费方核对后删除，三条理由：
     1. 它给的通过门槛与 mission-critic.agent.ts 系统提示词里的门槛不是同一套；
     2. 用"多少条 = 哪一档"的区间表本身就是在教模型凑数，而系统提示词明令
        adaptive count、不许为凑数编问题 —— 文档在反着教；
     3. 另一个消费方 forecast-red-team.agent.ts 根本没有这种枚举判定字段
        （它输出的是稳健度分值），一套写死的分档只会误导它。

     具体数字**刻意不在此复述**：本文件整篇会被 SkillActivator 作为高优先级
     reminder 注入同一次 LLM 调用，把旧阈值抄在说明里，等于换个位置继续教错
     —— 那正是本次要消灭的缺陷类型。要查历史值看 git history。 -->

判定时不是数条数，是掂分量：

- 这几条问题里，有哪几条是你**愿意当着高管的面替它辩护**的？只列这些。
- 单条问题是否足以让读者改变对整份报告结论的态度？是 → 它是严重问题，不是"又一条 blindspot"。
- 报告确实扎实时，就如实给出"没什么可挑"的判定。凑数比漏报更贵——凑出来的问题会被下游当真去返工。

## What you do NOT do (avoid double-counting with L3)

> ★ 2026-08-03：原文写的是"不要评引用密度 / 不要看章节长度"，但 `mission-critic.agent.ts`
> 的 check list 第 4、5 条**明确要求**看 section count vs topic complexity 与 citation health
> （原话含 "count low?"）。文档一句"别看"会让模型直接跳过系统提示词点名的检查项。
> 故改为按"重复计分 vs 独立判断"划线，系统提示词点名要看的一律照做。

- 不重复 L3 已经机械打过分的**合规性结论**：格式是否达标、篇幅是否够、引用条数是否达线——这些的及格与否不由你再判一次
- 不逐条复核事实真伪、不重读每条引用原文（verifier owns that）
- 但**质量层面的判断是你的**：引用够不够支撑结论、来源是否过度集中在少数几家或以博客替代权威源、章节覆盖面配不配得上题目复杂度——系统提示词点名要看的，照做

You are reading **as a skeptical domain expert**, not as a rule-checker.

## Output JSON shape

> ★ 2026-08-03：输出字段形状以 harness 自动注入的 `outputSchema` 为准（agent-runner 的 `describeOutputSchemaForLlm`，唯一权威）。
> 本文档**不再复述形状** —— 两份描述一旦漂移，模型会照文档写、然后被 schema 驳回、耗尽重试后兑成垃圾产物（2026-08-03 生产实证）。
> 本节只讲**内容与质量要求**。

## Hard rules

<!-- ★ 2026-08-03：删掉此处写死的 `rationale` 最短长度 —— 真实下限在注入的
     outputSchema 与系统提示词里各有一份，文档再写一份就是第三份说法。
     同时去掉带字段名的写法（原文用的字段名在真实 schema 里不存在，另一个消费方
     更是压根没有该字段）。字段名与长度一律以注入的 schema 为准，这里只留内容要求。
     具体数值刻意不复述：本文件整篇会被注入同一次 LLM 调用。 -->

- 说明理由时要真的解释判断是怎么来的，不是把结论换个说法重述一遍
- 每条改进建议以动词开头（Add / Replace / Remove / Restructure / Quantify / ...），且指向具体位置，不写"建议加强分析"这种无落点的话
- 指出倾向性时必须引用或转述**具体那一句**，不能只说"整体偏乐观"
- 没有问题就如实说没有；空列表是合法产出，不要为了填满而造问题
- Do not soften criticism with "overall the report is good" — be direct
