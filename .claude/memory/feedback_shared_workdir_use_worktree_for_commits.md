---
name: feedback-shared-workdir-use-worktree-for-commits
description: 本仓任何要提交的改动都先开 origin/main 隔离 worktree，别直接改主工作目录
metadata:
  node_type: memory
  type: feedback
  originSessionId: 90759ea2-c102-4062-a833-4f22bcc58eb1
---

这个仓库的主工作目录（`D:\projects\codes\genesis-agent-teams`）**经常被其他并发 session 驱动**——它们会切分支（实测被切到 `refactor/ai-layer-mece-remediation`）、留未提交文件、跑全局 git 操作。在主目录里直接改文件然后没立刻提交，**会被别的 session 的 git 操作整个回退**（实测：我对 ai-ask.service.ts 的 4 处未提交改动被 `git status` 清零、文件回到 HEAD）。

**Why:** 2026-06-02 做 ai-ask userMsgInsert 并发化时，图省事直接在主目录改，被并发 session 的 checkout/restore 清掉未提交改动。CLAUDE.md 早警告过共享工作目录红线，这是它的真实manifestation。第一次（BYOK PR#215）用隔离 worktree 就没事。
**How to apply:** 任何**要提交**的改动，一律 `git worktree add -b <branch> <dir> origin/main` 在隔离 worktree 里做、验、提、推、PR，全程不碰主目录。worktree 无 node*modules/.husky/* → 从主仓 `New-Item -ItemType Junction` 进去 hooks 才能跑；删 worktree **前**先 `.Delete()` 掉 junction（reparse point only），否则 `git worktree remove` 沿 junction 递归删掉主仓 node_modules。改前先 `git rev-parse --abbrev-ref HEAD` 确认主目录在哪个分支，别假设是 main。见 [[project-byok-resolved-cache-ttl-invalidation-gap]]、[[project-container-validation-worktree-recipe]]。

**Prisma 客户端中毒（2026-06-03 PR#223 实测）**：主仓有 `prisma generate --watch` 常驻（SessionStart hook 起的），它按**主目录当前分支**的 schema 持续重生成 `node_modules/.prisma`。当主目录在 refactor 分支、worktree 基于 origin/main 且两者 schema 已分叉时，junction 进来的客户端**和 origin/main 源码不匹配** → tsc 报无关错（`Prisma.sql`/某 enum 不存在）、jest `Cannot read properties of undefined (reading 'EVALUATOR')`，pre-commit/pre-push 全挂。客户端只在**根** node_modules/.prisma + @prisma（不在 backend/）。解法=隔离根 node_modules 后 `npx prisma generate`：**别用 git-bash 跑 robocopy（exit 16 挂）**，用 PowerShell「junction-farm」——根 node_modules 设真目录，每个顶层包 junction 回主仓、**只 `.prisma` 和 `@prisma` 做 robocopy 真副本**，再 worktree 内 generate（~2min，比全量 robocopy 省）。**清理时这 ~1500 个 junction 必须先逐个 `.Delete()`，删前用 `Get-ChildItem -Recurse | Where ReparsePoint` 断言 worktree 内 reparse=0 再 `git worktree remove`**，否则递归删穿主仓。
