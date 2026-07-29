---
name: project_self_driven_unlocks_2026_06_05
description: self-driven runner 已落地 P0 修复+预算上限+三解锁；工具回路 env 门控默认关，待真机冒烟
metadata:
  node_type: memory
  type: project
  originSessionId: 88ad3716-3eca-4b29-887e-6446a77fb5af
---

2026-06-05 已合并到 main（commit 642f489ab）的 self-driven mission runner 改进，全在
`backend/src/modules/ai-harness/teams/orchestrator/self-driven/`：

1. **P0 deliver finalize**：deliver 网关反馈曾是死写入；现用独立 `deliverFeedback` 变量 + 非致命 `finalizeReportViaLLM` pass 真正应用。
2. **mission 预算上限**：`SELF_DRIVEN_MISSION_MAX_TOKENS=200_000`，超限停派新步骤仍交付，`stepTokensRef` 内联累加 usage（无新 DI）。
3. **工具回路**：composer 新增 `formatStructuredOutput()`（结构化 output→Markdown 散文，解决 JSON.stringify 灌报告问题）。**关键现状**：`ENABLE_TOOL_LOOP` 现为 env 门控 `process.env.SELF_DRIVEN_ENABLE_TOOL_LOOP === "1"`，**默认关**——代码/测试齐全，但翻开关前需真实 LLM 冒烟（单测全 mock，无法验证工具产出的散文质量）。
4. **rubric 自评**：compose 后用 `evaluateAgainstRubric()`（this.chat 直打分，非 JudgeService，无新 DI）；低于平均 passLine 触发**一次** critique 改写；质量信号走现有 phase 事件 detail，未改 SelfDrivenMissionEvent 契约。
5. **并行执行**：`topologicalSortLayered()` 按依赖分层，层内并发上限 `SELF_DRIVEN_MAX_PARALLEL_STEPS=3`，`mergeAsyncGenerators()` 合并并发步骤事件流保序。

测试拆分：integration spec 超 god-class 2500 行守护 → helper 抽到 `self-driven-runner.test-helpers.ts`，新用例进 `*.unlocks.integration.spec.ts`。

**仍未做（blast-radius，待评估）**：真机冒烟后翻 tool-loop 开关；自评的 reflexion 多轮重跑（当前仅一次）。

流程上验证：worktree 隔离 + workflow 实现 + 硬 barrier（tsc/jest/eslint/verify:arch）。教训复用 [[feedback_no_stub_label_without_reading]]：barrier 抓到过 agent 自报"绿"但实际有的 lint error，独立复核不可省。
