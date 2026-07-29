---
name: feedback_never_rmrf_worktree_junction
description: 绝不用 Remove-Item -Recurse -Force / rm -rf 删 git worktree 目录——会顺 junction 钻进主仓删源码
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4fe00714-2229-47ae-a0d2-c13aeb3e9cc6
---

**绝不用 `Remove-Item -Recurse -Force`（或 `rm -rf`）删 git worktree 目录。**

2026-06-02 事故：清理旧 worktree 时 `git worktree remove --force gat-contract-wt` 报 "Directory not empty"（node_modules 等 ignored 文件挡路），我 fallback 到 PowerShell `Remove-Item -Recurse -Force` 删该目录 → **删掉主仓 6539 个已跟踪源码文件**（backend/src 4626、frontend 等几乎整棵树）。

**Why**：Windows 上 `Remove-Item -Recurse`（及 .NET `Directory.Delete(path,true)`）遇到目录 junction/reparse point 会**递归进链接目标删真实内容**，不是只删链接。git worktree 目录里常有 junction（node_modules 共享、或工具建的）解析回主仓 → rm -rf 顺着钻进主仓清源码。能零损失救回纯属侥幸：被删文件全在 HEAD（无未提交修改），`git ls-files -z --deleted | git checkout --pathspec-from-file=- --pathspec-file-nul --` 定向还原即可。

**How to apply**：

1. 删 worktree 只用 `git worktree remove`（不行加 `--force`）。**失败就停**，别 fallback 到 Remove-Item/rm -rf。
2. "Directory not empty" 通常是 node_modules 等 ignored 文件 → 要么留着 worktree 报告用户，要么**先单独删 node_modules**（确认不是 junction）再 `git worktree remove`，绝不对整个 worktree 目录 -Recurse。
3. 删任何目录前，先 `Get-Item <path> -Force | ? { $_.LinkType }` 查有没有 reparse point；有 junction 一律不 -Recurse。
4. 误删已跟踪文件可救：`git status` 确认只有 D（删除）、无 M（修改），再定向 checkout 被删文件（不用全局 `git restore .`，见 [[feedback_no_global_git_checkout]] 精神）。

关联 [[feedback_workflow_subagent_cwd_worktree]]（worktree + junction 的坑）。
