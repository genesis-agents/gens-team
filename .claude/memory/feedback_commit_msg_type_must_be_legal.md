---
name: commit message type + subject-case 必须合 commitlint
description: type 必须 enum 内 (feat/fix/...) + subject 必须 lowercase (P1/P2 等大写 token 也会被拒)，违反让 commit-msg hook 拒 → lint-staged stash 错位风险
type: feedback
originSessionId: 62a9828f-0671-4aa6-af68-508d17f2619c
---

commit message 第一行 `<type>(<scope>): <subject>` 中的 `<type>` 必须是 commitlint 配置的合法类型，**且 `<subject>` 不得是 sentence-case / start-case / pascal-case / upper-case**。

Genesis 项目的合法 type-enum (commitlint.config.js)：

- feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert

**禁用** type 词：review / merge / wip / hotfix / fix-review / round 等都会被 commit-msg hook 拒绝（`type-enum [error]`），exit 1，让 lint-staged stash 残留 + retry 增加 stash/pop 错位风险。

**Why**: 2026-05-08 Phase A+B+C round 1 共识修复 commit 我用 `review(playground): ...` 失败 2 次（不是 lint-staged 跑测试失败而是 commit-msg hook 拒），第三次改成 `chore(playground)` 才通过。期间 stash list 累积了一个 `lint-staged automatic backup` 孤儿（commit 落地后未自动清理）。

**Subject-case 失败模式**（2026-05-14 新增）：subject 含 `P1+P2`、`HTTP`、`API`、首字母大写等都会触发 `subject-case [error]`。subject 应该用纯 lowercase 中文/英文混合。子要点：

- `P1+P2 链路双语化` ❌ → `p1+p2 链路双语化` ✅
- `Fix wiki bug` ❌ → `修复 wiki bug` 或 `fix wiki bug 中的链路问题` ✅
- 项目命名 `Genesis` 或 `OpenAlex` 这种已存在的 brand 一般会被认为是 lowercase 不到，规避方法是写 `genesis-ai` / `openalex`（小写）

**How to apply**:

- 写 commit message 前先看 commitlint.config.js 的 type-enum + subject-case 规则
- review 修复用 `chore` 或 `refactor`；P0 hotfix 用 `fix`；纯注释/文档用 `docs`；纯测试改动用 `test`
- subject 全 lowercase，技术词 (P1/HTTP/API) 改为 p1/http/api
- 失败重试前必须 `git stash list` 检查孤儿 stash 是否堆积；多 session 并行时一旦发现孤儿要谨慎处理（feedback_lint_staged_pulled_other_session）
- 不要冲动用 --no-verify 跳过 hook（CLAUDE.md 红线），hook 失败说明 message 或代码有真问题
