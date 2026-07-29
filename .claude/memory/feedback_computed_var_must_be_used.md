---
name: feedback_computed_var_must_be_used
description: 算出的 routing/分类变量必须真用到，只 log 不用是反模式；WeChat articleType 死症事故
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

routing/分类变量（如 `articleType = len > N ? "A" : "B"`）算了就必须真正用到导航/选择逻辑中，**不允许只 log 不用**。

**Why:**

- 2026-05-16 WeChat publish 死症根因：`articleType = contentLength > 1000 ? "10" : "77"` 计算了 + log 了，但所有 home 页导航路径都用同一组 button text（"图文"/"图文消息"/"文章"），不论 articleType。"文章"按钮恒打开 type=77 小绿书编辑器（≤1000 字限），导致 2299 字长文 ProseMirror 真截到 705 字、save button silently no-op、连续 4+ 次发布失败
- 算出的分类变量给读者一种"已分流"的错觉，让 review 跳过这块；实际未使用 = 死代码 + 假承诺
- "log 它"不等于"用它"；log 只服务诊断，不影响行为

**How to apply:**

- 写完 `const x = computeX()` 立刻问："下一段代码读 x 来分流了吗？"没有就删变量
- log 输出 routing 决策时必须紧跟用该决策的真实代码：`log(x); if (x === ...) doA(); else doB();`
- review 时搜 `articleType|routeKey|category|mode` 这类变量名，确认每次出现都进入条件分支，不只是 string interpolation
- 单测覆盖："变量取 A vs B 时下游行为应不同"，证明它真起作用

**Related:** [[feedback_no_dual_sources]] [[feedback_implementation_rounds_need_review_too]]
