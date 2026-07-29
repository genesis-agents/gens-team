---
name: project-playground-fail-closed-gates-2026-05-23
description: Playground 四症状(兜底/低分/728字/极慢)同一病根=fail-closed 过严闸门；修复+多路评审+加固，已推 main f43ca020f
metadata:
  node_type: memory
  type: project
  originSessionId: a071d038-7b22-4c8e-b662-cb7644667d9c
---

2026-05-23：修复 Playground「频繁兜底 + 持续低分 + 章节恒 728 字 + 推进极慢 + 顶层失败但详情通过」。

**根因（一个病）**：整条流水线 fail-closed——任何不完美都被放大成整袋丢弃/重试风暴/截断/夹逼定值/状态多处各算。具体闸门：

- s3 `r.state==="completed"` 才算成 → 否则 findings 整袋丢（degraded 也丢）
- minFindingsThreshold=10 硬门槛 → LLM plateau 4-8 → reject 风暴 → max-iter → 降级（也是"慢"主因）
- researcher finalize `outputLength:"long"`(8000) → 中文 JSON 截断 → repair 静默削薄
- 每章字数 = dimTargetWords/targetChapterCount 被 uniqueSources 夹逼成定值 → writer 硬锚 → 恒 728
- 维度状态前端 todo-ledger 三处互相打架（phase 硬覆盖 + 重复 set + 校准守卫阻止恢复）

**修复**（15 commits）：s3 salvage(output??partialOutput, well-formed filter, collectionUsable 统一上报) + 修死重试码(RUNNER_LOOP_LIMIT→LOOP_MAX_ITERATIONS/LOOP_BUDGET_EXHAUSTED) + harness max-iter 保留 parsed partial + minFindings 10→5 + researcher long→extended + engine 截断信号 + grade 轴改相对 + 前端单一权威派生 + 字数区间 + 两套分数 UI 区分。

**关键教训（多路评审抓到）**：放松"假失败"会开"假成功"的口子。对抗性评审发现 salvage+minFindings5+相对评分 复合 → 单来源维度可假"done 80"。**加固**：salvage 补 evidence 非空校验、评分服务端接地（sources_sufficiency 按真实 uniqueSources 平滑封顶 + overall 由各轴均值重算，不取 LLM verbatim）。

**方法论**：3 路并行评审（正确性/业务仿真/对抗性）是必须的——对抗性那路才抓到过度修正。见 [[feedback-verify-subagent-output-independently]] [[feedback-overclaim-cutover-verify-by-callgraph]]。

**残留(低优先,未做)**：agent-runner partialOutput 优先级未覆盖 wall_time；前端 chapter:done 丢失乐观 resolve；repaired 标志无消费方；非来源轴 LLM 评分倾向。
