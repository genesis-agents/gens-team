---
name: feedback-commit-only-own-changes
description: 提交前必须 git diff --cached --name-only 核对，只提交本会话自己改的文件，绝不夹带工作树里的无关改动/删除
metadata:
  node_type: memory
  type: feedback
  originSessionId: 494c61c5-c748-4a7c-a8fd-f4d7cda538da
---

提交前**必须先 `git diff --cached --name-only` 核对暂存区**，确认里面只有本次自己改的文件；发现无关项（别的会话/进程留下的删除或改动）立即 `git restore --staged` 踢出，再提交。

**Why:** 2026-05-20 一次提交把工作树里无关的 `litellm-proxy/`(13 文件) + `STRUCTURE.md` + 乱码 prisma-fixes 删除一起提交了（这些不是本会话改的）。用户明确要求"你只提交自己的"。已 `git reset --soft HEAD~1` 软回退、restore --staged 踢出无关项、只重提自己的 3 个文件后推送修复。

**How to apply:**

- 优先用**显式路径** `git add path/a path/b`，少用 `git add -A`（哪怕 scoped 也可能把该目录下别人的删除纳入）。
- commit 前永远 `git diff --cached --name-only` 看一眼；文件数/路径与预期不符就停下排查。
- 工作树里出现不认识的删除/改动（非本会话所为）→ **不碰、不提交**，明确告知用户由其处置。
- 本仓库工作树常有其他 session/进程的未提交变动（见 [[feedback-frontend-dir-hygiene]] 同源的多会话特性）。
