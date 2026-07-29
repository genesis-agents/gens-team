---
name: stage-emit-missing-bug-pattern
description: 5 个 stage 文件漏 emit stage:started/completed → 前端任务卡永远卡待启动；同症状不同层于章节卡 fall-through，且暴露 workflow 控制权应回归 harness 的元问题
type: project
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

## 2026-05-06 用户实证：mission 9ccedf16 截图 4 红框 #11 卡待启动

### 真因 1：5 个 stage 文件 grep stage:started|completed 命中 0 行

backend/src/modules/ai-app/agent-playground/services/mission/workflow/stages/
全 14 个 stage 文件中 5 个从未 emit stage:started/completed：

- s1-mission-estimate-budget.stage.ts
- s4-leader-assess-research.stage.ts ← 截图 #11 红框
- s9-reviewer-critic-l4.stage.ts
- s10-leader-foreword-and-signoff.stage.ts
- s11-mission-persist.stage.ts

前端 todo-ledger.ts 在 mission:started 一次性预占 12 张 system stage 卡，
靠 stage:started/completed 翻牌 → 这 5 张永远停"待启动"。

修复 commit: `84443be69`（backend 5 文件补 emit + frontend todo-ledger 4 处
stage:started + 5 处 stage:completed handler）。

### 真因 2：同症状不同层 — 易与 chapter status fall-through 混淆

memory `chapter-status-state-machine-traps`（2026-05-01 commit 1dc467736 / d490e6cde）
描述的是 **章节级 UI mapper fall-through**（chapter status 'done' 在 4 处 mapper 漏分支）。
本 bug 是 **stage 级 backend 漏 emit**。

- 同症状："卡待启动"
- 不同层：UI mapper vs backend emit
- 排查时：grep stage:started/completed 全 stage 文件 → 0 命中即立刻定位

### 真因 3：mission 9ccedf16 死于 budget+liveness 双闸（regression）

commit f8727a5ee + 5cca1af41 修复：

- liveness staleThresholdMs 5min → 15min（4940b78d 跑通是 52min，5min 阈值过严）
- rerun maxCreditsFallback 不再硬编码 300（unlimited 应走 BUDGET_PROFILE_CREDITS）

regression 来源：5/5 commit dd5e91278 unified MissionLivenessGuard 把 4 个旧 detector
归一，引入 5min 阈值（旧 detector 没这么严）。

### 元问题（用户质疑）：workflow 控制权应在 harness 不在 agent

**用户原话："为什么驱动整个workflow的都是Agent自身，你觉得这个是合理的架构吗？"**

不合理。当前现状：

- stage 文件手工 emit stage:started/completed（漏发是物理可能）
- stage 文件手工 tickCost / refreshHeartbeat
- stage 文件手工 try/catch + retry / abort 决策

正确架构（W21-W23 范围，task #14 P0-I + #15 P0-J）：

- runWithStageInstrumentation wrapper 自动 emit lifecycle 事件
- orchestrator middleware 处理 cost / heartbeat / retry policy
- agent 只是 pure function（input → output）

POC 已落（commit 67d38d25a wrapper + s2 stage），后续 14 stage 全推 + agent
内部去掉手工 emit。

### How to apply

下次类似"任务卡卡待启动 / 状态推进异常"问题：

1. **先 grep stage:started|stage:completed 全 stage 文件**，命中 0 = backend 漏 emit
2. 再看前端 stage handler list，命中 0 = frontend 漏识别 stage 名
3. 同症状的"chapter UI mapper fall-through"不同层，两个排查点都要看
4. 最后看 livenessGuard 阈值是否对 mission 时长合理（实测对照 happy mission）
