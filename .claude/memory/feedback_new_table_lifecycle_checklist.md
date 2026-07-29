---
name: 新增持久化表必须配套生命周期与级联清理
description: 新 schema 模型落地时必须同步检查 4 件套：caller 接 clear 钩子 / FK ON DELETE CASCADE / TTL 或 cron 清理 / 表无限增长监控
type: feedback
originSessionId: bd5e6ed5-b4a4-484f-b8d5-b68b1b25e668
---

新增 Prisma model 写 schema + migration 时，常常只完成"建表"，遗漏生命周期清理。结果表无限增长，session/mission 删除后残留孤儿行，存储 DoS 隐患。

**Why**：2026-05-11 round 2 评审中 security 独立发现：本批新增的 `mission_election_states` 和 `ask_room_session_runtime_states` 两张表都有 `clear()` / `clearSession()` 方法但**全仓零生产代码调用**；schema 也未声明 `onDelete: Cascade` FK。同一批改动两张表同犯，是系统性疏忽。

**How to apply（4 件套，每次新表必须逐项核验）**：

1. **caller 接生命周期钩子**：grep 确认 `tableName.clear` / `serviceName.clearXxx` 在生产代码（非 spec）至少有 1 个调用点，常见接入位置是 mission complete/cancel hook、session delete hook
2. **FK ON DELETE CASCADE**：若新表的主键来自父实体（sessionId / missionId / userId），schema 必须写 `@relation(..., onDelete: Cascade)` 让父删除自动级联；否则父删除留孤儿
3. **TTL 或 cron 兜底**：长期累积场景（监控指标、watermark 类）即使有 FK 级联也建议加 cron 周期清理（>7d 未更新等）
4. **首次部署后存储增长监控**：新表落地一周后查表行数增长曲线，发现异常立即补清理逻辑

**校验脚本**（提交前自查）：

```bash
# 查新加 model 有没有 clear caller
grep -rn "newTableService\.clear" backend/src --include="*.ts" | grep -v ".spec.ts"
# 查新 model 有没有 onDelete: Cascade
grep -A2 "model NewTableName" backend/prisma/schema/*.prisma | grep "onDelete"
```

**反模式**：实现 `clear()` 方法但不接 caller、只写主键不写 FK relation、注释里说"未来加清理"但不开 follow-up 任务。
