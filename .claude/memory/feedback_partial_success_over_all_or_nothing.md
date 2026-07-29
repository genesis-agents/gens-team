---
name: feedback-partial-success-over-all-or-nothing
description: 长耗时多页 pipeline 任何一页失败不许整批 fail，必须早断 zod + 部分 commit + UI 显失败 slug 列表
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

长耗时（>30s）多页/多项 LLM pipeline 任何一项失败不许整批 fail；必须 partial-success + 早断 per-item 验证 + UI 暴露失败列表。

**Why**:

- 2026-05-12 Wiki Ingest #14：13 页 section-fill 3 页失败，整批 throw → 用户损失 10 个成功页
- 2026-05-13 Wiki Ingest #28：13 页 section-fill 全成功，但 assemble 阶段 zod 校验单项失败，6m+ 工作全丢
- 2 起都是同模式："1 page broken → throw → 全丢"

**How to apply**:

3-layer 防御（任何长耗时 pipeline 都按这个套路）：

1. **早断 zod**：每个 LLM 调用完成时**立即** safeParse 输出 schema。坏的当场进 `failedSlugs`，不堆到 assemble 阶段才发现。
2. **assemble 兜底**：assemble 时还失败的 item 再逐项 safeParse，剔除坏的，commit 剩余有效项。
3. **零成功才 throw**：只有 0 项通过 = "请重试"；≥1 项通过 = `warn-only` log + 接受 partial commit + UI banner 显具体失败 slug 列表（"5 条页失败：foo, bar, ..."）。

**容忍率**：per-page LLM 调用 20-30% 失败率是常态（rate-limit / content-too-large / 模型偶发幻觉边界字段）。tolerance 默认配 0.5（一半失败仍可接受 partial commit）。**绝不**用 0.2 默认值"严苛"——只会让用户重试，最后还是命中同一概率分布。

**反模式（严禁）**：

- 一次 zod safeParse 失败就 `throw new BadRequestException`
- 部分成功页没 checkpoint，crash 后整批重跑
- UI banner 只显笼统 "请重试"，不告诉用户哪些页失败 / 哪些字段错

文件参考：

- backend/src/modules/ai-app/library/wiki/wiki-ingest.service.ts:866 (早断 zod)
- backend/src/modules/ai-app/library/wiki/wiki-ingest.service.ts:1045 (assemble 兜底)
- backend/src/modules/ai-app/library/wiki/wiki-ingest.service.ts:967 (零成功才 throw + tolerance 默认 0.5)

相关：[[feedback_kb_silent_429_failmodes]]、[[feedback_destructive_op_must_have_rollback]]
