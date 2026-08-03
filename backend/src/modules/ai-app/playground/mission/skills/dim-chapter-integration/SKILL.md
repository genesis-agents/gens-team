---
name: dim-chapter-integration
description: Per-dim synthesis — read the dim's chapters and produce the dim-level abstract + cross-chapter key findings (the integrated body itself is stitched by code, not by the model)
version: "2.0.0"
tags:
  - writing
  - synthesis
  - per-dimension
activateFor:
  - integrator
---

# Dimension Synthesis Protocol

> ★ 2026-08-03 重写（Railway 生产日志实证 + 全量审计）。
>
> 本技能此前教的是「把 N 章拼成一篇完整的维度正文」，并在 Hard rules 里要求
> `fullMarkdown` 含全部 `###` 小标题、字数与正文对齐、不得丢章。
> **但 agent 早已不做这件事**：`dimension-integrator.agent` 的系统提示词写的是
> 「仅 abstract + keyFindings 为权威输出，fullMarkdown 字段保留契约 / 占位即可，
> 实际不被使用」，而 `per-dim-pipeline.util.ts` 里 `fullMarkdown =
stitchedFullMarkdown; // always use code-stitched version` —— 模型产出的正文被
> **无条件丢弃**（2026-05-02 起改为代码确定性拼接）。
>
> 两条相反指令进的是同一次 LLM 调用（skill 正文由 skill-activator 作为高优先级
> reminder 注入）。模型照本技能做，就会去吐一篇 epic 维度 30K+ 字的正文，撞爆
> `outputLength: "extended"`（16000 maxTokens）→ finalize JSON 被截断 → schema
> 驳回 → 走「强制接受次优产物」兜底 —— 而那篇烧光预算的正文最终还是被丢掉。
>
> 所以本次把技能重写成它**真实的**职责：读章节，产出维度级 abstract 与跨章
> keyFindings。正文拼接由代码负责，不归你管。

你拿到某个维度下已经逐章写好、且已逐章过审的章节。你的工作**不是**把它们重写成
一篇文章——那件事由流水线代码确定性完成。你的工作是**跨章综合**。

## 你要产出的两样东西

### 1. 维度级 abstract

- **综合提炼**，不是复制某一章的开头，也不是各章摘要的简单拼接
- 回答「把这几章放在一起看，这个维度到底说明了什么」
- 不写元叙述（"本维度涵盖……"），直接给判断

### 2. 跨章 keyFindings

- 每条 1 句、可独立成立、经得起单独引用
- **必须是跨章节的结论**：只在单章里成立的细节不算，要么是多章共同支撑的判断，
  要么是章节之间的张力/因果关系
- 去重：多章重复的同一事实只保留最强的那一次表述
- 不要发明输入里没有的新论断——只做重组与提炼

## 具体数量与字段形状

> 以 harness 自动注入的 `outputSchema` 与系统提示词为准（唯一权威）。
> 本文档**刻意不复述**字段名、条数与字数上限：同一件事写两份，漂移只是时间问题，
> 而生产日志证明两份不一致时模型听文档那份，然后被 schema 驳回。

直接 `finalize` 注入的 schema 所要求的对象。协议里只有 `tool_call` /
`parallel_tool_call` / `finalize` 三种 action，**没有** `integrate` 之类的动作，
不要给输出外套任何 action 包装。

## 关于 fullMarkdown 字段

它是**保留契约字段**，真实维度正文由 `per-dim-pipeline` 按章节确定性拼接。
按系统提示词的指示填占位内容即可——**不要把章节正文复制进去**，那会白白吃掉
输出预算并导致 JSON 截断，而内容最终不会被采用。

## 本技能不负责

- 写原始章节（chapter writer 的活）
- 评审质量（`chapter-quality-gate` / `dimension-quality-review` 的活）
- 跨维度整合（更高一层的 mission 级步骤）
