---
name: feedback-push-directly-to-main
description: '用户要求"提交并推送"时默认直接推 main,不要先开 feature 分支'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 259303dc-57d3-482c-96e0-79f348a871b5
---

用户说"提交并推送 / 推送到远程主干"时,期望**直接 commit 到 main 并 push origin main**,不要自作主张先开 feature 分支再让他建 PR。

**Why**: 2026-06-04 文档同步任务,我按"默认分支先开分支"的习惯建了 `docs/...` 分支并推送,用户明确纠正"我是让你推送到远程主干"(带强烈情绪)。

**How to apply**: 本仓库 pre-push hook 会跑 verify:arch 等校验作为安全网,直接推 main 是可接受的工作流。除非用户说"开 PR / 走分支",否则"提交并推送"= `git checkout main` → `git pull --rebase` → 合并/提交 → `git push origin main`。这覆盖了 CLAUDE.md 里"if on default branch, branch first"的默认。

**与 [[feedback_shared_workdir_use_worktree_for_commits]] 的区分**:那条讲"怎么安全做工作"(并发 session 共享主目录易被回退→用 worktree 隔离);这条讲"交付终点在哪"(用户说推送=最终落到 main,不要停在 dangling 分支/PR)。两者不冲突:可以在 worktree 里做完,但最后按用户意图合并推 main,而非只留 PR 等他点。

**强化(2026-06-07,「一人公司操作系统」)**:连 AskUserQuestion 问"PR vs 直接 push main"都是多余——用户两次纠正「我需要你推送到远程主干啊」「不是分支」。即使工作区在别人分支上/脏,也别问,直接 direct-main:`git fetch` → 在干净基线上 `git rebase origin/main`(或本就 FF) → `git push origin HEAD:main`(免 checkout main,FF 推)。若误开了 PR/临时分支:提交直推 main 后 GitHub 自动把 PR 标 MERGED,再 `git push origin --delete <临时分支>` 清理。安全机制照旧是 pre-push hook 全套门禁。

**升级为默认行为(2026-06-29)**:`commit 完直接 push`——不要停在 commit 等用户再说一句。CLAUDE.md 里"commit or push only when the user asks"被这条覆盖:一旦本会话有了提交意图(用户让改/修/做某事并已 commit),就接着 `git push origin main`,不再把 commit 当终点。用户原话「以后 commit 完直接 push」。注意:pre-push hook 会跑变更测试,耗时常 >2min,push 命令给足 ≥600000ms 超时,别被默认 2min 杀掉误判为推送失败。只推已提交的内容,工作区其他未提交/未跟踪文件不顺手带上。
