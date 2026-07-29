---
name: 多 session 并行时 commit 必须用 pathspec 法
description: git commit 必须用 `-m "msg" -- pathspec` 显式指定文件，禁止默认 `git add + git commit` 流程；多 session 并行时 lint-staged 会吸入别 session 的文件
type: feedback
originSessionId: 3ec5f5a4-a3af-4582-8536-bbe9178f3c3e
---

多 session 并行 working tree 上 commit 时，**必须**用 `git commit -m "msg" -- file1 file2` pathspec 法，**禁止**默认的 `git add` 后 `git commit`。

**Why：** 2026-05-08 PR-A migration.sql 被别 session 的 commit 吸入；同日 PR-E 第一次 commit 又把别 session 的 `agent-playground-event-relay.ts` / `facade/index.ts` / `event-relay.framework.ts` 共 3 文件吸入到我的 spec commit 里。两次都是 lint-staged 在 stash/pop 流程中把 unstaged + untracked 文件吸入 staging 区，然后被 git commit 一起打包。用户明确批评"你不要把别人的文件放进来"。

**How to apply：**

1. **多 session 并行的判定**：`git status --short` 出现非自己 working 的 modified/untracked 文件时即为并行状态
2. **强制流程**：直接 `git commit -m "msg" -- 我的文件1 我的文件2`（pathspec 在 `--` 后），lint-staged 会报 "No staged files match" 但 commit 成功且只含 pathspec 文件
3. **禁止流程**：`git add 我的文件 && git commit`——即使只 add 了我的，lint-staged stash 流程仍会把别人的 working 改动吸入
4. **commit-msg hook**：commitlint type 必须是 feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert，subject 全小写
5. **如果已经误吸入**：`git reset HEAD~1`（mixed，不丢 working tree） + 重新用 pathspec 法 commit
6. **绝不**：`git checkout -- file` / `git reset --hard` / `rm -rf` 处理别 session 文件——可能丢工作

**记忆锚点**：用户原话"你不要把别人的文件放进来，不知道？？？"——这是 2026-05-08 PR-E 第二次踩同款坑后的硬反馈。
