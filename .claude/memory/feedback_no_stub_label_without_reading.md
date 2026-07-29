---
name: feedback_no_stub_label_without_reading
description: '不得在没真读文件的情况下把代码标为"占位/stub"；子 agent"没看到"≠空壳'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 88ad3716-3eca-4b29-887e-6446a77fb5af
---

做质量评估/架构审计时，**绝不能把"占位 / stub / 空壳"当结论，除非自己（或子 agent）真 Read 了该文件并能引 file:line 证据**。

**Why:** 2026-06-04 评估后台质量，4 个文件（memory/consolidation、memory/indexing、evaluation/figure/figure-relevance、safety/pii-redactor）被子 agent 标为"占位 2-4/10"，用户当场质疑"怎么会有占位"。实读后**四个全是真实现**（figure-relevance 还久经线上调参）。误判根源：子 agent 没读到文件，从"未在关键读取中显示"推断成"空壳"，我又把这种推断当结论转述——违反项目规则"未读过的不评分"。

**How to apply:**

1. 子 agent 报告里出现"未读到/未展示/需补充审视/可能是占位"这类措辞 → 当成"未覆盖"，不是"是空壳"；自己补读再下结论。
2. "占位/stub"判断必须附 file:line 证据（如"throw new Error('not implemented')""函数体只 return null"）。没证据就降级为"未核实"。
3. 转述子 agent 结论前，对高风险负面标签（stub/占位/假测试/死代码）做二次抽样核实。

关联 [[feedback_analysis_before_guessing]]
