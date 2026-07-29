---
name: feedback-deploy-auto-resolve-silent-failure
description: 'deploy-migrations.ts Step 2 把 `finished_at IS NULL` 的 migration 当 "failed" 自动 resolve-as-applied 是反模式 — 只标记不执行让 SQL 永远不跑，prod 静默崩溃'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

`backend/prisma/deploy-migrations.ts` Step 2 的 self-heal 路径有结构性问
题，必须警惕：

```typescript
const failedMigrations = ... WHERE finished_at IS NULL AND rolled_back_at IS NULL
// → prisma migrate resolve --schema=... --applied "<name>"
```

它把任何 `finished_at IS NULL` 的 migration 当 "失败被卡住" 自动标
applied —— 但 `prisma migrate resolve --applied` **只更新 \_prisma_migrations
表，不执行 SQL**。一旦真有 migration 因为 SQL 错误失败（如 FK 引用错表
名），下一次 deploy 直接把它埋掉，表永远不会被创建。

**Why:** 2026-05-17 ai-social `social_missions` 表 prod 缺失事故：原
migration FK 写错表名（`"User"` vs `"users"`），prod deploy 一次报错
→ next deploy 自动 resolve-as-applied → 表永远不存在 → 用户深度发布
报 `mission not found`。事故被埋了 1 天才被用户截图发现。

**How to apply:**

- 任何长时间没跑的 social/research/radar 等模块用户报 `table does not
exist` 或 `relation does not exist`，**第一时间查 `_prisma_migrations`
  表 vs `to_regclass` 实际存在性**，别信 `finished_at IS NOT NULL`
- prod hotfix 一律走"写新 migration（IF NOT EXISTS + DO 块判
  pg_constraint）+ 直接 railway public proxy 跑 SQL + INSERT
  \_prisma_migrations 记录"三件套
- 后续整改 deploy-migrations.ts：failed migration 应该 fail-loud（exit 1）
  让 Railway deploy 失败、人工介入，而不是 self-heal 吞错
- 不能依赖 Step 5 critical tables 校验拦截 —— 新模块的表都不在 CRITICAL_TABLES
  列表里，必须扩展或换策略

相关：[[feedback-prisma-fk-must-match-db-table-name]] [[feedback-railway-cli-needs-tty]]
