---
name: project-byok-resolved-cache-ttl-invalidation-gap
description: 为何不能简单调大 AiModelConfigService.resolvedModelCache 的 60s TTL
metadata:
  node_type: memory
  type: project
  originSessionId: 90759ea2-c102-4062-a833-4f22bcc58eb1
---

`AiModelConfigService.resolvedModelCache`（getModelById 的 BYOK 解析缓存，TTL=60s）只在 `user-model-configs.controller.ts` 的 create/update/setDefault/delete 调用 `clearResolvedModelCache(userId)` 失效。

**坑（已解决，2026-06-03）**：原先 `user-api-keys.controller.ts` 改 API Key / preferredModelId **不调** clearResolvedModelCache，故 60s TTL 是有意压短的陈旧窗口上限。**现在 saveKey/deleteKey 已接上 `clearResolvedModelCache(userId)`（"M2 fix"，origin/main 已有）**，加上 UserModelConfig CRUD 也失效 → 用户侧写路径全覆盖。于是 **PR#223 把 TTL 60s→5min**（与 modelConfigCache 对齐；admin 改 AIModel 本就靠 modelConfigCache 5min TTL 传播，不引入新陈旧窗口）。效果：BYOK 冷解析从「每个新会话一次」降到「每 5min 每进程一次」，无需注册模型。**残留**：每进程 5min 内第一次 + 每次部署后第一次仍付 ~2-4s synthesize 冷解析（DB-RTT 主导，单次 RTT 实测 470ms）。要再降：压 synthesize 串行 RTT（cache resolveProviderDefaults / 合并 provider+key 查询）或 DB 与后端同区域。

**Why:** 评估 ai-ask 首条消息慢（model 解析 5.2s）时，想用「调大 TTL」治本，但发现 TTL 是 correctness 兜底不是纯 perf 旋钮。
**How to apply:** 想延长 resolved-model 缓存寿命 → 先给 UserApiKey 写路径加 clearResolvedModelCache。当时改用并行化冷路径（getModelConfig 3/4/5 并行 + synthesize 并行取 key）做纯 perf 优化，不碰缓存语义。**已合 main：PR#215=merge 4d3d6335f（我的 commit 95e247385），CI 全绿。** 见 [[project-byok-model-resolution-cache]]。

**合并踩坑（共享工作目录）**：主工作目录被其他 session 切到别的分支 + 有未提交文件 + 别的 worktree 在committing。直推 main 会带上别人未就绪的提交。正解=`git worktree add <dir> origin/main` 隔离干净分支只放自己的改动 → PR。worktree 无 node*modules/.husky/*，从主仓 junction 进去（New-Item -ItemType Junction）hooks 才能跑；删 worktree **前**必须先 `.Delete()` 掉 junction（reparse point only），否则 `git worktree remove` 沿 junction 递归删掉主仓 node_modules。lint-staged ESLint OOM 带 `NODE_OPTIONS=--max-old-space-size=8192`；capability baseline 行号漂移 `audit:capability:update` re-anchor 入 commit。
