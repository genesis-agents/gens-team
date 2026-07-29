---
name: audit "双源" 判断必须验证抽象层次
description: arch-auditor 报"双源 / 应上提"前必须验证两份代码是否真在同一抽象层 + 第二消费方是否真存在
type: feedback
originSessionId: 62a9828f-0671-4aa6-af68-508d17f2619c
---

arch-auditor 给"双源 P0 必修"或"上提到 harness P1"判断时，必须先验证两个反向证据：

1. **双源真验证**：两份相似代码是否在**同一抽象层次** + **同样输入/输出契约**
   - 反例：runDagConcurrency（内存数组 + dependsOn 字段，returns TOut[]）vs harness DAGExecutor（DAGAdapter 接口 + fetchExecutable/countPending DB-backed 任务池）—— 表面都叫"DAG"实际语义完全不同
   - 反例：playground 的 stripChartJsonFromContent local 副本 vs ai-engine 标准源 —— 这是真双源（输入输出契约一致），但 audit 也漏掉一份在 ai-engine/llm/output-parsing 已存在
   - 验证方法：grep 两份函数签名 + 实际 caller 期望返回类型，对照抽象语义

2. **上提"让其他 ai-app 复用"必须扫邻居**：
   - 反例：audit 推荐 event-categories 上提让 research/TI/writing 复用 → 实际邻居都没 rerun guard
   - 反例：audit 推荐 tickCost budget exhaustion 上提让其他 ai-app 复用 → 实际只 playground 用 MissionBudgetPool
   - 验证方法：grep 邻居 ai-app 是否真有同需求 / 同 import / 同业务模式

**Why**: 2026-05-08 playground 4 路 audit 5 项 P0/P1 中有 3 项是这两类误判（runDagConcurrency 双源 / event-categories 上提 / tickCost 上提）。盲目按 audit 推荐做反而引入复杂度（YAGNI）或破坏正确抽象（强行合并不同层次）

**How to apply**: 收到 arch-auditor 报告后：

- 标"双源"项：grep 两份代码 caller 验证语义一致；若不一致，注释里写明边界（如"runDagConcurrency 是内存版，与 DAGExecutor 是 DB 版的不同抽象"）
- 标"上提到 harness P1"项：grep 邻居 ai-app 是否真有第 2 消费方；若没有，按 YAGNI 等第 2-3 个真用户出现再上提，加注释说明决策
- 元教训：4 路并行 audit 给覆盖度，但抽象层判断容易出错；落地时 grep 验证比 audit 推荐更可靠
