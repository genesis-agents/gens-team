---
name: jest coverageThreshold + testPathPattern gotchas
description: jest 三模块 coverage 阈值守门 / lint-staged stash 行为 / 并发 worktree 的实际坑点
type: reference
originSessionId: 48188271-7da1-49f5-a325-25600a9dee53
---

## jest.config.js coverageThreshold

**directory 路径 vs glob**：

- `"./src/modules/ai-engine/": { lines: 85 }` → **aggregate** 检查（推荐）
- `"src/modules/ai-engine/**/*.ts": { lines: 85 }` → **per-file** 检查（每个文件单独 ≥85%，单个低 cov 文件即破坏阈值，不实用）

**global 阈值与 testPathPattern 冲突**：

- 当 `--testPathPattern` 只跑部分模块时，未运行的模块（其他源码）coverage=0%，会拉低 `global`
- 解决：`global` 设 0 占位，由 per-directory aggregate 守门
- CI 跑全套 (`npm run test:coverage` 不带 testPathPattern) 时 global 阈值才有意义

**纯 re-export barrel 文件**：facade/exports/\*.ts 这类只 re-export 的 barrel 文件，0% functions 但实际不需测试。在 `collectCoverageFrom` 里加 `"!**/facade/exports/**"`。

## --testPathPattern 正则

**必须用 `\.spec\.ts$` 锚定结尾**，否则会把所有 spec 文件都跑一遍：

- 错：`--testPathPattern="leader.agent.spec.ts"` → 跑全部 spec
- 对：`--testPathPattern="leader.agent.spec.ts$"` → 只跑这一个

## --modulePathIgnorePatterns 与 .claude/worktrees

并发 session 在 `.claude/worktrees/*/` 创建 git worktree，jest haste-map 会发现里面的 `__mocks__` 与主仓重复，报 "duplicate manual mock" 错误。

解决：`--modulePathIgnorePatterns="\\\\.claude\\\\worktrees"`（注意 Windows 路径双反斜杠 + 转义）。

## lint-staged + husky 的 stash 行为

pre-commit 时 lint-staged 会：

1. `git stash` 未 staged 的 working tree
2. 跑 ESLint --fix + prettier --write + jest
3. `git stash apply --index` 恢复

**坑**：如果 ESLint/jest 失败，stash 不会 apply 回来；下次 commit 时另一个 session 可能 stash apply 把它的 WIP 混入你的 staged。需要 `git diff --cached --name-only` 检查并 `git reset HEAD <file>` 排除非本次产物。

## NODE_OPTIONS=--max-old-space-size=8192

ESLint 跑大批 .spec.ts 文件 + 类型感知规则（type-aware lint rules）会 OOM 导致 pre-commit 崩溃（V8 stack trace 含 X509_STORE_set_cleanup / uv_timer_set_repeat）。`NODE_OPTIONS=--max-old-space-size=8192 git commit ...` 提高堆内存即可。

## .gitignore 与新生成的 **tests**/

`.gitignore` 含 `env/` 全局规则，导致 `runtime/env/__tests__/*.spec.ts` 被默默忽略。`git add` 不报错但文件不被跟踪。用 `git status` 看不到。需要 `git add -f <path>` 强制添加。
