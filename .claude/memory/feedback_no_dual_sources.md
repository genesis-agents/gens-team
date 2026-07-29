---
name: feedback_no_dual_sources
description: 用户明确拒绝任何形式的双源代码 — 不允许做为 follow-up 留下；交付时必须已是单源
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# 不接受双源（duplicated source / DRY 违反）

**规则**：代码库里同一段逻辑、常量、映射表，任何情况下都不允许有两份独立实现。即使在 PR 收尾时把"抽公共 source"标为 follow-up 也不行。

**Why**：用户在 PR-R5b-FULL 收尾原话——"我不会接受双源"。背景是当时把以下两处双源标为 follow-up 想下个 PR 修：

- `buildLeaderInvocation` 在 playground-pipeline-dispatcher + rerun-runtime-builder 各一份 ~45 行
- `FRONTEND_STAGE_TO_STEP_ID` 在 TodoDetailDrawer + MissionTodoBoard 各一份 13 entry 表

用户当场拒绝，要求立刻抽。理由是双源漂移成本极高（commit `108ad20d9` 抽 LeaderInvocationFactory + stage-id-mapping.ts），follow-up 永远会被忘掉。

**How to apply**：

- 写代码当下就识别双源信号：复制粘贴一段逻辑/常量到第二处 → 立刻抽公共 source（service / utils / constant 文件），不要留为后续 PR
- 收尾整理 follow-up 列表时，凡是"双源 / 重复 / 复制"字样的条目必须当场修，不能延后
- 改公共 source 时必须扫所有 `new XxxService(` 直接实例化点同步修 mock，pre-push 测试是最后防线
- 抽公共 source 的标准位置：
  - backend service：放在两个消费方的最近公共父目录（如 `services/mission/leader-invocation.factory.ts`）
  - frontend 常量/工具：`lib/<domain>/<name>.ts`
