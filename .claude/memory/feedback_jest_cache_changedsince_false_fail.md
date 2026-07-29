---
name: feedback-jest-cache-changedsince-false-fail
description: pre-push hook 跑 jest --changedSince 报失败但单独跑 spec 全过 → jest cache stale，必须 npx jest --clearCache 后重试
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

pre-push hook 用 `jest --changedSince=<base>` 跑变更相关测试，偶尔报"N failed"但**单独 `npx jest <spec>` 全 pass**。

**Why**：jest 的 transformer cache 在 `~/.jest-cache`（Windows `%TEMP%/jest`）。多 session 并行场景下：

1. session A 改了 service 代码 + commit
2. session B 在中间也跑过 spec，jest 缓存了**session B 视角的 spec transform 结果**
3. session A push 时 hook 跑 jest，命中缓存的 stale transform → spec 行为对不上新 service → 4 failed
4. 单独跑 spec 时 jest 会重新 transform 当前 working tree → 全过

复现：2026-05-13 throttle 修复 push 时 4 个 testTTSModel 假失败（spec 跟 service 都已经更新到最新行为，但 cache 老）。

**How to apply**：pre-push hook 报"少量 spec 失败但单独跑全过"时，第一反应：

```bash
npx jest --clearCache
git push origin main
```

不要怀疑代码有问题，不要 --no-verify，不要去乱改 spec（会污染别 session 的工作）。

适用范围：

- 多 session 并行（git worktree 或多终端同时跑 jest）
- 长会话跨多次 commit / rebase
- 切分支后第一次 push

不要每次 push 都清缓存，只在出现"假失败"模式时清。

相关：[[feedback_lint_staged_stash_safety]] [[feedback_lint_staged_pulled_other_session_2026_05_06]]
