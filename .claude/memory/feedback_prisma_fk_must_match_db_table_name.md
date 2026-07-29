---
name: feedback-prisma-fk-must-match-db-table-name
description: '手写 Prisma migration SQL 的 inline FK `REFERENCES "X"("id")` 必须用 DB 真实表名（Prisma @@map 之后的小写复数），不能写 Prisma model 名（PascalCase 单数）；写错 prod 必崩 + auto-resolve 吞错'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

手写 Prisma migration SQL 时，inline FOREIGN KEY 引用必须用 **DB 真实表
名**，不是 Prisma model 名。

**Why:** 2026-05-17 ai-social `social_missions` 表 prod 缺失事故根因 —
原 `20260522_social_mission/migration.sql` 写 `REFERENCES "User"("id")`，
但 Prisma model `User @@map("users")`，真实表名是 `users`（小写复数）。
Migration 在 prod 执行报 `relation "User" does not exist`，留在
`_prisma_migrations.finished_at IS NULL`，下一次 deploy 的 auto-resolve
路径把它当 "failed migration" 自动标 applied（不执行 SQL）→ 表永远不存在 →
用户 /ai-social 深度发布报 `mission not found`。Prisma 自动生成的
migration 是正确的，**只有手写时容易写错**（直觉用 model 名而忘记 @@map）。

**How to apply:**

- 手写 migration SQL 前必须 grep `@@map(` 在 schema 里查目标 model 的
  真实表名，不能凭记忆写 PascalCase
- 常见易错：`User` → `users` / `RadarTopic` → `radar_topics` / `KnowledgeBase`
  → `knowledge_bases`（Prisma 自动 snake_case 复数）
- migration 文件 review 时把所有 `REFERENCES "X"` 跟 schema `@@map`
  对一遍
- 配套：deploy-migrations.ts Step 2 的 "auto-resolve failed migrations
  as applied" 是反模式（只标记不执行 → 永远静默吞错），后续整改方向是
  failed migration 必须 fail-loud 让 deploy 报错而不是 self-heal
- 验证 prod 真应用了 migration：连 DB 跑
  `SELECT to_regclass('public.<table_name>') IS NOT NULL` 而不是只看
  `_prisma_migrations.finished_at`

相关：[[feedback-screenshot-first-then-diagnose]] [[feedback-test-connection-must-verify-runtime]]
