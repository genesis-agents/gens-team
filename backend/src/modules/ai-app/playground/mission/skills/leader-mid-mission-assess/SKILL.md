---
name: leader-mid-mission-assess
description: M1 mid-mission assessment — leader decides accept-all / patch / redirect / abort + per-dim action with retry strategy after researcher results land
version: "1.0.0"
tags:
  - leader
  - mid-mission
  - decision
  - governance
activateFor:
  - leader
  - mission-leader
  - mid-mission-arbitrator
---

# Leader Mid-Mission Assessment Protocol (M1)

After all researchers report back, the leader inspects results and decides
the next action. **This decision becomes part of the M7 accountability record** —
choosing `accept-degraded` here means owning that choice at signoff.

> ★ 2026-08-03 校准说明：本技能正文会与 Leader 的系统提示词**同时**注入同一次调用。
> 因此这里**只讲方法与质量判断**；凡是「字段形状 / 阈值 / 条数 / 达标线」一律**以系统提示词
> 与 harness 注入的 outputSchema 为准**。历史版本在此复述了一份形状与几条并不存在的硬门槛，
> 生产日志显示模型会照文档写、然后被 schema/业务规则驳回、耗尽重试后兑成垃圾产物。

## Inputs you receive

- `myPlan.goals` — 你在 M0 亲口承诺的 `successCriteria` / `qualityBar`
  （`qualityBar.minSources` / `minCoverage` / `hardConstraints` 的**具体数值随输入注入**，
  按注入值判断，不要用记忆里的数字）
- `myPlan.dimensions[]` — 你 M0 拆的维度（`id` / `name` / `rationale` / `facet` / `toolHint`）
- `researcherOutcomes[]` — 实际结果，每项含
  `{ dimensionId, dimensionName, state, findingsCount, sources[], summary, failureCode?,
meetsMinSources?, minSourcesRequired?, minSourcesDelta?, uniqueDomains? }`

> ★ 2026-08-03 对齐真实 Input schema：`meetsMinSources` / `minSourcesRequired` /
> `minSourcesDelta` 是 pipeline 预先算好的**达标判定**，就是为了免掉 LLM 心算偏差。
> **直接读这几个字段，不要自己拿 findingsCount 去和记忆中的门槛比。**

## Decision 1 — overall direction

> 取值集合以注入的 outputSchema 为准；下表只解释**各取值的含义与选用时机**。

| `decision`   | 含义与真实后果                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `accept-all` | 所有 dim 可用 → 直接进入 reconciler                                                                           |
| `patch`      | 至少 1 个 dim 需要处理，具体动作在 per-dim 上标注                                                             |
| `redirect`   | 现有 dim 答不了某些 `successCriteria`，需要增补新维度（写进 `newDimensions`）；下游会把新维度追加进 plan 再跑 |
| `abort`      | 多个 critical 失败、mission 无法挽救。**整个 mission 立即终止并向用户报错**，没有后续阶段                     |

> `abort` 是**不可逆的整体终止**，不是"批量重试"的强化版。只有在继续跑也交付不出东西时才用。

## Decision 2 — per-dimension action

| `action`              | 含义与真实后果                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `accept`              | 该 dim 通过                                                                                                                     |
| `accept-degraded`     | 有瑕疵但不重派 —— foreword 必须注明                                                                                             |
| `retry-with-critique` | 同 spec 重跑，把你的 `critique` 附给 researcher                                                                                 |
| `replace-spec`        | 期望换 agent spec；**当前实际只注册了 ResearcherAgent**，所以它等价于"带更激进搜索策略的重跑"，`newAgentSpecId` 会并进 critique |
| `abort`               | 放弃该 dim（该 dim 的 findings 被清空，`critique` 会作为放弃原因写进产物）；foreword 必须列入 `whatRemainsUnclear`              |

## Decision 2.5 — retry/replace strategy（技能核心价值：怎么选对）

`action ∈ {retry-with-critique, replace-spec}` 时应主动给出 `strategy`：

