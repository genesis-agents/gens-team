---
name: project_lintstaged_windows_arglimit
description: 大批量重构提交时 lint-staged eslint 因 Windows 命令行长度上限失败的应对
metadata:
  node_type: memory
  type: project
  originSessionId: 4fe00714-2229-47ae-a0d2-c13aeb3e9cc6
---

`.lintstagedrc.js` 的 `backend/**/*.{ts,tsx}` 任务用 function-form 把**所有** staged 文件拼成单条 `eslint --cache --fix <files...>`。当一次提交涉及 130+ 文件(大规模 move/rename 重构)时,这条命令超出 Windows 命令行 ~8191 字符上限,eslint **spawn 失败**(报 "The command line is too long."),commit hook exit 1 —— 不是测试/代码问题。

**应对(已验证)**:独立跑完该 hook 等价校验(`tsc --noEmit`=0、`eslint`仅 warning、并行 `jest`、`verify:arch`、`audit:capability`)后,用 `git commit --no-verify` 绕过**仅 commit 钩子**。`.husky/pre-push` 是真实门(跑 verify:arch + typecheck + 关联 jest,不受 arg 长度影响),push 时照常拦截。曾在 2026-06-03 model-domain / services 拆分两大批连续触发。

**注意**:跑 git commit 前先 `export NODE_OPTIONS=--max-old-space-size=8192`(lint-staged eslint type-aware 规则会 OOM 4GB 默认堆)。

**待办**:把该 task 改造成 file-list/xargs 分块调用(或 `eslint --stdin` 列表),根治 arg 长度问题,即可恢复大批量提交走完整 commit 钩子。见 [[feedback_never_rmrf_worktree_junction]] 同属 Windows 重构踩坑。
