---
name: feedback_god_class_extract_helper
description: 写 god-class 文件（>2500 行）新功能净增 >50 行，pre-push 拒推；必须当场拆 helper 文件
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

`.husky/pre-push` 第 0a 步 god-class size guard 对 >2500 行文件单次推送净增 >50
行硬拒。命中后必须**当场**把新增逻辑抽到独立 helper / utils / service 文件，
不能强推、不能 `--no-verify`、不能 wait 后续 PR 处理。

**Why**：2026-05-12 推送 6 commits 时 ai-admin.service.ts 3038 → 3124（+86 行）
触发拒推。修法 commit `3762d6542`：把新加的 secret health 富化逻辑（map 聚合 +
optional null 处理）拆到 `tool-secret-health.helper.ts` 独立文件，
exposing `enrichToolsWithSecretHealth(prisma, tools)` 函数，service 调用方仅一行。

**How to apply**：

- 在 god-class 文件加新功能前先检查文件行数（`wc -l`）
- > 2500 行的：新代码默认写到 sibling helper 文件，service 内只保留单行调用
- helper 文件结构：纯函数 + interface + 私有 helper（不需要 @Injectable）
- 复用 service 注入的 PrismaService 通过参数传入
- 命名：`{feature}-{topic}.helper.ts` (e.g., `tool-secret-health.helper.ts`)

关联：[[feedback_god_class_pre_push_split]] [[feedback_lint_staged_stash_safety]]
