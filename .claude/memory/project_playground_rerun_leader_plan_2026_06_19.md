---
name: project_playground_rerun_leader_plan_2026_06_19
description: playground「洞察失败」+ no-active-session 刷屏根因与三层修复（PR
metadata:
  node_type: memory
  type: project
  originSessionId: 7ac15c41-8621-4b53-ba70-ac5152de9652
---

playground「洞察失败」+ Railway 日志大量 `must call plan() before writeForeword()` / `no active session for mission` 刷屏。生产实证 mission `581157ed`（gpt-5.4 reasoning，48min / 197 万 token / $5.93，`leaderVerdict=failed leaderSigned=false finalScore=47`）。**PR #382**，分支 `fix/playground-rerun-leader-plan-hydrate`。

**触发器 = 模型**（用户："之前 DeepSeek 没问题、换 OpenAI 才出"）。诊断链（非代码本身能体现，需记）：gpt-5.4 慢/重 → 中途 stage 超 liveness 停滞阈值 → `MissionLivenessGuard` 自动恢复 `rerunFullMission`（同-id，fire-and-forget）→ 与原 run 重叠 → 引爆下面 2 个潜伏 bug。DeepSeek 快、不触发停滞阈值，故从不进入此链。

**三层根因 + 修复**：

1. 主 pipeline `runMission`（playground.pipeline.ts）crash-resume / `inheritFromMissionId` 路径只还原 `crossState.lastPlan`，每次 `leaderService.create()` 新建 leader 却**从不 `hydratePlan()`** → s10 `writeForeword`/`signOff` 撞 guard 抛错 → 强制拒签 = 用户侧「洞察失败」。同款修复早加进 `RerunMissionRuntimeBuilder.buildSession`（stage-rerun 路径），**漏接主 pipeline resume/inherit**。修：orchestrator 跑前用 lastPlan 回灌（仅 dimensions 在场即灌，fresh run 不触发）。
2. `runMission` 对同 `missionId` **无并发护栏**；`this.sessions` 按 missionId 单键 → 重叠 run 互删 session（一个的 `finally{sessions.delete}` 删另一个在用的）→ no-active-session 刷屏。修：入口 `if (sessions.has) return aborted`（单进程内准确，pod 重启 Map 自清不会误锁）。
3. BYOK `inferCapabilities`（user-models-auto-configure.service.ts）`isReasoning` 错用"广义能推理" `isReasoningCapable`（gpt-4o 也命中）。运行时 `toAIModelConfig` 用 `model.isReasoning || inferIsReasoning(modelId)`（**OR**，model-fallback.service.ts:777）→ DB 一旦 true 永远纠不回 → gpt-4o 被发 `reasoning_effort` → OpenAI 400。修：改用同源 `inferIsReasoning(modelId)`；`tokenParamName`/`supportsTemperature` 仍按 `usesReasoningTokenProtocol`(o1-5/gpt-5)。

**坑**：①railway logs 只抓实时 tail，失败窗口真实 LLM 错误抓不到 → 改查 DB（`railway ssh` 容器内跑 prisma，base64 编脚本避引号；本地 DATABASE_URL 是 `postgres.railway.internal` 内网连不上，`DATABASE_PUBLIC_URL=remove_me` 占位）。②新增 `inferIsReasoning` 调用方会撞架构契约 spec `infer-is-reasoning-callers.contract.spec.ts`（白名单基线），须同步登记。③改 runMission 后 mock leader 须补 `hydratePlan`（crash-resume.spec + dispatcher.spec）。

关联 [[project_p1_react_runaway_fix_2026_04_29]]。
