---
name: project_rerun_overhaul_2026_05_07
description: 2026-05-07 agent-playground 重跑链路统一重构 — RerunGuard 单点 + 9-cell 矩阵 + 因果倒置修
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# Rerun Overhaul（2026-05-07）

## 触发事件

mission `c195035f-d6fd-4dae-a9a0-d5176048e4e6` 用户连点"持久化重跑"3 次全失败：
错误 `is in-flight (heartbeat 1s ago, event 1s ago) — cannot rerun while live`，但 DB
status=`failed`、heartbeat 4 分钟前（zombie pod）。

## 真因（因果倒置）

```
local-rerun emit "mission:rerun-started" → DB events
maybeReopen → markReopened (failed→running) emit "mission:reopened" → DB events
hydrator.hydrate → ctx-hydrator getLatestEventTs 拿到刚 emit 的 lifecycle 事件 1s ago
→ 当 mission 活迹读 → 误判 in-flight → 拒
```

**用户行为 → 自己 emit 的副作用事件 → 被自己后续步骤当 mission 活迹 → 拒绝用户**。

## 现状混乱（重构前）

- **3 个 rerun endpoint** 散在 controller（local-rerun / orchestrator.full / orchestrator.todo）
- **8 处独立判定**：5 个 in-flight 类（local-rerun:206 / ctx-hydrator:111 /
  orchestrator:64 / mission-store.markReopened / lockRegistry）+ 3 个其他（频次/cost/scope），
  阈值 / 文案 / 信号都不一致
- **事件类型不分类**：`SELECT ... ORDER BY ts DESC LIMIT 1` 拿 lifecycle 事件当 mission 活迹
- **zombie heartbeat 没主动清**：mission lifecycle final 时 setInterval 不停，pod
  共用导致 heartbeat 持续刷
- **markReopened 写 `heartbeatAt: new Date()`** —— design v1 自身漏洞（连点 race）

## 治本（commit `b68ccea29`）

### 1. 新建 RerunGuardService（唯一 in-flight 判定单元）

`backend/src/modules/ai-app/agent-playground/services/mission/rerun/rerun-guard.service.ts`

**checkInFlight 9-cell 决策矩阵**（heartbeat 三态 × event 三态 × status 短路）：

|                 | event fresh (<5min) | event stale (≥5min) | event null (0 业务事件) |
| --------------- | ------------------- | ------------------- | ----------------------- |
| hb fresh (<60s) | inFlight=true       | zombieDetected=true | zombieDetected=true     |
| hb stale (≥60s) | inFlight=false      | inFlight=false      | inFlight=false          |
| hb null         | inFlight=false      | inFlight=false      | inFlight=false          |

**关键不变量**：`heartbeat null` 永不 inFlight=true。

### 2. 事件分类（lifecycle vs business）

`backend/src/modules/ai-app/agent-playground/services/mission/lifecycle/event-categories.ts`

- BUSINESS 用全限定前缀 `startsWith` 匹配（agent-playground.dimension: / chapter: /
  stage: / tool: / agent:narrative）—— 不能用 includes（防 RV-9 子串攻击）
- LIFECYCLE 用精确字符串 Set（含 rerun-started / reopened / zombie-cleanup 等 12 类）
- UNKNOWN = fail-open 当 BUSINESS（宁可误算活迹放行用户，也不误判 zombie 杀活 mission）

### 3. 用户行为优先（active zombieCleanup）

ensureRerunable 检出 zombieDetected=true 时**主动**修复，不让用户等 LivenessGuard 5-15min：

```typescript
async zombieCleanup(missionId, userId) {
  const detail = await store.getById(missionId, userId);  // 跨用户 missionId → null skip
  if (!detail || detail.status !== "running") return;     // race 间已变 final → skip
  await store.markFailed(missionId, { errorMessage: "zombie-heartbeat-cleanup" }, userId);
  await store.clearHeartbeat(missionId, userId);
  await prisma.event.create({ type: "mission:zombie-cleanup", ... });
}
```

走 store 唯一写源（不裸 UPDATE，feedback_no_dual_sources）。

### 4. markReopened 不再写 heartbeat_at（design v1 自身 race 漏洞修）

R1 architect 发现：design v1 的 RerunGuard + zombieCleanup 还有未覆盖 race：
cascade 失败但还没回写 status=failed 的窗口期，第二次 ensureRerunable 看到
status=running + heartbeat 1s ago（markReopened 写的）+ 0 BUSINESS 事件 →
zombieDetected → cleanup 把刚 reopen 覆盖回 failed = **新一轮因果倒置**。

修法：删 `mission-store.service.ts:1087` 的 `heartbeatAt: new Date()` 字段。
heartbeat 由 mission shell setInterval 接管时刷，不归 markReopened 管。

### 5. 三 endpoint 委托 RerunGuard

URL 不变（前端不动），底层归一：

- `LocalRerunService.run` line 191 调 ensureRerunable（删 line 206 旧 heartbeat<60s 检查）
- `MissionRerunOrchestratorService.assertSourceMissionRerunnable` line 76 调 ensureRerunable
  （rerunFullMission + rerunFromTodo 共用此私有方法）

### 6. ctx-hydrator 删 in-flight 检查 + 死代码清理

