---
name: project-playground-budget-root-cause-2026-05-22
description: "agent-playground mission 006fc6bc 失败三层根因（rerun 读错字段→预算1000/$2→budget_exhausted→abort 误判成用户取消）+ 单一源档位重设计"
metadata:
  node_type: memory
  type: project
---

## agent-playground mission 失败三层根因（2026-05-22 Railway prod 实证）

用户报"playground 过程失败"（Screenshot_13 Mission 异常）。Railway 日志 + 生产库
（DATABASE_PUBLIC_URL @ tramway.proxy.rlwy.net）实证，mission `006fc6bc`：
budget:exhausted 事件 `{tokensUsed:735547, costUsd:$2.206, costRemaining:0}` →
池子 cap = 100 万 token / **$2.0**（=1000 credits）。但 DB 列 maxCredits=100000、
mission:started input maxCredits=**1000** → 两套值。

### 三层根因（均已修，2026-05-22）

1. **rerun 读错字段（"Mission 设置不生效"真因）**：`mission-rerun-orchestrator.ts`
   `cloneInputFromMission` 从 `userProfile.maxCredits` 读预算，但 maxCredits 存在
   **权威列** `original.maxCredits`（createMissionRow + updateBudgetByUser 都写列）→
   永远 undefined → 兜底硬编码 1000 → $2。**写路径(列) ≠ 读路径(userProfile)**。
   Fix：cloneInput 改读 `original.maxCredits`；createMissionRow 把有效 multiplier/
   wallTime 也写进 userProfile（无独立列）。

2. **$2 成本上限秒爆**：1000 credits → maxCostUsd = credits×0.002 = $2。11 维度深度
   调研 11 分钟烧 $2.2（grok-4-1-fast-reasoning ~$3/1M，记账正常）→ s3 阶段
   `pool.isExhausted()` → `abortRegistry.abort(missionId, "budget_exhausted")`。

3. **abort 误判成用户取消**（最致命，影响所有 budget/超时失败）：
   `playground-pipeline-dispatcher.ts` handleMissionFailure 的 wasCancelled 只看
   `signal.aborted`（任何 abort 都 true），不读 `signal.reason` → budget_exhausted
   被当成用户取消 → skip mission:failed + 不 markFailed → DB 卡 running → 15 分钟后
   liveness guard 用"pod 重启/失联"误导文案兜底。是 [[project_grade_cascade_real_root_cause_2026_05_13]]
   同类 bug 在 dispatcher 层的残留 + [[feedback_no_lying_assertion]] 撒谎错误。
   Fix：读 signal.reason，只有 "user_cancelled" skip；budget_exhausted →
   failureCode=BUDGET_EXHAUSTED + 友好中文文案 + markFailed。

### 单一数据源档位重设计（用户批准）

新增后端唯一档位表 `DEPTH_BUDGET_TIERS`（run-mission.dto.ts，depth=调研规模）：
quick=3000c/$6cap/20min、standard=8000c/$16cap/60min、deep=20000c/$40cap/180min
（cap≈典型花费 2-3×，杜绝秒爆）。maxCredits/budgetMultiplierOverride 改可选覆盖，
缺省按 depth 解析。前端 SCALE_TIERS 镜像（仅展示）。删 resolveMissionWallTimeMs 三维矩阵。
前端：PlaygroundMissionDialog 深度卡片改"调研规模"（显示成本/时间/维度），删 budgetProfile
独立选择器，原 3 旋钮收进 opt-in「自定义预算」（默认关→只传 depth=单一源）；
team/[missionId]/page.tsx Mission 设置弹窗加档位一键套用 + 上次失败原因提示。

验证：后端 type-clean + 226 测试绿；前端 type-clean + audit:ui-discipline 0 违规。

### Railway 调试可复用

- 内网 DATABASE_URL 本地连不上（postgres.railway.internal）；用 Postgres 服务的
  `railway variables --service Postgres --json` 取 DATABASE_PUBLIC_URL（tramway.proxy.rlwy.net）。
- 日志：`railway logs --json`（流式，本地后台跑+超时截断；过滤 ERROR/abort/budget）。
