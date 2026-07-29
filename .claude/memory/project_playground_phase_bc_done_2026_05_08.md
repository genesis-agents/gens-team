---
name: agent-playground Phase B+C 整改完成 2026-05-08
description: PR-B1~B3 + PR-C1~C2 五件套连续落地，含 3 个 audit 误判更正
type: project
originSessionId: 62a9828f-0671-4aa6-af68-508d17f2619c
---

2026-05-08 agent-playground 4 路审视后的 Phase B+C 整改五件套（接 Phase A 后连续推进）：

**PR-B1 commit `84d3a6b97`**：删 runWithConcurrency 零 caller 死代码

- runWithConcurrency 实现 (~30 行) + invoker delegate (~7 行) 零业务 caller，仅在 runDagConcurrency cycle fallback 调一次
- audit 误判 runDagConcurrency vs harness DAGExecutor 是双源 —— 实际：前者纯内存数组拓扑（returns TOut[]），后者 DB-backed 任务池（DAGAdapter / fetchExecutable）抽象层次不同
- runDagConcurrency cycle fallback 改用 harness ConcurrencyLimiter（2 行 vs 19 行）
- 加 docstring 说明 runDagConcurrency vs DAGExecutor 边界（防未来误判）
- 净删 62 行，82 specs pass

**PR-B2 commit `8021440d5`**：lengthProfile audit 误判更正（注释级修复）

- audit 判 lengthProfile 全链路废弃，**实际 3 处真实下游活着**：mission-outline-planner（lengthTarget 推 outline 总字数）、chapter-writer（PROFILE_WORD_RANGES 注入 prompt 行 169）、s10 stage（lengthTargetFor 字数 reconciliation）
- per-dim/章 字数确实 depth-driven（不再用 lp），但 lp 作为 user-facing 档位 + chapter-writer prompt hint 与 depth 共存（不冲突）
- 修法：删 per-dim-pipeline.util.ts 的"已废弃 / dual-write" 误导注释 + chapter-writer.agent.ts "不再展示档位给 LLM" 错误注释（行 169 实际仍展示）
- 注释级清理 ~20 行，0 逻辑改动

**PR-B3 commit `789c1e505`**：mission-store 三方法去 userId 双分支重复

- markRerunPatch / markIntermediateState / resetFields 各有 ~20 行复制粘贴的 if(userId) updateMany else update 双分支 + catch+warn（合计 ~60 行重复）
- 提取私有 helper `_runMissionUpdate(id, userId, data, label)` 统一 try/catch 双分支
- 三处 caller 收敛为 1 行；行为完全不变；71 specs pass
- 未来若删 else 分支可单独立项（所有 stage 实测都传 ctx.userId）

**PR-C1 commit `da85ac635`**：rerun-guard SQL LIKE 单一源（YAGNI 修正）

- audit 推荐 P1 上提 event-categories 到 ai-harness/lifecycle，但实际**业务代码零 import**（rerun-guard 是 SQL LIKE 字面量复制，spec 是唯一真实 import 源）
- YAGNI 决策：单一 ai-app 用，等第二个 ai-app 真有 rerun guard 需求再上提
- 同步修真实问题（字面量双源）：rerun-guard.service.ts SQL LIKE 5 行字面量改为动态 from EVENT_CATEGORY.BUSINESS_PREFIXES（map → \$N 参数化）。新增 BUSINESS 前缀只需改 event-categories 一处
- 42 specs pass

**PR-C2 commit `045d5a395`**：tickCost budget exhaustion 暂不上提决策注释

- audit 推荐 P1 上提 tickCost 到 harness/guardrails/budget。但邻居 ai-app（research/TI/writing）都没用 MissionBudgetPool（各自任务级成本统计），playground 是唯一消费方
- YAGNI 决策：等第二个 ai-app 真有 mission-budget exhaustion 需求时再上提（届时 event namespace 参数化）
- 行为不变，加方法 docstring 说明决策

**Phase A+B+C 总成果（8 commits 未 push）**：

- 净删 ~210 行（80 PR-A + 62 PR-B1 + 18 PR-B3 + 50 注释更新）
- 加架构边界 spec 1 条（layer-boundaries.spec.ts）
- 消除真双源 2 处（strip-chart-json + rerun-guard SQL LIKE）
- 修 audit 误判 3 处（runDagConcurrency / lengthProfile / event-categories+tickCost YAGNI）

**audit 误判模式总结（重要 feedback 候选）**：

1. **抽象层次混淆**：runDagConcurrency vs DAGExecutor 表面相似但语义不同（内存 vs DB-backed），audit 报"双源"实际不是
2. **代码 vs 注释失同步**：lengthProfile 注释说"已废弃"但 chapter-writer 行 169 仍注入 prompt，audit 信注释 → 误判
3. **YAGNI vs 框架抽象**：audit 默认推荐"上提让其他 ai-app 复用"，但实际邻居 ai-app 不用同样能力（playground 独家），按 YAGNI 应等 2-3 个用户出现再上提

**Why**: 用户选 Phase A+B+C 一气呵成；Phase D 巨型文件拆分用户主动选"现在不做"
**How to apply**: 后续审计 Agent 必须验证"双源"是否真同抽象层；推荐"上提"前必须扫邻居 ai-app 是否真消费

agent ID 4 个审计 sub-agent 还在: a0d88c617a9e4d8a1 / a35536f8131252aca / ad0785162188b7745 / ab203e897e8dcc9f0
