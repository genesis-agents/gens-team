---
name: 2026-05-15-playground-harness-engine
description: 4 路 reviewer 综合：架构合规 82/100、内部成熟度 8.4/10、业界排第二档头部（OSS 全球第 2-3 名）、可标杆化 6/10 不到火候——真正模板是 writing-team 439 行薄壳，不是 playground
metadata:
  node_type: memory
  type: project
  originSessionId: b2a1b3e2-dcf6-4709-b034-22dd0f9570ab
---

**事实**（2026-05-15 4 路 reviewer 并行审视后综合）：

## 三大问题答案

**Q1 架构关系是否成熟？** 部分成熟（82/100）。
facade 边界 100% 遵守、A2AMessage 单源、checkpoint MECE 划分（AgentStep vs Mission 两级）、ai-engine→ai-harness 反向依赖仅 1 处合法 adapter；从 2026-04-29 baseline 65/100 提升 17 分。**存量债**：playground duty md 与 SKILL.md 双源（38 处 buildPromptFromDuty + 17 SKILL.md 并存）、cost-controller 硬编码 6 个模型价格表（违反 feedback_no_hardcoded_pricing）。

**Q2 能作为系统标杆 agent team？** 不能（6/10）。
playground controller 856 行 / module 421 行 / pipeline-dispatcher 1073 行 god-class、48 处静默 `.catch(() => null|undefined|[]|{}|void 0)`（19 文件）；ai-app-scaffolding.skill.md L34 已明确"**Topic Insights 是标杆模块**"，不是 playground。真正的标杆模板是 **writing-team 439 行薄壳**（1 config + 1 service + 1 controller + 1 module + 1 types），证明 harness primitives + business hook 闭包就够复制。playground 是"功能最全的参考实现"+"业务最重的实现"，不适合直接复制。

**Q3 业界排序？** 第二档头部，OSS 全球第 2-3 名。

- 第一档（差 30-32pp）：Anthropic Managed Agent (Claude Agent SDK v2.1.140) / OpenAI Deep Research (o3-deep-research) / Google Gemini Deep Research Max / Perplexity Comet
- 第二档头部（Genesis 位置）：≈Manus 1.5 / LangGraph v0.4
- 第三档：AutoGen 1.0 / CrewAI / OpenAI Swarm
- 工程纪律已到第一档（14-stage 闭环 + 11 聚合 MECE + 三层架构护栏 + ~13K tests）
- 硬差距：缺 Managed REST 形态、code-as-action sandbox、reasoning model 路由

## 三层架构成熟度

L2 ai-engine: 9 聚合（content/facade/knowledge/llm/planning/rag/safety/skills/tools），credentials 已合入或暂未独立。
L2.5 ai-harness: 11 聚合（agents/evaluation/facade/guardrails/handoffs/lifecycle/memory/protocols/runner/teams/tracing），与 standards/16 目标态对齐。
L3 ai-app/agent-playground: 13-stage（s1→s11 含 s8b/s9b）+ s12 postlude；走 AgentSpec + @DefineAgent + AgentInvoker 模式（HarnessedAgent 已 deprecated）；S12 闭环已全闭（postmortem→vector_memory→leader plan duty 真消费）。

## 内部成熟度提升

- stage emit 已通过 runWithStageInstrumentation 统一 wrapper（之前漏 emit 的 s5/s7/s9/s9b/s10 全覆盖）
- quality 5 件套（SectionSelfEval/Remediation/ReportEvaluation/QualityGate/QualityTrace）s8b→s9b→s10 真消费
- liveness 5 检测器→1（MissionLivenessGuard），heartbeat∧events 双 stale 才杀
- orphan-cleanup onModuleInit 5min stale 主动清
- wall-time cap 4h + startupGraceMs 5min
- playground 0 处直调 chat(），全部走 harness AgentInvoker

## 残留 P0 红线（4 条）

1. **duty md 与 SKILL.md 双源**：leader/steward/verifier 3 agent 共 38 处 buildPromptFromDuty 私有路径，绕过 SkillRegistry；PR-8 未做
2. **48 处静默 catch**（19 文件）：宽 regex 扫描真实存在，window catch 系列吞错；2026-04-29 baseline 的 31 处未清反而增加
3. **3 个 god-class**：controller 856 行 / module 421 行 / pipeline-dispatcher 1073 行，违反 standards/16 §六 500 行硬上限
4. **cost-controller 硬编码 6 模型价格表**：违反 feedback_no_hardcoded_pricing，应走 ModelPricingRegistry

## P1 待办

- mission-event-buffer 未下沉 harness（PR-4 等 W21）
- signoff 阈值未按 quick/deep/mega tier 分档（MIN_CONTENT_WORDS_RATIO=0.3 硬常量）
- custom-agents 反向依赖 AgentPlaygroundModule 未消
- playground 13-stage 含 4 个 research-only stage（s5/s6/s8b/s9b），不能作通用模板

## 一句话定位

工程纪律世界第一档，业务复杂度全球前列，但**业务实现违反自己定的 scaffold 标准**，是"超 OSS 但还差头部闭源 30pp"的功能上限展示，不是"复制即用模板"——后者是 writing-team 形态。

## How to apply

- 用户问"playground 多 SOTA"答"第二档头部 OSS 第 2-3 名，距头部闭源 30pp"
- 用户问"能否作为标杆"答"还不到火候，真正标杆是 writing-team 439 行薄壳"
- 用户问"架构成不成熟"答"82/100 facade 收敛，但仍有 4 条 P0 红线（duty 双源 / 48 处静默 catch / 3 god-class / 价格硬编码）"
- 推 [[feedback_no_hardcoded_pricing]] [[feedback_god_class_pre_push_split]] [[feedback_skill_md_byte_equal_contract]] [[feedback_no_dual_sources]] 的同时落地这 4 条红线
