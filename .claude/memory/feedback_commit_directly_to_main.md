---
name: feedback_commit_directly_to_main
description: 本项目直接提交推送到 main，不要为修复自作主张开 feature 分支
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1adb6dfb-5cce-46fa-966f-91512c3454a9
---

本项目（genesis-agent-teams）的工作流是**直接提交并推送到 `main`**，不走 feature 分支 + PR。git log 近期 commit 全在 main。

**Why**：2026-05-21 我修完 ai-ask 房间 socket 后，按"在默认分支要先开分支"的通用规则建了 `fix/ask-room-socket-proxy` 并推该分支，用户震怒「为什么不到主干？？？」。我们项目靠 pre-push 闸门（verify:arch + type-check + 变更测试 + UI audit + i18n + deps，见 [[feedback_push_must_fix_gates_not_wait]]）保证主干质量，不靠 PR review 拦截。

**How to apply**：用户说"提交推送"就直接 commit 到 main 然后 `git push origin main`，不要新建分支。仍然遵守：只提交本会话自己改的文件（[[feedback_commit_only_own_changes]]）、所有闸门必须全绿。若确有并行/实验需求要开分支，先问用户。
