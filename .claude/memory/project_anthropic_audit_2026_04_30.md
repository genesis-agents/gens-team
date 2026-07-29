---
name: 对标 Anthropic Managed Agent 全量审计 2026-04-30
description: 4 路并行 audit 输出综合差距矩阵 — 整体对齐度 60%，4 项 P0 退化必须立即修，8 项 P1 架构对齐
type: project
originSessionId: ccbd980d-4dd8-4cfe-819e-c57149f57eb0
---

**事实**：2026-04-30 4 路并行 arch-auditor 完成对标 Anthropic Managed Agent / Claude Agent SDK 的全量差距审计，整体对齐度 **60%**。报告落盘在 `docs/audits/anthropic-managed-agent-*-gap-2026-04-30.md`，总报告 `anthropic-managed-agent-overall-gap-2026-04-30.md`。

**Why**：北极星目标是对标 Anthropic Managed Agent（见 project_north_star_anthropic_managed_agent.md）。需要量化差距、定优先级、给执行节奏，而不是凭直觉补功能。

**How to apply**：

## 4 项 P0 退化（约 1 周修完）— 必须先做

这些都是"已有架构 + 接通断了"的退化，修复成本极低收益极高：

1. **P0-1 postmortem embedding=[]**（`mission-store.service.ts:504`）— 语义召回退化为 tag filter，1-2 天
2. **P0-2 Mission 中途宕机从头重跑** — `TeamMission.runMission()` 正常 stage 完成后未调 `missionCheckpoint.save()`，2-3 天
3. **P0-3 Hook 三事件零 dispatch** — SessionStart / Stop / UserPromptSubmit 类型完整但全库无触发点，1-2 天
4. **P0-4 CacheControlPlanner 未接 LLM 调用链** — Anthropic prompt cache 优化形同虚设，0.5-1 天

## 8 项 P1（4-6 周）— 架构对齐

最关键 3 项：

- **P1-1 playground 18 份 duty.md → SKILL.md 标准化**（最深架构债，1-2 周）
- **P1-2 SkillActivator progressive disclosure**（2-3 天）
- **P1-4 Plan 预生成 + 用户审批 UI**（最大产品体验差距，2-3 周）

其余 P1：mid-loop interrupt / resume 类方法重建 / HierarchicalMemory 持久化 / auto-compact 自动触发 / MemoryBridge.postExecute 接通

## 已闭环（不要重写）

- ReActLoop + parallel_tool_call + circuit breaker + 4 种 loop 类型
- MCP Client 三 transport（stdio/SSE/Streamable HTTP）
- Hook 核心链路 PreToolUse/PostToolUse/PreSubagentSpawn
- HarnessFacade.fork()
- 12-stage stepper / Cost 多维分层 / 返工分析（**UI 独有优势，超 Claude Agent**）
- S12 → S2 教训注入闭环（链路通，但被 P0-1 拖累）

## 系统性架构债（非快赢）

1. playground duty.md 与 harness SkillRegistry 双轨（P1-1 是关键）
2. Memory 三套存储栈无统一抽象
3. CheckpointService agent 级 vs mission 级两个独立类不互通
4. Permission 缺 `ask` 实时审批级
5. Plan 审批环节缺失（fire-and-forget vs plan→approve→execute）

## 节奏建议

- Sprint 1 (1w)：P0 全部 → 60% → 70%
- Sprint 2 (2-3w)：P1 架构（progressive disclosure / duty 标准化 / interrupt）→ 70% → 82%
- Sprint 3 (2-3w)：P1 产品（Plan 审批 UI）→ 82% → 88%
- Sprint 4+：P2/P3

**讨论后续工作时**：先问"这是 P0/P1/P2 中哪一项"，再决定是否做。**不要做 P3 之前先做完 P0**。
