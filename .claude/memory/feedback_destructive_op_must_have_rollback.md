---
name: feedback_destructive_op_must_have_rollback
description: 任何 update SET=NULL / delete / truncate / reset 操作必须配对 review "失败回滚机制在哪"
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# 破坏性操作必须有失败回滚 / 备份恢复机制

**规则**：任何 `update SET X=NULL` / `delete` / `truncate` / `reset` / `clear` / `wipe` 类破坏性 SQL 或数据操作，**必须**在 PR 评审时被问"失败时谁恢复？事务边界在哪？"。无答案 = P0 阻塞。

**Why**：2026-05-07 c195035f mission 数据废墟事件：cascade rerun 之前 reset 整链 dbWrites + resetFields 并集 SET NULL，cascade 跑失败时主行字段（dimensions / outline_plan / report_full / leader_signed 等）永久 NULL，无回滚。子表数据仍在但前端从主行读 → 任务列表为空。PR-R1 + PR-R5 4 路集体评审两轮都漏了。设计文档 v1.2 §3.3 写"已成 patch 保留，未跑下游不动"，实现完全反着。

**How to apply**：

1. PR review 时 grep `update.*\bSET .* null|update.*\bSET .* NULL|delete.*from|truncate|resetFields|clearAll|reset(All|Fields|Mission)|wipeAll`，每条都问"失败回滚"
2. dispatcher / orchestrator 内 try **外** 做的破坏性操作 = 危险信号（try 内失败无法回滚）
3. 如果是 batch reset（多个字段一次性清），必须有 backup snapshot + 失败时 restore，或事务保护
4. 设计文档 invariant 关键词（"已成 X 保留"/"best-effort partial"/"data preservation"）→ spec 必须有反向证据 case 验证 invariant 真生效
5. 评审 checklist 必查项 7 条：
   - update SET NULL → 备份在哪
   - delete → 软删 vs 硬删
   - truncate → 谁能恢复
   - reset → 失败回滚？
   - 事务边界覆盖整个破坏 + 重建？
   - spec 有"破坏后失败 → 数据保留"反向证据？
   - 是否在 try 外（无法捕获）

**反例**（c195035f 真实场景）：

```typescript
async runFromStageWithCascade(args) {
  // ... validation ...
  await this.resetFieldsForCascade(missionId, userId, cascadeChain);  // ← 破坏
  try {
    for (const stepId of cascadeChain) {
      await handler(ctx);  // ← 第一个就 throw → reset 已发生但无回滚
    }
  } catch { ... }  // ← catch 里没有 restore，数据永久丢失
}
```

**正例**：依赖每 stage 自己的 markIntermediateState 主动持久化（跑成功覆盖；跑失败保留旧值），不在 dispatcher 层做 reset-before-cascade。
