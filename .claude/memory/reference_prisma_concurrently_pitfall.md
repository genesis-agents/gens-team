---
name: prisma-create-index-concurrently-deploy-pitfall
description: 含 CREATE INDEX CONCURRENTLY 的 migration.sql 一旦放进 prisma migrate deploy 必然失败 + deploy-migrations.ts 静默 resolve 为 applied → 列不存在 + _prisma_migrations 显示已 applied 的诡异状态
type: reference
originSessionId: 7d028ab3-e546-4f0f-9b44-f6ee8ffbc81d
---

**症状**：生产 P2022 "The column X does not exist"，但 `_prisma_migrations` 表里 X 所在的迁移 `finished_at` 已设值显示 applied。

**根因**：

- `CREATE INDEX CONCURRENTLY` 必须在 transaction **外**执行
- `prisma migrate deploy` 默认每条迁移文件 wrap 在单 transaction → 一行 CONCURRENTLY 让整个 migration **回滚**
- 项目 `deploy-migrations.ts` 在 deploy 失败时**自动调用** `prisma migrate resolve --applied`，把失败的迁移当成功标记进 `_prisma_migrations`
- 结果：列没建、表没建、但下次 deploy 不会重试

**怎么修**（手工，不破坏 \_prisma_migrations 已 applied 标记）：

1. 把 SQL 拆成两段，主体一段 + CONCURRENTLY 一段
2. 主体用 `prisma db execute --schema prisma/schema --file path/to/_main.sql`（默认 wrap transaction，正常跑）
3. CONCURRENTLY 那一句单独用 node + `prisma.$executeRawUnsafe(...)` 跑（不 wrap transaction）
4. 跑完临时 \_main.sql 立即删掉（违反"一个文件夹只有 migration.sql"约定）

**怎么预防**（PR review 看护）：

- `migration.sql` 里出现 `CREATE INDEX CONCURRENTLY` 必须配套：
  - 文件首部明确注释 "本句必须放最末 + 不能被 DO block 包裹"
  - 同时要给一个不带 CONCURRENTLY 的 fallback 方案（生产偶尔跑普通 CREATE INDEX 也可接受）
- 或者直接放弃 CONCURRENTLY（小表无所谓 / 大表换 manual 维护）

**踩坑现场**：2026-05-08 ai-ask teams W1 PR `20260508d_add_ask_room_tables` 因 GIN CONCURRENTLY 触发；deploy-migrations 标记 applied 但 `ask_sessions.mode` / `ask_sessions.room_config` / `ask_room_members` 表全没建。手工 prisma db execute 主体 + node $executeRawUnsafe 跑 GIN 修复。