| `strategy`        | 什么时候选                                                               | 效果                                                   |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `fresh-collect`   | **findings 本身不可信**：来源太少 / 来源质量低 / 关键证据缺失 / 信息过时 | 从头重跑 researcher；新建独立任务行；独立打分          |
| `reuse-recompute` | **findings 够用，问题在写作或评分**：论点弱 / 引用密度低 / 明显 AI 腔    | 复用现有 findings，只重写章节 + 重新评分；不新建任务行 |

诊断口诀：先问"**证据够不够**"。够 → `reuse-recompute`；不够 → `fresh-collect`。
省略时下游按 `fresh-collect` 兜底，但那是兼容用的默认值，**不要靠默认蒙混**——
把 findings 够用的 dim 误判成 `fresh-collect`，等于白烧一遍搜索预算。

## Decision 3 — rationale

一段话说清整体决策 + 每个 dim 的处理理由。泛泛的"结果可以接受"没有信息量，会被驳回。

## Output shape — MUST use ReAct finalize wrapper

> ★ 2026-08-03：输出字段形状以 harness 自动注入的 `outputSchema` 为准（agent-runner 的 `describeOutputSchemaForLlm`，唯一权威）。
> 本文档**不再复述形状** —— 两份描述一旦漂移，模型会照文档写、然后被 schema 驳回、耗尽重试后兑成垃圾产物（2026-08-03 生产实证）。
> 本节只讲**内容与质量要求**。

## Hard rules（会被业务规则直接驳回的四条）

> ★ 2026-08-03：本节只保留 `LeaderAgent.validateBusinessRules` 里**真实存在**的门槛。
> 旧版另有「redirect 必须有 newDimensions」「abort 必须每个 dim 都 abort」「strategy 必填」
> 三条，代码里并不存在（`strategy` 在 schema 里显式是 optional，正是为了不误拒旧 case）——
> 写成硬规则会让模型为了"合规"去编造不该有的动作，已下沉为下方的判断建议。

- `perDimension[]` 必须覆盖**你收到的 `researcherOutcomes[]` 里每一个 `dimensionId`**，漏一个即驳回
  （`dimensionId` 要与输入里的字符串**逐字一致**；对不上 plan 的 id 会被下游静默跳过）
- `decision = "patch"` 时，`perDimension[]` 不能全是 `accept`（至少 1 个非 `accept`）
- `action = "retry-with-critique"` 必须带非空 `critique`
- `action = "replace-spec"` 必须带非空 `newAgentSpecId`

## 判断建议（不是硬门槛，但决定质量）

- 选 `redirect` 就要真的给出 `newDimensions`，否则它退化成一次没人接的 `patch`。
- 选整体 `abort` 前先确认：逐 dim 处理真的救不回来吗？它会当场终止整个 mission。
- **retry 不是免费的**：pipeline 对「单轮 retry 数量」和「patch 轮数」都有上限，超出的
  retry 会按 findings 数从少到多只保留最弱的几个，其余被**静默降级为 `accept-degraded`**。
  所以要主动排序：把重试额度花在最弱、且重试后最可能达标的 dim 上，而不是"能重试的都重试"。
- 已标记达标的 dim 默认 `accept`。"再优化一下"不是重试理由；无意义重试烧预算又拖慢用户。
- `accept-degraded` 是**正当选项**，不是失败：差距不大且不影响 successCriteria 时，接受并
  在 M7 说明，比赌一次重试更负责。

## Forward link to M7

Every `accept-degraded` choice you make here will appear in your M7
`accountabilityNote` requirement. Same for every `abort` (which moves the dim
to `whatRemainsUnclear` in the foreword). Pick decisions you can defend later.

## What this skill is NOT

- Not for grading research outputs (use `dimension-quality-review`)
- Not for cross-dim fact-checking (use `cross-dim-fact-check`)
- Not for final signoff (use `leader-signoff`)

This skill produces **one mid-mission decision** with per-dim resolution and
retry strategy. Downstream pipeline branches on `decision` and per-dim `action`.
