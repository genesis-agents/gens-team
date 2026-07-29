---
name: Playground 标杆化 9-PR 方案进度（2026-05-04）
description: agent-playground 改造为 Genesis 标杆 ai-app 的 9-PR 方案，已落 7 个；剩余 PR-4 必须等 W21、PR-8 依赖 W22 + skill sediment 后续工作
type: project
originSessionId: 94c0899f-9d18-492b-abde-5c553623a0bd
---

**目标**：把 `ai-app/agent-playground` 改造成 Genesis 所有 Agent Team 业务的标杆 app（todo P0#2 分层架构重构 / 泛化下沉 / 业务上移）。

**Why**：未来新建 ai-app（writing-team / debate-team / planning-team）只需复制 playground 的 mission+roles+agents 骨架，不必复制基础设施代码。当前完成 7/9 PR 后，复制门槛已大幅降低。

**How to apply**：在讨论 playground 重构、新 ai-app 起步、或 W21/W22 主线波次时参考此进度；剩余 2 个 PR 启动时先核对 W21/W22 是否已就绪。

---

## 已落地（7/9）

| PR                               | Commit      | 内容                                                                                                     |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| PR-0 + PR-1 + PR-2 + PR-3 + PR-6 | `b97947a57` | in-progress 重构收尾 + helpers/ 解散 + postmortem-classifier / rerun-lock / similarity 跨层下沉          |
| PR-7a                            | `311c74379` | MissionContext / MissionDeps 拆 7+8 个 phase 子接口（合成 alias 不变）+ s7 标杆窄签名                    |
| PR-7b                            | `90ee95089` | 剩余 11 stage 全部迁到窄 ctx 签名（s1/s2/s3/s4/s5/s6/s8/s8b/s9/s9b/s10）                                 |
| PR-5                             | `69015c76f` | M4 MissionStateService → harness/memory/working/handoff-compactor.service.ts（**提前推进，独立于 W21**） |

## 剩余（2/9）

| PR   | 阻断                         | 内容                                                                                                                                                                                                                                           |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR-4 | 等 W21 memory 契约收敛       | M3 mission-event-buffer 拆分：通用 buffer→harness/memory/event-store/event-replayer，prisma adapter 留 app；含 `agentPlaygroundMissionEvent` 表 + `accepts(prefix='agent-playground.')` 业务过滤，纯 prisma schema 耦合，必须等 W21 收敛后再做 |
| PR-8 | 等 W22 + skill sediment 后续 | 8 agent + 18 duty.md 接 ISkillProvider；与 project_skill_sediment_2026_05_01.md 沉淀的 17 SKILL.md 对接；agent class 改用 SkillRegistry.get(skillId).buildPrompt() 替代 buildPromptFromDuty                                                    |

## 关键决策

**PR-5 提前推进的判断**：

- 方案原说 PR-5 必须等 W21
- 实际审视：MissionStateService 是纯函数 estimate+compress，无 checkpoint contract、无 memory tool provider 耦合
- W21 的核心是 checkpoint 契约唯一化 + memory tool provider 化，与 pure compaction primitive 正交
- 因此 PR-5 可独立于 W21 推进，并 commit 留下"运行说明"标记决策路径

**PR-4 必须等 W21 的判断**：

- mission-event-buffer 与 W21 的 protocols/realtime + memory/event-store 收敛重叠
- 含 prisma `agentPlaygroundMissionEvent` 表 schema，是真 contract
- 不抢跑，避免 W21 推倒重来

**PR-7 提前推进的判断**：

- 方案原说 PR-7 必须等 W22
- 实际审视：PR-7 是纯 app 内 type 重构，与 base layer 整改无依赖
- "等 W22" 的真实理由是"等 PR-1/2/3/6 合并"，但 W22 是 base layer 整改、playground app 内 type 重构与之正交
- 因此 PR-7 可独立推进

## 验证指标

| 指标                       | 重构前                     | 现在                    | 完整目标               |
| -------------------------- | -------------------------- | ----------------------- | ---------------------- |
| `team.mission.ts` 行数     | 1097（含 690 死注释）      | 816                     | < 400                  |
| `MissionContext` 字段      | 23 mutable optional 全打包 | 7 phase 子接口分组      | （已达成）             |
| `MissionDeps` 字段         | 23 个全打包                | 8 phase 子接口分组      | （已达成）             |
| Stage 签名表达上下游       | ❌ 全 MissionContext       | ✅ 12/12 用窄 phase ctx | （已达成）             |
| 通用基础设施代码（app 内） | ~2000 行                   | ~1500 行                | < 200（PR-4/8 完成后） |
| `helpers/` 杂物袋          | 1                          | 0                       | 0                      |

**全绿验证**：1392 tests / 58 suites / arch boundary 7/7 / type-check 0 error。
