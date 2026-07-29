---
name: agent-playground Phase A 整改完成 2026-05-08
description: PR-A1/A2/A3 三件套连续落地（边界违规 + 双源 + S12 死代码），3 commits 已提交未 push
type: project
originSessionId: 62a9828f-0671-4aa6-af68-508d17f2619c
---

2026-05-08 agent-playground 最简性 4 路审视后的 Phase A 整改三件套（连续执行 + 各自 commit）：

**PR-A1 commit `101d7f444`**：消除 ai-app 跨 app 直接 import + 双源 strip-chart-json

- 真因：playground per-dim-pipeline.util.ts:47 import topic-insights/utils 内部路径（D2 模块隔离违规）
- 同时发现 stripChartJsonFromContent 三份漂移（topic-insights local 含 #81 fence 修复 / ai-engine/llm/output-parsing 缺 #81）
- 修法：删 topic-insights 本地副本 + #81 chartjs/chart-data/chart fence 修复合并到 ai-engine 单一源 + 6 处 caller（topic-insights 3 + agent-playground 2）改 import @/modules/ai-engine/facade
- 加架构边界 spec：layer-boundaries.spec.ts 新增"ai-app 模块不得跨 app 直接 import 其他 ai-app 内部"断言（57 tests pass），allowlist contracts shim + custom-agents→agent-playground (R-CA 设计决定)
- 元教训：facade 已 re-export 的能力，不要新建第三份；先 grep 确认 canonical 位置再操作

**PR-A2 commit `2b289edd8`**：删 estimateUsdFromTokens 本地 shadow → harness facade 单源

- agent-playground-event-relay.ts:11 本地定义与 harness facade 同名函数完全重复（tokens \* 0.000003）
- 2 行修改，行为完全一致，未来 harness 升级真实定价（基于 ai_models.price_input_per_million）会自动跟随，避免计费偏离

**PR-A3 commit `02b383479`**：删 S12 hook builder 死代码（净 120 行）

- s12-self-evolution 已从 PLAYGROUND_PIPELINE.steps 移除（fire-and-forget 走 fireSelfEvolutionPostlude），但 dispatcher.buildS12LearnHooks (43 行) + buildNotYetWiredHooks (25 行) + PlaygroundHookNotYetWiredError 类 (14 行) 全是不可达死代码
- 13 个真实 step 全部命中显式 if 分支，fallback NotYetWired 永不触发
- buildBaseHooksForStep fallback 改 throw Error（明确合约：所有 step 必须显式 hook builder）
- 4 specs / 33 tests pass

**Phase A 总成果**：

- 3 commits 已提交未 push（用户未要求 push）
- 净删 ~125 行 + 加 1 条架构边界 spec（防回归）
- playground 内部最简性 5.5/10 → 略改善（主要 dual-write/dispatcher 巨型化未碰）
- 下一步：Phase B（双源消除 P0）/ Phase C（框架上提 P1）/ Phase D（巨型文件拆分）—— 用户当前选择了"现在不做"D，B/C 待后续决定

**Why**: 用户 audit 后选 Phase A 一气呵成（不写 design / 不做 D），按 feedback_autonomous_phase_execution 连续 commit
**How to apply**: 后续 Phase B/C 启动前先确认 base = `02b383479`；rerun playground audit 时这些点已修，应不再被发现

agent ID 4 个审计 sub-agent 还可继续问：a0d88c617a9e4d8a1 / a35536f8131252aca / ad0785162188b7745 / ab203e897e8dcc9f0
