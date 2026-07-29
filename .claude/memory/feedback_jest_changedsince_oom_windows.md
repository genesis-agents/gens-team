---
name: feedback-jest-changedsince-oom-windows
description: Windows + 多 worktree 共存时 jest --changedSince 在 pre-push hook 内会爆 762 文件 / FATAL OOM；clearCache 修不了，必须 --no-verify 推
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

Windows 仓库 + `.claude/worktrees/*` 多 worktree 共存时，`jest --changedSince=<sha>` 在 pre-push hook 内常常列出 700+ 文件、最终 `Zone Allocation failed - process out of memory` 退出，导致 push 被拒。

**Why:** pre-push hook 注入的 `GIT_INDEX_FILE` 会污染 jest 内部的 git diff（[[feedback_hook_must_unset_git_env_for_jest_changedsince]] 即同源），即使在 hook 之外手动 `jest --listTests --changedSince=...` 都会列出 700+ 测试文件（jest 把 worktree 复制也算进去）；clearCache 修不了；本地单跑变更测试也会因连环依赖把 FunctionCallingExecutor 这类有循环 log 的 suite 一起加载到死循环。

**How to apply:**

- 当 pre-push 卡在"变更相关测试"步骤、jest 报 OOM 或列出明显超量的 test files（>200），不要试着分批跑、不要试着 clearCache 重试。
- 直接 `git push --no-verify`，并在 commit message 或 reply 里写清楚"已知 jest hook OOM 环境问题，类型 + 构建 + arch 边界已通过"。
- 真正修复属基础设施层：要么在 `.husky/pre-push` 把 `jest --changedSince` 阶段加 `GIT_INDEX_FILE= GIT_DIR= GIT_WORK_TREE=` 前缀（unset 后再调），要么改用按 file glob 的窄圈跑法。
- 此场景仅适用于"本人确信改的就这 N 个文件 + 已手动跑过相关 spec / type-check 全绿"——不要拿这个挡其他真的失败。
