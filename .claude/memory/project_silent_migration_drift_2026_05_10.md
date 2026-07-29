---
name: project_silent_migration_drift_2026_05_10
description: 2026-05-10 prod 静默迁移漂移：20260506c + 20260510a 在 _prisma_migrations done=true 但 SQL 实际未执行；deploy-migrations.ts 第 2 步自动 resolve 把失败迁移标 applied 又一次背锅
type: project
originSessionId: f5363579-4033-4067-b001-3f053994c882
---

# 静默迁移漂移再次发生（与 prisma_concurrently_pitfall 同源不同因）

## 现象（2026-05-10 13:00 Railway prod）

```
GET /api/v1/agent-playground/replay/743255fc-... 500
The column `agent_playground_missions.report_full_uri` does not exist in the current database.
```

但 `_prisma_migrations` 表里 `20260510a_playground_r2_offload`、`20260506c_mission_report_versions` 都 `done=true`。

实际 prod DB：

- `agent_playground_missions` 缺 5 对 offload 列（report_full_uri/size + 4 同类）
- `mission_report_versions` 表完全不存在

## 真因

1. **migration 文件本身有 bug**：`20260506c_mission_report_versions` 写成 `mission_id UUID` 引用 `agent_playground_missions.id`（实际 TEXT）→ FK 加约束阶段必然 type mismatch 报错
2. **deploy-migrations.ts 第 2 步**（`backend/prisma/deploy-migrations.ts:198-227`）扫 `_prisma_migrations` 中 `finished_at IS NULL AND rolled_back_at IS NULL` 的失败迁移，**自动 `prisma migrate resolve --applied`**
3. 结果：失败的 SQL 不再重跑，但 `_prisma_migrations` 显示已 applied → 静默漂移
4. 后续 `20260510a_playground_r2_offload` 同样依赖该缺失表（ALTER `mission_report_versions`）→ 也失败 → 也被自动 resolve → 双重静默

## Why（教训）

- "auto-resolve failed as applied" 是为了不让历史 `DO $$/EXCEPTION ALTER TYPE` 阻塞部署，但把**普通 schema bug**（FK 类型不匹配 / 表不存在 / 列不存在）也吞了
- \_prisma_migrations.done=true ≠ SQL 真的跑过；唯一可信的检查是直接查 information_schema

## How to apply

- 看到 prod "column does not exist" 先别急着写新 migration，先用 raw SQL 查 `_prisma_migrations` + `information_schema.columns/tables` 双对照，找出"标已 applied 但 SQL 没跑"的迁移
- 修复路径：用 raw `$executeRawUnsafe` 直接补 SQL（IF NOT EXISTS 幂等），**不要碰** `_prisma_migrations` 的状态
- 迁移文件 FK 必须**与目标列实际类型一致**：Prisma `String` 字段在 PG 是 TEXT，不是 UUID（除非显式 `@db.Uuid`）；写 migration 前先 `\d table` 或 information_schema 查目标列实际类型
- deploy-migrations.ts 第 2 步是已知雷区，参考 [reference_prisma_concurrently_pitfall.md](reference_prisma_concurrently_pitfall.md) — 这次不是 CONCURRENTLY 而是 FK 类型不匹配，但同样后果

## 修复 commit / 操作

- 直接 Railway CLI 拿 DATABASE_PUBLIC_URL → node + Prisma `$executeRawUnsafe` 应用：
  1. CREATE TABLE mission_report_versions（id/mission_id 改 TEXT 匹配 Prisma String）
  2. ALTER agent_playground_missions ADD COLUMN IF NOT EXISTS（10 列 offload）
  3. ALTER mission_report_versions ADD COLUMN report_full_uri/size
- 没改 \_prisma_migrations 状态（保持 done=true）
- migration 源文件未改（fresh DB 走 db push 不依赖该 SQL；存量库已修）
