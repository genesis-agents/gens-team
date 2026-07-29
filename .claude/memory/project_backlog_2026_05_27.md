---
name: project-backlog-2026-05-27
description: 三件用户提到的待启动 backlog 项，等用户拍板启动；不要主动开工
metadata:
  node_type: memory
  type: project
  originSessionId: 21cce6bd-7d93-4680-8e96-4828b6359708
---

用户在 2026-05-27 phase 2 收尾时备忘了三件事，第三件未展开。

## 1. 模型网关 (model gateway)

- 范围未澄清。通常含：provider 路由 / model routing rules / BYOK / failover / 成本归集 / rate limit。
- 与现有 `ai-engine/llm/` 重叠面需厘清。当前 `ai-engine/llm/` 25.7K LOC 已含 `ai-chat.service` / `ai-api-caller.service` / `ai-model-config.service` / `ai-connection-test.service`，部分网关职责已在里面，需要明确"网关"是新模块还是 llm 子集的再组织。
- **Why**: 用户在 phase 2 收尾说"想到三件事"自然列出，未澄清优先级 / 触发条件。
- **How to apply**: 用户主动开口启动前不要主动开工；启动时第一步是问清楚范围与 ai-engine/llm 的边界。

## 2. 快速构建 Agent 的 CLI

- 目标：一个命令快速 scaffold 一个新 agent，复制 agent-playground 已有结构（agents/ + roles/ + projectors/ + pipeline 骨架）+ 充分利用 ai-harness facade（不重造 agent loop / runner / event bus）。
- 输入：agent 名 + 几个 stage 名（最小输入）。输出：可运行最小骨架（含 module / pipeline / 1 个 agent / 1 个 stage / fixture spec）。
- **Why**: playground 30K LOC 已经把模式跑通，下一个 agent 不应从空白起手；复制 + 替换名字 + 配 stage 应当几分钟完成。
- **How to apply**: 启动时考虑 nest CLI generator + handlebars template；先做 dry-run 输出，再做实际写文件。

## 3. 第三件事（未知）

- 用户口头说了"三个事情"但只展开两个。第三件待用户补充。下次用户提到 backlog 时主动问一次。

## 相关 task IDs（当前会话）

- Task #64: backlog: 模型网关
- Task #65: backlog: 快速构建 Agent 的 CLI

Linked: [[feedback-index]]
