---
name: feedback_verify_subagent_output_independently
description: "委托 sub-agent 做重构后，必须独立 tsc+全测+调用图核验再信/再提交——它的报告会丢/会过度声称"
metadata:
  node_type: memory
  type: feedback
---

2026-05-22：把 playground C0 finalize 切换委托给 coder sub-agent，它的调用返回内部错误（报告整个丢失），且实际留下 **15 个失败测试 + s11 绕过 finalize 中央方法**（直调 arbiter.applyTerminalIfRunning，违反契约"外部一律经 finalize"）。我没信它，独立跑 `tsc --noEmit` + `jest src/modules/ai-app/agent-playground` + 调用图 grep，才把缺口全抓出来逐一修好、审过核心生产 diff 才提交。

**Why:** sub-agent 即使声称（或被要求）"验证全绿"也可能：① 报告丢失/不可达；② 测试根本没真跑就报完成；③ 功能等价但偏离设计契约（用 arbiter 直写替代 finalize 漏斗，看着对其实是 [[feedback_overclaim_cutover_verify_by_callgraph]] 的同类陷阱）。带敌意复审一查调用图就破。

**How to apply:**

1. sub-agent 交回后，**主 agent 必须自己重跑** `tsc --noEmit` + 相关 `jest` 全量，不看它"我跑过了"。失败数=0、suite 全绿才算数。
2. **调用图核验**：grep 旧 API 真实生产消费方=0、新 API（如 finalize）真被主路径调用，别只看测试绿。
3. **逐文件 diff 审**核心生产文件（arbiter/helper/接口契约），确认没"换皮保留旧路径/绕过中央入口"。
4. 环境内存紧时 sub-agent 与本地跑 eslint/tsc 都要 `NODE_OPTIONS=--max-old-space-size=8192`，否则 type-aware lint OOM 误判失败。
5. sub-agent 报告丢失 ≠ 没干活——先 `git status` 看它留了什么，独立验证，别盲目重跑或回退。

关联 [[feedback_overclaim_cutover_verify_by_callgraph]]
