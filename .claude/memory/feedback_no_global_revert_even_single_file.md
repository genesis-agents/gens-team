---
name: 单文件 git checkout 也不能在有其他 agent 未提交工作的文件上用
description: git checkout -- single-file.ts 在该文件本身就有未提交 in-progress 改动时同样会清空那些工作；不要凭"我只动一个文件"就觉得安全
type: feedback
originSessionId: 94c0899f-9d18-492b-abde-5c553623a0bd
---

**规则**：在文件 working copy 与 HEAD 不一致时，禁止用 `git checkout -- path/to/file` 来"回滚自己的错改"——因为该文件可能本来就有其他 session / agent 的未提交工作，checkout 会一并清空。

**Why**：2026-05-04 PR-1 期间犯过这个错——`team.mission.ts` 上有另一 agent 的 runtimeShell + stageBindings 重构 in-progress 改动，我用 `git checkout -- team.mission.ts` 想回滚自己的错改，结果把另一 agent 的工作一起回滚了。CLAUDE.md "Git 安全操作"红线只列了禁止 `git checkout -- .` / `git restore .`，但单文件 checkout 在这种场景下同样不安全。

**How to apply**：

- 编辑文件前先 `git diff path/to/file` 确认 working copy 内容是不是含其他 agent 的工作
- 如果错改了文件，**用反向 Edit 修正**而不是 git checkout 回滚
- 只有在 `git diff path/to/file` 输出为空（working copy = HEAD）时才能 `git checkout -- path/to/file`，等价于"什么都没改"
- 如果不确定 working copy 当前状态属于谁，先做 `git stash --keep-index --include-untracked` 备份再操作
- 教训等同于"全局 checkout"红线：`measure twice, cut once` 适用于所有 git 状态变更
