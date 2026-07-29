---
name: feedback-hook-must-unset-git-env-for-jest-changedsince
description: pre-push hook 调 jest --changedSince 前必须 unset GIT_INDEX_FILE/GIT_DIR/GIT_WORK_TREE，否则 Win husky 下 jest 内部 git diff 拿到 push 传的索引文件，吐 usage 错失败
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

# pre-push hook jest --changedSince 必须先 unset git env

**Rule**：`.husky/pre-push` 在调 `npx jest --changedSince=...` 之前必须 unset 这组 git 内部环境变量：

```sh
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE GIT_PREFIX GIT_REFLOG_ACTION
```

**Why**: `git push` 触发 hook 时，git 会把它自己用的 `GIT_INDEX_FILE`（指向 push 用的临时 index）传给子进程。jest `--changedSince` 内部调 `git diff` 比对文件时，子 git 进程错把 push index 当工作树 index 用，参数解析出错，吐 `git diff` 的 **usage 帮助文本**（带 `--output <file>` / `--[no-]exit-code` / `--diff-filter` 等条目），exit 非零。

这就是为什么直接运行 `bash .husky/pre-push` 或 `sh -e .husky/pre-push` 全过、单独跑 `npx jest --changedSince=...` 也全过、但走 `git push` 触发就 hook 必死的原因。Hook 输出会卡在：

```
[3/5] 变更相关测试...
  backend: running jest --changedSince=<sha>
husky - pre-push hook exited with code 1 (error)
```

中间什么都不打（因为 `sh -e` 在 jest 非零返回时直接 abort，没走到 "backend 变更相关测试失败！" 错误分支）。

**How to apply**:

1. 任何 `pre-push` / `pre-commit` 类 hook 里只要调 jest `--changedSince` / `--findRelatedTests` / `--lastCommit` 等依赖 git 历史的 flag，**第一行**就 unset git env：
   ```sh
   cd backend
   unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE GIT_PREFIX GIT_REFLOG_ACTION
   npx jest --changedSince="$BASE_SHA" ...
   ```
2. 不只是 jest —— 任何子进程在 hook 里调 git（lint-staged 自己的 `git stash`、prettier 的 git status 等）都应该清这组 env，否则跨子进程 git 操作会用到 push index 而非工作树。
3. 不要靠 `--no-verify` 绕过这类失败 —— 看到 hook 输出"卡在 jest 行后立刻 exit 1 + 中间无错误信息"就是这个坑，先 unset 再说。

**调试手法**（再遇类似坑必备）：

- 临时改 hook：`npx jest ... > log 2>&1` 改成 `npx jest ... 2>&1 | tee log | tee /tmp/jest-debug.log | tail -5` 把输出引到稳定路径
- 加 `set +e` ... `set -e` 围栏让 hook 不被 `sh -e` 中途阻断
- 加 `echo "[DEBUG] GIT_DIR=$GIT_DIR GIT_INDEX_FILE=$GIT_INDEX_FILE"` 看注入了哪些 env

**关联**：[[feedback-jest-cache-changedsince-false-fail]]（同一表象但不同病因 —— 那条是 cache 假失败 clearCache 重试就好；这条 clearCache 无效，必须 unset env）
