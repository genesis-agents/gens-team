---
name: commit message body/footer 每行也必须 ≤100 字符
description: commitlint 的 footer-max-line-length 默认 100；CLAUDE.md 只点了 header <100，body/footer 长行同样会让 commit-msg hook 拒
type: feedback
originSessionId: d7fa9dec-c281-49d4-9fe6-5c8f85de1f5d
---

Genesis 项目 commitlint 不止 `header-max-length: 100`，还启用了 `body-max-line-length: 100` 与 `footer-max-line-length: 100`（默认值）。任何一行（含 bullet/链接/路径）超 100 字符都会被 commit-msg hook 以 `footer's lines must not be longer than 100 characters` 或 `body's lines must not be longer than 100 characters` 拒。

**Why**: 2026-05-09 logo 改造 commit 第一次失败：body bullet `- replace hex-network favicon with deep navy (#0B1E3F) rounded-square badge + double warm-gold (#C9A961) hairline + serif G` 117 字符 → footer-max-line-length 拒。CLAUDE.md 只写了 "header < 100" 容易让人误以为 body 不限。

**How to apply**:

- 写 commit message 时不仅 header，body / footer 每行都按 100 字符上限拆
- bullet 列表里堆色值/路径/全名很容易就超，写完瞄一眼最长行
- 失败重试前先 `git diff --cached --stat` 确认 staged 还是自己 3 个文件 + `git status` 确认无串入；多 session 并行风险见 feedback_lint_staged_stash_safety
- 实在要长链接，用 reference-style 引用脚注（不行就拆行）；不要 --no-verify 绕过
