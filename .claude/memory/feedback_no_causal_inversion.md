---
name: feedback_no_causal_inversion
description: 警惕"emit 事件 → 被自己读回当 mission 活迹"的因果倒置；事件类型必须 lifecycle/business 分类
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# 因果倒置反模式：用户行为被自己 emit 的副作用拒绝

**规则**：任何"用户操作 emit 事件 / 改状态 → 同一调用链下游读取该状态决策"的代码，
必须确认下游读到的是"真正的活迹"而非"用户行为自身的副作用"。

**典型攻击向量（实际事故）**：

```
用户点重跑
  → local-rerun emit "mission:rerun-started" 事件 → DB events 表
  → maybeReopen → markReopened emit "mission:reopened" 事件 → DB events 表
  → ctx-hydrator getLatestEventTs SELECT ts ORDER BY ts DESC LIMIT 1
  → 拿到刚 emit 的 lifecycle 事件 (1s ago)
  → 当 mission 活迹读
  → 误判 in-flight
  → 拒绝用户行为
```

**Why**：2026-05-07 mission `c195035f` 用户连点持久化重跑全失败事故。3 次重跑全死。
错误显示 "is in-flight (heartbeat 1s ago, event 1s ago)"，但 DB status=failed
（commit `b68ccea29` 治本 = RerunGuard + lifecycle/business 二分）。

**类似 race**：design v1 自审发现 markReopened 写 `heartbeatAt: new Date()` 也触发
同模式因果倒置 —— 第二次 ensureRerunable 看到刚 markReopened 的 heartbeat 1s ago →
zombieDetected → 把刚 reopen 覆盖回 failed。

**How to apply**：

1. **事件类型分类**：所有 mission_events.type 必须二分：
   - **BUSINESS**：dimension:_ / chapter:_ / stage:_ / tool:_ / agent:narrative
     —— mission 真在干活的活迹，可作活性信号
   - **LIFECYCLE**：rerun-started / reopened / rerun-failed / failed / completed /
     cancelled / zombie-cleanup —— 用户行为 / 状态机转换 / cleanup，**不算活迹**
   - 用 `startsWith` 全限定前缀匹配（不能用 includes，防子串攻击）
   - UNKNOWN = fail-open 当 BUSINESS（宁可误算活迹放行用户）

2. **PR review 触发**：看到下面任何一条都要"嗅"因果倒置：
   - 同一调用链 emit 事件 + 后续 SELECT events 表
   - 写 timestamp 字段 + 后续读该 timestamp 决策
   - 用户行为 → 改状态 → 后续步骤读该状态判定
   - 无类型过滤的 `ORDER BY ts DESC LIMIT 1`

3. **修法选项**：
   - **类型分类**（首选）：SELECT 加 `WHERE type LIKE 'business-prefix:%'` 过滤
   - **行为者标记**：emit 时带 `triggeredBy` 字段，下游过滤"非自己"事件
   - **时间窗排除**：下游读时排除 `< 100ms` 内的事件（脆弱，不推荐）

4. **Spec 必有反向证据**（按 feedback_destructive_op_must_have_rollback +
   feedback_fallback_must_be_self_consistent 同一原则）：
   - "emit X → 立即调判定函数 → 不被 X 影响" 的反向 spec
   - "如果绕过会怎样" 的攻击场景 spec（registry 注册同名 entry 模拟"如果分类漏了
     这条事件，会被当 BUSINESS 误算活迹"）

5. **元教训**：双层网 / 多入口校验 / 状态读写跨步骤的链路，每一步都要问：
   "下一步读到的会不会就是我刚写的副作用？"
   工具：grep `emit\(.*${eventType}` 然后 grep `getLatest` / `findFirst.*ts.*DESC`
   两组的交集就是因果倒置高危区。

**反例**（c195035f 真实场景）：

```typescript
// LocalRerunService.run
async run() {
  await emit({ type: "mission:rerun-started" });        // ← 写
  await this.maybeReopen(missionId);                     // ← maybeReopen 内 emit "reopened"
  const ctx = await this.hydrator.hydrate(missionId);    // ← hydrator 内读 events 表 → 拿到刚 emit 的
}
```

**正例**：

```typescript
// RerunGuardService.checkInFlight
async checkInFlight(missionId, userId) {
  const latestBusinessTs = await this.getLatestBusinessEventTs(missionId);
  // SELECT 用 BUSINESS 前缀 LIKE 过滤，lifecycle 事件根本不进结果
}
```

**关联**：

- `project_rerun_overhaul_2026_05_07`（治本）
- `project_c195035f_data_wipe_2026_05_07`（前置事故 — 类似"用户行为副作用伤自己"模式）
- `feedback_destructive_op_must_have_rollback`（反向证据 spec 必备）
- `feedback_fallback_must_be_self_consistent`（多入口对称防御）
