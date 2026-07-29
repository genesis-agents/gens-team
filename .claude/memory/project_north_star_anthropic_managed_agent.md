---
name: 项目北极星 - 对标 Anthropic Managed Agent
description: Genesis agent-playground 的最终对标目标是 Anthropic Managed Agent（Claude Agent SDK + Anthropic 官方 Agent 产品形态），不是泛义 SOTA
type: project
originSessionId: ccbd980d-4dd8-4cfe-819e-c57149f57eb0
---

**事实**：用户 2026-04-30 明确指示，agent-playground 的产品对标对象是 **Anthropic Managed Agent**（claude.ai 上的 Agent Skills / Claude Agent SDK 构建的官方 Agent 产品形态），而不是泛义的"业界 SOTA"或"AutoGPT/MetaGPT 等开源项目"。

**Why**：之前的 SOTA gap 分析（见 project_playground_sota_gap_summary.md，7.6/10）对标对象是混合的（包含 OpenAI Swarm / LangGraph / AutoGen / MetaGPT 等），方向感不够聚焦。Anthropic Managed Agent 代表 LLM 厂商对 "agent loop + skill + memory + governance" 的官方答案，是产品化路径上最靠近 Claude 生态的标杆。

**How to apply**：

- 后续讨论 agent-playground 架构、stage、skill、memory、governance 时，**优先参考 Claude Agent SDK 的设计**（hooks / skills / subagents / context engineering / sessions），而不是 LangGraph / AutoGen
- 提改进方案时，先问"Managed Agent 是怎么做的"，再问"我们差在哪"，再问"补哪个 stage / facade"
- 项目内已有 SkillRegistry（ai-engine 主线）+ HookRegistry + AgentFactory + checkpoint，整体形态与 Claude Agent SDK 已经高度同构 —— 改进重点在**对齐细节**，不是重写架构
- 目标产品形态：用户在 playground 里能像在 claude.ai 上配 Agent 一样配 mission / skill / hook / memory，并能跑出可观察、可恢复、可学习的 agent 任务
