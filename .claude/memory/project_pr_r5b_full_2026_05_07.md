---
name: project_pr_r5b_full_2026_05_07
description: 2026-05-07 PR-R5b-FULL 把 12 placeholder stage handler 全装真，2 轮 4 路集体共识 4/4 APPROVED
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# PR-R5b-FULL — 12 placeholder handler 全装真 + 主列表恢复 S11 重跑按钮

**日期**：2026-05-07
**Commit**：`8a64cf26a` (推到 origin/main)
**触发**：用户截图反馈 S11/S12 主列表无重跑按钮 + "你告诉我是 placeholder？？？" 强烈不满

## 落地内容

1. **新建 `RerunMissionRuntimeBuilder`**（rerun-runtime-builder.service.ts ~250 行）
   - `startSession(ctx, workspaceId)`：构造 `BillingRuntimeEnvAdapter` + `MissionBudgetPool` + 通过 `leaderService.create` 拿 fresh `SupervisedMission` + 注册 `missionAbort`
   - `composeMissionContext(ctx, session)`：HydratedMissionContext 剥 `__hydrated` 后 spread + 注 5 runtime 字段（billing/pool/leader/budgetMultiplier/t0），**编译期严格校验，无 lying assertion**
   - `writeBackToHydrated(composed, hydrated)`：剥 5 runtime 字段后回写，让 cascade chain 下游 stage 看到产物
   - 与 `MissionRuntimeShellService` 关键差别：不调 store.create / 不调 validateModels / 不开 wallTimer / cleanup 仅 abortRegistry.unregister

2. **`stage-rerun.dispatcher.ts` 注册 11 个真 handler**（s2/s3/s4/s5/s6/s7/s8/s8b/s9/s10/s11）
   - 通用 `makeStageHandler(runStage)`：8 个 (ctx, deps) → void 签名 stage
   - 特化 `makeS6Handler`：runAnalystStage 返回 AnalystOutputShape，赋给 composed.analystOutput
   - 特化 `makeS8Handler`：runWriterStage(ctx, deps, analyst, workspaceId) 4 参数

3. **try/finally cleanup 防 abortRegistry 泄漏**（runFromStageWithCascade 框 session）

4. **frontend `MissionTodoBoard.tsx`**：删 S11 排除（保留 S12-self-evolution + s1-budget），加 `FRONTEND_STAGE_TO_STEP_ID` mapping，handleRerunTodo 走 stepId path

## 集体共识迭代过程（2 轮 4 路）

### R1（首轮 4 路并行评审，4 路全 NO）

| 路        | P0 数 | 关键阻塞                                                                                                         |
| --------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| Architect | 3     | (1) `as unknown as MissionContext` lying assertion / (2) buildLeaderInvocation 双源 / (3) leader memory 共享风险 |
| Security  | 1     | abortRegistry.register 静默覆盖（pod restart / cron 重入留 stale controller）                                    |
| Reviewer  | 2     | composeMissionContext 浅拷贝引用共享 / s8 workspaceId 永远 undefined                                             |
| Tester    | 2     | spec 命名 dishonesty（"使用真实 stage 函数"实际只测 handler 注册）/ 缺 cleanup-on-abort spec                     |

### R2（按 R1 反馈修完后并行二轮，4 路全 YES）

- Architect：✅ 接受 destructure pattern + leader fresh per cascade 注释 + 双源 DRY 留为 follow-up（非阻塞）
- Security：✅ 接受 stale-detect-then-abort 防御（getSignal + abort + unregister）
- Reviewer：✅ 接受浅拷贝 + 文档化"stage 用赋值替换不要 in-place mutate"
- Tester：✅ 接受 spec describe 改为"handler registration & cascade infra (PR-R5b-FULL)"诚实命名 + cleanup-on-abort spec 已加

## 元教训（沉淀重要）

1. **placeholder 是债，必须有人催还**：PR-R5 留 12 个 placeholder 当时是务实选择，但用户看到 throw 直接发飙（"这不是搞笑吗"）—— 业务用户不关心架构 PR 划分，只关心点按钮能跑。后续若再用 placeholder 模式，**必须前端同步禁用对应按钮**，不能让用户撞到 throw。
2. **集体共识必须迭代到 4/4 YES 才能 push**：本次首轮 4 路全 NO，3 路 P0；R2 全 YES。一致性原则（feedback_consensus_must_iterate_to_all_yes）：中途任何 NO 都立即修再走一轮。
3. **HydratedMissionContext ↔ MissionContext 类型差是 cascade 架构的核心约束**：5 runtime 字段（billing/pool/leader/budgetMultiplier/t0）只在 mission 跑期存在，hydrated 不含，composed 必加，writeBack 必剥。这层类型隔离防止 cascade chain 中误读 stale runtime 实例。
4. **lying assertion 是 P0 红线**（feedback_no_lying_assertion）：`as unknown as X` 编译器全失明，runtime 缺字段必炸。destructure spread 才是合法转化。
5. **abortRegistry register 静默覆盖**是潜在孤儿 runner 源：rerun 前必须 getSignal + abort 旧 + unregister 再 register，否则 stale controller 引用断 → orphan 跑到死。

## 残留 follow-up（非阻塞，已记录）

- ~~buildLeaderInvocation 双源~~ → 已抽 `services/mission/leader-invocation.factory.ts`（commit `108ad20d9`，2026-05-07）
- ~~FRONTEND_STAGE_TO_STEP_ID 双源~~ → 已抽 `frontend/lib/agent-playground/stage-id-mapping.ts`（同 commit）
- billing pool 不聚合前次 cost：多次 rerun = 多次扣费；需查 mission.cost_usd 增量计入 pool
- 真 stage 函数执行 e2e（jest.spyOn(runOutlineStage)）：当前 spec 只验注册，不验 stage 真跑

## 元教训补充（2026-05-07 用户拒绝双源后）

**用户拒绝双源原则**："我不会接受双源" —— 即使在 PR 收尾时把 dedup 标为 follow-up 也不行。

- 双源任何情况都不允许在交付时存在。已知双源 → 立刻抽公共 source，不留 follow-up。
- 更新 commit 必跟一份 spec mock 修复（dispatcher 加构造参数 → 老 spec mock 漏）：构造函数变更必扫所有 `new XxxService(` 直接实例化点。
- pre-push hook 第 3 步 "变更相关测试" 是最后防线 —— 这次正是它拦下了 dispatcher spec 漏 mock 的问题。
