---
name: project_container_validation_worktree_recipe
description: 容器本地验证 worktree 的 Prisma client 隔离配方 + monorepo node_modules hoisting 坑
metadata:
  node_type: memory
  type: project
  originSessionId: 26d8b890-fe23-4119-b8e7-bd49da7063a7
---

在 worktree 里跑容器/host tsc 验证时的两个非显性坑(2026-05-30 验证战役实测):

1. **monorepo 把依赖 hoist 到「根」node_modules**:`backend/node_modules` 只有 ~3 个真条目,`.prisma/client` + `@prisma/client` + typescript 全在**仓库根** `node_modules`(~1545 条目)。worktree 默认把根 node_modules 也 junction 到主仓 → host tsc 解析到的是**主仓的** Prisma client。

2. **跨 session 不能共享重生成 Prisma client**:并行 session 各在不同 schema 分支(如 ops-dashboard 有 `UserEvent`、本分支有 `AuditLog`/`CostLedger`),互不为子集 → 在主仓 `prisma generate` 必污染另一 session 的 client(CLAUDE.md 红线)。

**正向配方(只动自己 worktree,零污染)**:

- `rmdir` worktree 的**根** node_modules junction → `robocopy 主仓根 node_modules → worktree /E /XJ /MT:24`(`/XJ` 跳 junction 避免 workspace 自链接死循环)
- 然后 worktree 内 `npx prisma generate`(写进自己的隔离 client,带本分支 model)
- host `npm run type-check` 此时才真实反映本分支
- Docker build 内部本就是隔离 generate,是**权威编译证据**;host tsc 失败若仅是 stale client 伪报,别 `--no-verify` 绕,按本配方隔离

容器验证还可用:JWT strategy `validate()` **不查 DB**(只查 Redis 黑名单),故用 `JWT_SECRET` 自签 `{sub,email,username}` HS256 token 即可认证,`sub` 只需匹配播种行的 `ownerId` → 能跑 IDOR/审计端到端运行时验证。相关:[[project_metrics_dual_track_fix]]
