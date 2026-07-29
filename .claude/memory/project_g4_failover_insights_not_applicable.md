---
name: project_g4_failover_insights_not_applicable
description: Claude Code failover insights
metadata:
  node_type: memory
  type: project
  originSessionId: 95d2822a-b991-4d59-a3a3-e2e5b3a8097c
---

2026-06-01 SOTA gap eval 阶段一核实结论：CLAUDE.md「反向洞察」#6（failover 剥离 thinking signature）/#9/#10（配对悬空 tool_result、discard 半截 tool call）**不适用本项目 runner 架构**，不要据此加防御代码。

**Why:** 直接核实代码：(1) `ai-harness/runner` 全模块零 `signature` 字面——不存在 provider 绑定的 thinking signature 被回传，无可剥离；(2) `react-loop.ts` 的 `updateEnvelope`（~2398-2423）把 assistant 消息 + tool observation **原子成对追加**，failover 只发生在 `reason()` 抛错时（追加之前），envelope 始终成对；(3) 工具结果以**文本**（role:tool→user 或 anthropic tool_result 转换）回传，failover 重跑 `chat()` 从 envelope 文本重建，不round-trip 原生 provider message block——故无悬空 tool_use_id 到达 provider 的 400 场景。

**How to apply:** 这些洞察是 Claude Code 原生 wire-loop（流式 + 原生 message 数组）的经验，本项目走单发 `chat()` + 自有 IContextMessage 抽象，映射不成立。评估/移植 Claude Code 反向洞察时，先确认底层执行模型是否相同，再决定是否实现。相关：[[project_p1_react_runaway_fix_2026_04_29]]。

阶段一真正落地的是 T2（工具作用域前置过滤）/T3（子 agent 工具求交集）/T4（A2A card streaming+pushNotifications 置 false 停止规范一致性谎言），分支 feat/harness-sota-phase1。T5 空响应断路器存在"注释说连续2次、代码实际第1次即终止"的多义性，未擅自改。
