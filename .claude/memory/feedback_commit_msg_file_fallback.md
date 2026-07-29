---
name: feedback-commit-msg-file-fallback
description: Windows PowerShell 下多行 CJK commit message 用 here-string 偶发被解析器拆开 → 改用 git commit -F 临时文件
metadata:
  node_type: memory
  type: feedback
  originSessionId: aa7b8f6c-d97e-4b52-a56e-ff61bfd4e543
---

Windows PowerShell 提交多行（尤其含中文/全角标点/emoji）commit message 时，`git commit -m @'...'@` here-string 偶发被解析器拆开，git 把消息正文当成 pathspec → 报 `did not match any file(s) known to git`，commit 不成功。

**Why:** 2026-05-25 F8(b) 提交时，同一 here-string 结构（F7 commit 刚用过且成功）连续两次（含 standalone `git commit -m @'...'@`）都失败，无法稳定复现成功条件 → here-string 路径不可靠。

**How to apply:** 多行 commit message 直接走可靠回退——用 Write 工具写一个临时 `.git-commit-*.txt`（项目内、kebab 名），`git commit -F <file>`，提交成功后立刻 `rm` 该临时文件（属本会话创建，安全删）。单行短 message 仍可用 `-m`。与 [[feedback-multi-session-must-use-pathspec-commit]]、[[feedback-commitlint-subject-case]] 配合（subject 仍须中文起首、type 合法）。
