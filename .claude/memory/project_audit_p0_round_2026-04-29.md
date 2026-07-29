---
name: audit-p0-round-2026-04-29
description: 基于 SOTA 审计报告（评分 7.6/10）的 P0 三件套真实修复 — clamp/lengthAccuracy/postmortem 闭环 (2026-04-29)
type: project
originSessionId: 2823765d-c5eb-49e8-8fc4-98cd7201499f
---

## 起点

读 `docs/architecture/ai-apps/agent-playground/mission-pipeline-sota-audit-2026-04-29.md`（503 行 SOTA 对标）后，**没照搬审计 P0 表面建议**，而是用代码 verify 每条 claim。发现：

- 审计 P0#1 "leader signoff 阈值过严 (coverageScore<90 强制 fail)" — **不准**：实际拒签线是 `minCoverage × 0.7`，且 plan.md 已 prompt LLM "minCoverage 不要给 90+，建议 60-80"。真因是 LLM 违反 prompt 给了 90+。
- 审计 P0#2 "S12 闭环未真正消费" — **准**：listRecentPostmortems 已实装 30 行（mission-store.ts:487），但 grep 全代码 0 caller，plan.md 也无占位符。
- 审计 P0#3 "lengthProfile 兑现率审计" — **被低估**：report-assembler.ts:1026-1042 已实装 lengthAccuracy 评分维度，warning 已推 quality.warnings。真 gap 是"已落但不闭环"——lengthAccuracy 信号没反向影响 leader signoff 决策。

## 落地（3 件，~半天工作量，跳过审计 P0#1 plan-confirmation endpoint 因工作量 1 周且涉前端联调）

### A. clamp minCoverage ≤ 80（半小时）

- 文件：`leader.service.ts plan()` 后处理
- 行为：output.goals.qualityBar.minCoverage > 80 时 clamp 到 80，记到 decisions
- 解决：审计指控的"近 5 mission 全 fail"真因（LLM 违反 prompt 给 90+）

### B. lengthAccuracy → leader signoff 反向闭环（半天）

- DTO/Schema：`LeaderFinalQuality` + `leader.agent.ts` finalQuality schema 加 lengthAccuracy / targetWordCount
- 注入：`s10-leader-foreword-and-signoff.stage.ts` 把 `reportArtifact.quality.dimensions.lengthAccuracy` + `lengthTargetFor(input.lengthProfile)` 传给 leader.signOff
- 业务规则：`leader.agent.ts validateBusinessRules` signoff phase 加 lengthAccuracy<60 且 verdict ∈ {excellent, good} 的 issue（强制重 sign，verdict ≤ acceptable）
- 副作用：导出 `lengthTargetFor` 让 stage 复用（避免 stage 重新硬编码字数表）

### C. listRecentPostmortems 闭环（2 天工作量，今天落了）

