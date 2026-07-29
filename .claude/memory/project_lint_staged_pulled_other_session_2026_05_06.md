---
name: lint-staged-pulled-other-session-files
description: 2026-05-06 P0-C commit 5cca1af41 把别 session 的 16 个 modified+untracked 文件意外吸入；feedback_lint_staged_stash_safety 警告再次实证
type: project
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

## 实证

P0-C commit 5cca1af41 (rerun maxCredits 修复) 计划只 commit 1 个文件
（mission-rerun-orchestrator.service.ts），但实际包含 17 个文件：

- 1 个我的（orchestrator）
- 16 个别 session 的 modified + untracked（custom-agents / models.prisma /
  page.tsx / Sidebar.tsx / MissionGalleryView.tsx 460 行新文件等）

## 触发条件

- 多 session 并行（一个跑 P0 hotfix，另一个跑 custom-agents）
- husky pre-commit → lint-staged → prettier --write 配置 `**/*.{json,md,yml,yaml}`
  glob 匹配范围广
- lint-staged stash → run task → unstash 过程中某一步骤把别 session 的改动 stage 了

## 处置原则

事后 reset 重做风险高（再次触发同 hook、可能再吸 / 丢工作），按以下决策：

- 收益（commit 边界清洁）vs 代价（reset 复杂、可能再次发生）
- 多 session 并行时**优先接受现状不 reset**，在 commit message 或 PR 描述
  备注"含其他 session 文件"，让 reviewer 自查
- 真正治本：W23 range 加 lint-staged hook stash 隔离 / 改用 commit 时显式
  pathspec（`git commit -- file`）防 staged 漂移

## How to apply

下次出现同样误吸：

1. **先看 origin/main 是否落后**（未 push 时损失最小）
2. 评估 reset --soft + 重做的风险（多 session 并发越多越危险）
3. 倾向接受现状：commit history 不洁但代码全保留
4. 用 `git -C ... commit -- file1 file2`（pathspec 形式）强制只 commit 指定
   文件，绕过 staging area 漂移
