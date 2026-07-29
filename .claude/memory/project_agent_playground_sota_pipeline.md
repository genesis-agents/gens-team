---
name: agent-playground-sota-pipeline
description: 12-stage mission pipeline (s1-s12 含 s8b/s9b 子阶段) + Quality v3 五件套 — 当前 main 分支真实形态 (verify by code 2026-04-29)
type: project
originSessionId: b038a2d4-542b-4c8b-adfa-b4ade440bb81
---

## 当前形态 (2026-04-29 verify by code)

> 此前 8-node 描述已过时。Quality v3 沉淀（PR ti-capability-sediment-v3）后，pipeline 是 **12 stage + 2 sub-stage**：

```
S1  budget       s1-mission-estimate-budget.stage.ts
S2  plan         s2-leader-plan-mission.stage.ts
S3  research     s3-researcher-collect-findings.stage.ts (内嵌 per-dim chapter pipeline)
S4  assess       s4-leader-assess-research.stage.ts (patch 上限=2 防 retry 风暴)
S5  reconcile    s5-reconciler-cross-dim-fact-check.stage.ts (factTable+conflict+gap)
S6  analyst      s6-analyst-synthesize-insights.stage.ts (Reflexion + 双轮 retry)
S7  outline      s7-writer-plan-outline.stage.ts (thorough+ 才跑 — 但 Writer 当前不消费此 outline)
S8  draft        s8-writer-draft-report.stage.ts (judgeWithConsensus retry×2 + memory + assemble)
S8B enhance     s8b-section-quality-enhancement.stage.ts (新, v3 沉淀消费)
S9  critic L4   s9-reviewer-critic-l4.stage.ts (独立 meta-review)
S9B evaluate    s9b-report-objective-evaluation.stage.ts (新, v3 沉淀消费)
S10 sign-off    s10-leader-foreword-and-signoff.stage.ts (verdict↔score 强约束)
S11 persist     s11-mission-persist.stage.ts
S12 evolve      s12-self-evolution.stage.ts (异步, postmortem 已落库；消费链未闭)
```

## Quality v3 沉淀五件套 (在 ai-harness/governance/critique/)

1. **SectionSelfEvalService** — 4 维 self-eval (analytical_depth/evidence/actionability/writing)
2. **SectionRemediationService** — 弱维度合并补救 + delta < -0.3 退步保护
3. **ReportEvaluationService** — EVALUATOR 模型 10 维客观评分 + 多模型对比
4. **ReportQualityGateService** — code-enforced 全报告级质量门控
5. **QualityTraceComputeService** — 全链路质量 trace 纯计算

接入位置：S8B (section enhancement) + S9B (report evaluation) + S10 (objectiveScore 注入 leader signoff)

## SOTA 对标精华 (2026-04-29 vs 业界)

**超 SOTA 的 6 处**：

- Reconciler 强阻塞跨源对账（业界普遍让 Writer 隐式处理）
- Leader accountabilityNote 强制引用历史决策（业界孤品）
- Lead 拒签 → mission 失败语义闭环（业界孤品）
- 失败码标准化 + cross-mission failureLearner 黑名单 + successFallback 双向回写
- 12 stage 全 graceful degradation（每节点独立 try-catch + 降级路径明确）
- Quality v3 五件套（业界把 quality 当散点 LLM 调用）

**离 SOTA 仍差**：

- Plan 不暴露给用户预览/编辑（OpenAI Deep Research 已是行业基线）
- JudgeService 三 verifier 用同模型不同 prompt（应跨 model family 真去相关）
- S12 消费链未闭（postmortem 已写库，但 leader plan duty.md 未读，见 s12-evolution-half-closed memory）
- S7 Writer outline 是半成品节点（出 outline 但 SingleShotWriterAgent 不消费）
- 没有 Human-in-the-Loop 中断点（plan/critic/signoff 都纯自动）
- 没有 graph DSL（12 stage hand-written，无 declarative DAG）

## How to apply

- 描述 playground 状态时不要再说"8-node"，固定用"12-stage + S8B/S9B"
- 修 lengthProfile 兑现率 → 重点改 per-dim-pipeline.util.ts:482 字数硬门槛 + S10 signoff 字数兑现率审计
- 修近期 mission 全 failed → 调 leader signoff 阈值分档（quick=70 / deep=80 / mega=85），coverageScore<90 全拒签太严
- 修 S12 真闭环 → 见 project_agent_playground_s12_is_stub memory（重命名为 half-closed）