- Schema：`leader.agent.ts` plan phase Input 加 priorPostmortems 数组（missionId/topic/summary/recommendations/leaderSigned/qualityScore/createdAt）
- Service：`leader.service.ts plan(opts?)` 接收 priorPostmortems
- Stage：`s2-leader-plan-mission.stage.ts` 调 `deps.store.listRecentPostmortems(userId, 3)`，失败 fallback 空数组（不阻塞）
- Prompt：`agents/leader/duties/plan.md` 顶部加 `## 你的过去经验` Handlebars 段落（{{#if priorPostmortems.length}} ... {{/if}}），强制 leader 在 themeSummary/initialRisks 显式引用至少 1 条教训

## 验证

- `npx tsc --noEmit` —— 0 错误（仅另一 Agent 的 config.module.ts 缺 ResourceLifecycleModule，与本次无关）
- `npx jest --testPathPattern=(agent-playground|leader)` —— 19 套件 / 405 用例全绿
- TI 行为：零字节修改

## 预期效果（评分提升路径）

审计 7.6/10 → 预计提升到 8.0+：

- "业务流闭环 (self-evolution)" 从 6.5 → 8.0+（S12 真消费）
- "Agent 设计" 维持 8.5（schema 业务规则二级校验更彻底）
- 产线问题"近 5 mission 全 quality-failed"应消失（A clamp 解决根因 + B lengthAccuracy 防止字数缩水签字）

## How to apply

- 不接受审计/PRD 的表面 claim，都要用代码 verify
- 审计提的 P0 不一定是 ROI 最高的——读完代码再排序，1 小时 verify 比 1 周返工值
- "沉淀已落但消费链断"是 LLM 应用最常见的"半成品"模式（v3 五件套 + S12 都有过），下次新增 quality service 时主动验证消费链
- prior knowledge 注入 prompt 用 Handlebars `{{#if X.length}}` 包裹是必要的，避免空数组也输出空段落污染 LLM context

## Round 2 (P1 项, 同一会话顺势落地) — commit ac0e58379

### D. JudgeService 三 verifier 跨 model family

- judge.service.ts 加 MODEL_TYPE_BY_VERIFIER：
  - self → CHAT (writer 主模型严苛自评)
  - external → EVALUATOR (独立评审模型，最可能不同 family)
  - critical → CHAT_FAST (不同 tier，常 Haiku/Mini/Flash)
- 用户未配置某 type 时 chat() 自动 fallback CHAT，无 regression
- BYOK 配置不同 family (Sonnet/GPT-4o/Haiku) 时 consensus 真去相关

### E. S7 Writer outline 真消费

- 之前是死字段（s7 仅 emit 给前端 trace）
- mission-context.ts 加 outlinePlan field
- s7 stage 写 ctx.outlinePlan; s8 stage 注入 SingleShotWriter input
- single-shot-writer.agent Input schema 加 outlinePlan optional
- buildSystemPrompt 加 buildOutlineGuidance：当有 outline 时输出 "MUST FOLLOW" 章节列表
- 提升 epic/mega 长文兑现率

## 评分提升估算（基于审计 §4.1）

审计基线 7.6/10，本会话两轮提交后预计提升到 **8.4-8.5/10**：

| 维度                      | 基线 | 提升后 | 关键改动                                   |
| ------------------------- | ---- | ------ | ------------------------------------------ |
| 业务流闭环 self-evolution | 6.5  | 8.5    | C. S12 → S2 真闭环                         |
| Agent 设计                | 8.5  | 9.0    | A. clamp 防御 + B. lengthAccuracy 业务规则 |
| Harness 抽象              | 8.5  | 8.8    | D. judge 跨 family                         |
| 业务流深度                | 9.0  | 9.0    | (没改)                                     |

P2 项（graph DSL / SubagentSpawner / mid-mission resume）每件 2-3 周，
超出单会话范围，建议单独立项，本会话不展开。

## Round 3 (字数兑现率真因) — commit 9313dcd23

审计未列，代码挖到的真因：

1. **chapter-writer outputLength=long** → 8000 maxTokens 等于 targetWords 上限，中文 1:1 token，LLM 必被截断到 ~80%
   修复：升到 extended (16000)，budget 22K
2. **dimension-integrator outputLength=long** → 多章拼接后字数远超 8000 token
   修复：升到 extended (16000)，budget 22K
3. **MAX_REVISION_ATTEMPTS=2** → 配合截断问题，2 次 revise 不够
   修复：升到 3 (最多 1+3=4 attempts)

合起来预期把"用户实测 25K → 实际 5K (20%)"提升到 ≥60%。

## Round 4 (sediment 也有同问题) — commit 21a43e8b5

- section-remediation.service.ts (ai-harness 沉淀) outputLength=long → 8000
  重写 5000+ 字章节也会被截。修复：升到 extended (16000)。
- 自查：token 上限是 maxTokens-vs-targetWords 这一类系统性 gap，整个 quality v3 沉淀链应同步审计

## 评分提升估算（更新版）

审计基线 7.6/10，4 轮迭代后预计提升到 **8.4-8.6/10**：

| 维度                      | 基线     | 提升后    | 关键改动                                    |
| ------------------------- | -------- | --------- | ------------------------------------------- |
| 业务流闭环 self-evolution | 6.5      | 8.5       | C. S12 → S2 真闭环                          |
| Agent 设计                | 8.5      | 9.0       | A clamp + B lengthAccuracy + token 上限治理 |
| Harness 抽象              | 8.5      | 8.8       | D. judge 跨 family                          |
| 业务流深度                | 9.0      | 9.0       | (无变化)                                    |
| 字数兑现率（生产实证）    | 实测 20% | 期望 60%+ | Round 3+4 token 治理                        |

## 通用方法论（核心收获）

1. **不接受审计/PRD 的表面 claim** — 都要用代码 verify。审计 P0#1 "阈值过严"是错命题，真因是 LLM 违反 prompt
2. **真问题 vs 防御性修复要诚实区分** — D (judge 跨 family) / E (S7 outline) 是防御性 / 高端 use case，非阻塞 production；A/B/C 才是当前痛点
3. **token 上限是 LLM 应用最易忽视的系统性 gap** — `outputLength: "long"` (8000) 看起来"够长"，实际等于章节 targetWords 时必被截断。整个 sediment 链一起审计
4. **半成品消费链是 LLM 应用最常见模式** — listRecentPostmortems 已实装 30 行 0 caller / S7 outline 死字段 / lengthAccuracy 已算未消费 — 都是这一类
5. **跨 Agent 协作时白名单文件** — 本次 4 轮仅触动我自己的 agent-playground / harness/critique 文件，未触碰另一 Agent 的 explore/ingestion/prisma

## 后续待办（审计 P2/P3，下次另开）

- graph DSL — LangGraph StateGraph 化，2-3 周
- SubagentSpawner 接通 — Writer 动态 spawn 子 chapter writer，2 周
- EvalPipeline → nightly regression CI，1 周
- mid-mission resume — MissionStore 加 stage cursor，2-3 周
- writer 主模型 retry 升级 STRONG tier (复用 model-tier 沉淀)
