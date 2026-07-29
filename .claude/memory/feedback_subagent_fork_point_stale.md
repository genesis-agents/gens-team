---
name: subagent-fork-point-stale
description: Sub-agent isolation=worktree 从 fork 点跑，看不到 main 后续 commit；多 sub-agent 串行依赖时会重建依赖文件造成 cherry-pick 冲突
metadata:
  node_type: memory
  type: feedback
  originSessionId: f4887b10-a190-477c-87ef-92a946e335e1
---

Sub-agent 在 `isolation: "worktree"` 模式下从启动时刻的 main HEAD fork 出 worktree branch。
主 agent 后续若推进了新 commit（如新建 RadarDailyBriefingRepo），sub-agent 看不到，
当它需要 import 该 repo 时会**自己在 worktree 里重建一份**，cherry-pick 回主 main 时
schema.prisma / repo 文件 add/add 冲突。

**实例**：DR2 子任务 B15 (Narrative API) 启动时 main 上还没 B5 repo commit；
sub-agent 自己 redo 了 RadarDailyBriefingRepo，cherry-pick 回主 main 冲突。

**Why**：worktree 隔离的代价 — sub-agent 与主线代码异步演进，依赖不可见。

**How to apply**：

- 启动有依赖关系的 sub-agent 前，主 agent 必须先 commit + push 让 worktree 可 fetch
- 或在 sub-agent prompt 明示"main 上已有 `path/to/dep.ts`，直接 import 复用，**不要重建**"
- 已重建的话 cherry-pick 冲突时 `git checkout --ours` 保留 main 版本
- prisma schema 改动**主 agent 独占**，sub-agent 不动 schema 避免双源
