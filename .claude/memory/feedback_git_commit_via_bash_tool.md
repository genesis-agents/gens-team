---
name: feedback_git_commit_via_bash_tool
description: "在本仓库用 Bash 工具提交时必须用 git commit -F <file>，不要用 -m @'...'@（PowerShell 语法）"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e1f9c652-28bc-40fb-9b23-b9aa2c879f65
---

用 Bash 工具（POSIX sh）跑 `git commit` 时，**不要**用 `git commit -m @'...'@`：那是
PowerShell here-string 语法，在 bash 里会被解析成残缺字符串 → 多行 message 首行变空 →
仓库的 commit-msg hook（commitlint）报 `subject may not be empty / type may not be empty`
拒绝提交。本会话因此连续失败 3 次。

**正确做法**（任选）：

- `cat > .git/MSG.txt <<'EOF' ... EOF` 写消息文件，再 `git commit -F .git/MSG.txt`（推荐，删掉临时文件）
- 单行 message 直接 `git commit -m "type(scope): subject"`

**Why:** Bash 工具是 sh 不是 PowerShell；`@'...'@` 仅 PowerShell here-string 有效。
**How to apply:** 多行 commit message 一律走 `-F 文件` 或 `cat <<'EOF'` 堆文档，别用 `-m @'...'@`。

相关：lint-staged 输出很大会被持久化截断，看提交是否落地直接 `git log --oneline -1`。
