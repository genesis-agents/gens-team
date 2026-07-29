---
name: throwaway-sim-scripts-must-cleanup
description: 一次性调试/审计脚本（sim-* / dump-* / verify-brief）任务结束必须当场删，不能留 untracked 等用户提醒
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

## 规则

DB-driven 调试脚本（`scripts/dev/sim-*.js`、`*-audit.js`、`*-verify-brief.md`）跑完出结论就**当场 rm**，不要留作 untracked 文件污染 `git status`。结论沉淀到 commit message + memory，脚本本身没有复用价值。

## Why

用户两次同 session 投诉：第一次（Phase 4）"没用的文件删除掉"，第二次"很多脚本不提交也不删除？" — 显示这是用户强烈不耐烦的反模式。留 untracked 一次性脚本会：

1. 污染 `git status`，下次 commit 不小心 `git add -A` 全吸入
2. 让别 session 误以为是自己的工作不敢动
3. 用户 review 仓库状态时看着烦躁

## How to apply

- 一次性 sim/audit 脚本生命周期：**写 → 跑 → 取结论 → 立即 rm**
- 结论沉淀点：commit message + project memory + plan.md 回填
- 持久化监控/重跑触发器（如 `monitor-mission.js`、`trigger-prod-mission.js`）才 git add
- 命名约定：一次性脚本统一 `sim-*` 前缀（已是事实约定，便于批量识别）
- 每轮 task 收尾 default 任务"沉淀经验"之前先 `git status` 自查 untracked sim-\*，有则同步清

## 反例

- 2026-05-08 session：11 个 sim-\* 文件挂 untracked 直到用户问"很多脚本不提交也不删除？"才清
- 2026-05-07 session 类似（Phase 4 "没用的文件删除掉"）
