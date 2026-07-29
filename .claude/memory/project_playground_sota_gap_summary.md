---
name: playground-sota-gap-summary-2026-04-29
description: 一次系统对标得出的 playground vs 业界 SOTA 差距清单 + P0/P1 优先级，2026-04-29 输出
type: project
originSessionId: deep-arch-analysis-2026-04-29
---

## 总评分 7.6 / 10

已超 OSS 主流 (CrewAI / AutoGen / LangGraph 等)；与 Anthropic Multi-Agent Research、OpenAI Deep Research、Magentic-One 在工程纪律层面同档；落后在"用户在环 + 自我进化真闭环 + 动态 supervisor 路由"三处。

## 6 处真正达到或超过 SOTA

1. Reconciler 独立 LLM 节点 + Zod 业务规则强校验（业界让 Writer 隐式处理）
2. Leader 4-phase 全程在场 + accountabilityNote 强制引用历史决策
3. Lead 拒签 → mission 失败语义闭环（任何主流 framework 都没做到）
4. 失败码标准化（ORCH_DIMENSION_DEGRADED 等）+ HarnessFailureLearner 跨 mission 黑名单 + successFallback 双向回写
5. 12 stage 全 graceful degradation 矩阵
6. Quality v3 五件套（SectionSelfEval / Remediation / ReportEvaluation / QualityGate / QualityTraceCompute）

## 6 处仍落后 SOTA

| #   | gap                                                               | 业界基线                              | 修复成本     |
| --- | ----------------------------------------------------------------- | ------------------------------------- | ------------ |
| 1   | Plan 不暴露用户预览编辑                                           | OpenAI Deep Research 行业基线         | 中（1 周）   |
| 2   | JudgeService 三 verifier 同模型                                   | Anthropic / o1 用跨 model family      | 中（3 天）   |
| 3   | S12 消费链未闭（postmortem 写库但 leader plan 不读）              | Voyager skill library 核心            | 小（2 天）   |
| 4   | S7 Writer outline 半成品（出 outline 但 SingleShotWriter 不消费） | STORM outline-then-fill               | 中（3-4 天） |
| 5   | 无 Human-in-the-Loop 中断点                                       | Devin / Cursor / OpenAI Deep Research | 中（1 周）   |
| 6   | 12 stage hand-written 无 graph DSL                                | LangGraph StateGraph                  | 大（2-3 周） |

## P0 改动清单（按 ROI 排序）

1. **Leader signoff 阈值分档** — 当前 coverageScore<90 强制 quality-failed 太严，导致近 5 mission 全 failed。改为 quick=70/deep=80/mega=85。1 天工作量
2. **S12 闭环真闭合** — store.listRecentPostmortems(userId, 3) → 注入 leader plan duty.md。2 天工作量
3. **lengthProfile 兑现率审计** — chapter-writer 字数 < target×80% 时 leader signoff 强制 acceptable 上限，避免 mega 档承诺 200K 实际 5K 仍签字。半天工作量

## How to apply

- 评估 playground 改动时拿这份 gap 表对照 — 别再做 SOTA 已超的部分（如再加一个对账层）
- 用户问"playground 有多 SOTA" 直接引这份评分（7.6/10），不要泛泛说"很先进"
- P0 三件如果都做完，评分应到 8.5+，到时再做下一轮 gap 分析