- 删 EVENT_INFLIGHT_THRESHOLD_MS / HEARTBEAT_INFLIGHT_THRESHOLD_MS 常量
- 删 getLatestEventTs 方法（迁到 RerunGuard 内 getLatestBusinessEventTs 用 SQL LIKE 过滤）
- 删 line 96-128 in-flight check block

## 评审过程

### Design v1 → v1.1（4 路 R1 + R2 共识）

| 路        | R1                    | R2                     |
| --------- | --------------------- | ---------------------- |
| architect | CHANGES-REQUIRED 3 P0 | APPROVED 9.0/10        |
| security  | CHANGES-REQUIRED 1 P0 | APPROVED low (R3 闭环) |
| reviewer  | CHANGES-REQUIRED 2 P0 | APPROVED 9/10          |
| tester    | CHANGES-REQUIRED 3 P0 | APPROVED 9.2/10        |

R1 9 个独立 P0：

1. 事件分类 fail-open vs fail-closed（architect P0-1）
2. clearHeartbeat × LivenessGuard sequence（architect P0-2）
3. **markReopened race 自身因果倒置（architect P0-3）—— design v1 自审最大亮点**
4. zombieCleanup userId 必传 + 三元 WHERE（security P0）
5. 不裸 UPDATE 走 store（reviewer P0-2）
6. heartbeat 三态显式 spec（tester P0-T1）
7. PR 顺序硬门控（tester P0-T2）
8. 0 BUSINESS 事件 SQL spec（tester P0-T3）
9. canRerun 冗余字段删除（reviewer P1-1，与 inFlight 重叠）

### Implementation R1（4/4 全 YES）

- architect 9.0/10 / security low / reviewer 9.0/10 / tester 8.5/10
- reviewer 1 should-fix（stale 注释 markReopened JSDoc 提"全清"）已修

## 反向证据 spec（9 条 RV anchor）

- RV-1：emit rerun-started 后 checkInFlight=false（lifecycle 事件不算业务活迹）
- RV-2：heartbeat=1s + business event=6min → zombieDetected=true
- RV-3：clearHeartbeat 抛错不影响 markCompleted 主流程（PR-2 spec scope）
- RV-4：zombieCleanup 后业务字段保留（store.markFailed payload 只含 errorMessage）
- RV-5：lifecycle 事件不被 isBusinessEventType 误判（12 LIFECYCLE 类型）
- RV-6：checkInFlight 纯读 100 次 → 0 写调用
- RV-7：连点重跑安全（emit reopened 后 100ms 内 checkInFlight 不 inFlight）
- RV-8：mission status=failed + heartbeat=NULL → LivenessGuard 跳过（PR-2 spec scope）
- RV-9：startsWith 不被 includes 子串攻击（mission:lifecycle-note-dimension:fake → UNKNOWN）

## 关联 commit

- `b68ccea29` — rerun 链路单点判定 + 因果倒置真因修（主体 PR-1+2+3+4 一次性）
- `530a680f6` — 注册 mission:zombie-cleanup 事件 schema
- `a279df224` — EVENT_BASELINE 加 mission:zombie-cleanup（contract spec 字节级 baseline）
- `d5ea3f157` — 前置：双信号 partial 修（被本次 overhaul 取代）
- `608ed7f8e` — 前置：reset-before-cascade 删（c195035f 数据废墟修）

## 验证

- type-check 干净
- rerun 相关 226 specs + controller 75 specs + 新 28 specs = 301/301 全绿
- contract spec：playground-event-contract + playground-frontend-contract 12/12 pass
- pre-push hook 全过

## 待办（PR-5 + 后续）

未在本批落地（design §4 列为 PR-5 / follow-up，4/4 共识不阻塞）：

- RV-3 / RV-7 / RV-8 全链路 e2e spec（PR-5 + PR-2 spec scope）
- mission lifecycle final 时 clearInterval + clearHeartbeat 显式调（PR-2）
- frontend 端 zombie cleanup toast 提示（UX 增强）
- mission_events.type 索引（若大 mission ≥ 5000 行可考虑）

## 元教训

1. **因果倒置真因模式**：emit 事件 → 被自己当活迹 → 拒绝自己 —— 任何"读取自己刚写的状态"
   的链路都要警惕。修法：事件类型分类（BUSINESS vs LIFECYCLE）从语义层切开
2. **destructive op 必有反向证据**（feedback_destructive_op_must_have_rollback）
3. **唯一写源**（feedback_no_dual_sources）：zombieCleanup 走 store.markFailed 不裸 UPDATE
4. **fail-open vs fail-closed 设计取舍**：UNKNOWN 事件 fail-open，DB 异常 fail-closed
5. **design 自审找自身 race**：R1 architect P0-3 不是发现实施 bug，是发现 **design v1
   方案本身的隐藏 race**（markReopened 写 heartbeat_at 触发新一轮因果倒置）
6. **集体审视必须迭代到 4/4 YES**（feedback_consensus_must_iterate_to_all_yes）：
   design 走了 R1+R2，implementation 走了 R1，security 在 design R2 留下 medium 残留
   被 implementation 在调用链上游 zombieCleanup 的 store.getById re-check 一次性闭环
