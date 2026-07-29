---
name: 阻塞项 — dependabot + BYOK cron
description: 2026-04-30 #56 #76 因 CI 离线 / sandbox 权限阻塞，需用户手动处理，已写完整 triage
type: project
originSessionId: 1eeec69c-2d84-4aa2-bd93-d546b59ca998
---

#56 INFRA-DEPS + #76 P1-CTX-BYOK — 2026-04-30 阻塞项 triage

**Why blocked**:

- #56: GitHub Actions 付款失败 → 19 个 dependabot PR 全部 mergeStatus=UNKNOWN，
  本地无法跨 module 验证 major version 兼容性；用户已明示 #39 (CI 付款) 不处理
- #76: `backend/src/modules/ai-engine/credentials/key-resolver/byok-scheduler.service.ts`
  路径在 sandbox permission deny list, 无法读 / 改

**How to apply** (#56 dependabot 优先级):

**P0 高风险 major bumps（需手动迁移指南）**:

- #73 next 14.2.35 → 16.2.4 — Next 16 含 React 19 强依赖、route handler 签名变化
- #71 prisma 6.19 → 7.8 — Prisma 7 移除 `--shadow-database-url`，driver adapter API 变更
- #67 zustand 4 → 5 — set/get 签名变更，selector pattern 变化
- #76 tailwind-merge 2 → 3 / #66 tailwind-merge 2 → 3（重复，2 个 workspace）

**P1 中风险**:

- #82 nestjs group 17 updates — 跨 nestjs 模块大批量更新，运行时风险
- #75 @vitejs/plugin-react 5 → 6 — 测试 runner 配置变化
- #69 actions/upload-artifact 4 → 7 — CI workflow 配置变更
- #64 lucide-react 0.553 → 1.7 — 图标 API 大版本，可能 breaking
- #72 react group 4 updates — React 18 → 19?（需查具体变更）

**P2 低风险 (patch/minor)**:

- #65 @mantine/hooks 8.3.17 → 8.3.18 — patch（已被 lockfile caret 覆盖, PR 可 close）
- #63 @mantine/core 8.3.17 → 8.3.18 — patch（同上）
- #62 @tiptap/starter-kit 3.20.2 → 3.21.0 — patch
- #61 @tiptap/extension-placeholder 3.20.2 → 3.21.0 — patch
- #59 vitest 4.1.0 → 4.1.2 — patch
- #78 autoprefixer 10.4.23 → 10.4.27 — patch（已被 caret 覆盖）
- #77 @notionhq/client 5.8 → 5.20 — minor（feature additions）
- #74 testing group — 测试工具 minor

**P3 backend**:

- #71 prisma — 见 P0
- #60 typescript group — 谨慎升 TS 主版本
- #55 resend 4 → 6 — major
- #52 node-cron 3 → 4 — major

**推荐操作顺序** (CI 恢复后):

1. 先 merge P2 低风险 patch 一批；运行端到端验证
2. P1 中风险逐个 merge + smoke test
3. P0 major 按计划单独 PR 迁移测试

#76 BYOK cron 路径 sandbox-deny:

- 需用户手动加 permission allow 或者直接编辑该文件
- 修复要点：byok-scheduler 内任何调用 BYOK key resolver 的地方需用 withUserContext(userId) 包装
- 影响面：topic-insights cron 触发的 mission 全部因缺 RequestContext.userId 而 fail
