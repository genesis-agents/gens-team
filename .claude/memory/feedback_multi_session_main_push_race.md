---
name: feedback_multi_session_main_push_race
description: 多 session 共享 main worktree 时 push 反复失败 → 先 git fetch + git log origin/main 看自己的 commit 是否已被别 session 顺手带过去，再决定动作
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7c275681-3745-4c0b-b722-fbe6b75dc9e0
---

多 session 同时操作同一仓库时，自己 push main 卡 pre-push hook 失败后，**不要立刻重 push**——先 `git fetch origin && git log --oneline origin/main | grep <my-merge-hash>` 看 origin/main 是否已经有我的工作。

**Why**：本 session push main 卡了 2 次（Prisma client stale + 别 session 的 radar WIP 类型错），等我准备走 PR 路径时，别 session 把他们的 main 合并并 push，**顺手把我本地 main 上的 merge commit 7a4e21f42 一起带到 origin/main**。如果当时再次重 push，会因 fetch 后 fast-forward 不必要+ 浪费一轮 pre-push hook（5-10 分钟）。

**How to apply**：

1. push 失败 → `git fetch origin && git log --oneline origin/main | head -20`
2. grep 我的 merge / 关键 commit hash
3. 在 origin/main 找到 → 任务完成，跳过 push，验证文件落地 `git ls-tree -r origin/main --name-only | grep <key-file>`
4. 未找到 → 看 pre-push 错误是不是别 session WIP 引起的（如 radar 文件类型错虽不是我代码但 tsc --noEmit 跑全工作树）

相关：[[feedback_lint_staged_stash_safety]] 多 session 共享 stash 风险；[[feedback_multi_session_must_use_pathspec_commit]] commit 必须 pathspec。
