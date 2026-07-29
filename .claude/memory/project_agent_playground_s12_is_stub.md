---
name: agent-playground-s12-evolution-half-closed
description: S12 self-evolution 写入侧已落地（postmortem→vector_memory + failureLearner），但消费侧（leader plan duty.md）仍未 RAG 召回历史 postmortem，环路未闭合
type: project
originSessionId: e9f587b9-3572-4652-bf01-a151597e4ef6
---

## 现状（2026-04-29 verify by code read）

`backend/src/modules/ai-app/agent-playground/services/mission/workflow/stages/s12-self-evolution.stage.ts`

**写入侧（已实装，从原 TODO 升级）**：

- ✅ `failureLearner.recordFailure({ key.failureCode: "LEADER_REFUSED_SIGN" })` — 仅 Leader 拒签时入库
- ✅ `store.recordMissionPostmortem(...)` — postmortem markdown 落 `harness_vector_memory`
  namespace=userId, tags=['agent-playground','mission-postmortem',signed/unsigned]
- ✅ emit `mission:evolved` 事件给前端
- ✅ 5 条规则化 recommendations（cost/wallTime/qualityHitRate 阈值）

**消费侧（未实装，闭环未闭）**：

- ❌ `agents/leader/duties/plan.md` 不调 `store.listRecentPostmortems(userId, 3)`
- ❌ `LeaderAgent` plan phase prompt 里没有 prior knowledge / 历史教训 段落
- ❌ S2 leader-plan stage 也未注入 prior postmortem 到 input

**Why 半成品**：
真正的"自我进化"= 写 + 读 闭环。Voyager skill library 核心是 plan 阶段先 lookup 已有 skill。本项目沉淀写已落，但 leader 下次 mission 启动时**实际看不到自己写过的 postmortem**——等于沉淀对系统行为零影响，仅作为运营/调试用。

**How to apply（下一步真闭环）**：

1. `mission-store.service.ts` 加 `listRecentPostmortems(userId: string, n: number)` 查询方法
2. `s2-leader-plan-mission.stage.ts` 在调 `leader.plan()` 前先调 store 查 3 条最近 postmortem
3. `leader.service.ts SupervisedMission.plan()` 接收 `priorPostmortems[]` 参数注入 input
4. `agents/leader/duties/plan.md` 加 "## 你的过去经验（user 历史 mission postmortem）" 段落，让 LLM 显式参考
5. 期望：同 user 同 topic 的第二次 mission 应能看到 plan 出的 dimensions 含历史教训（如"上次 dim X 总 partial → 这次拆得更细 / 换 toolHint"）

**评估指标（决定改完算成功）**：

- 同 user 同 topic 第二次 mission 的 Lead plan dim 列表与第一次差异 ≥ 30%（diff 由 dim 名相似度算）
- 第二次 mission 的 leader.signOff.signed = true 比例（vs 第一次失败的同 topic mission）
