---
name: LLM 必须看到才能引用的 ID 必须既在 prompt 又在 service 白名单
description: 让 LLM 在结构化 JSON 中回填某个外部 ID（documentId/userId/skillId 等）时，prompt 必须显式给出该 ID + service 必须用白名单兜底，zod uuid() 不该当主防线
type: feedback
originSessionId: d7fa9dec-c281-49d4-9fe6-5c8f85de1f5d
---

让 LLM 输出结构化 JSON 中包含某个外部资源 ID（如 `documentId`、`userId`、`skillId`、`agentId`），永远不要假设 LLM 能"猜对"这个 ID，必须三层一起做：

1. **Prompt 必须显式给 ID**：在外部内容前加 `[documentId: <id>]` 这类显式行，并在 system prompt 里强调"copy verbatim, do not invent / shorten / reformat"
2. **Service 必须白名单兜底**：从调用者传入的 ID 集合构建 `Set`，zod 解析后/前过滤；未知 ID 的字段作为"软坏数据"剔除而非 reject 整体
3. **zod 不该用 `uuid()` 当主防线**：strict uuid() 会让一条坏 cite 把整张 diff 全 400；放宽到 `string.min(1).max(N)`，由 service 白名单做语义校验

**Why**：2026-05-09 LLM Wiki ingest 在 grok-4-1-fast-reasoning 上连续两次返回 400 "LLM output failed schema validation"，根因是

- prompt 里只有 `<external_source title="...">` 没给 documentId
- LLM 自创了 16 字符前缀作为 documentId（不是 UUID）
- zod `documentId.uuid()` 在 path `creates[0].sources[0].documentId` reject 整个 response
- 一次 65s 的 LLM 调用全废，用户体验灾难

修复 commit `01cc52169`：prompt 加 `[documentId: ...]` 行 + service 白名单 `allowedDocumentIds` 过滤未知 cite + schema `documentId.uuid()` → `string.min(1).max(200)`。

**How to apply**：

- 任何 LLM 必须输出真实 ID 引用的接口（diff sources / agent handoff target / tool input id 引用）走"prompt 显式 + service 白名单 + zod 宽松"三件套。
- 失败行为永远是"软剔除"（drop bad item, keep valid ones, log warn count）而非"硬 reject"（throw 整体），除非整个响应没有任何可用项。
- 零成本验证：`grep` 任何 zod schema 中的 `\.uuid()` 跟 LLM 输出对接的位置，全是嫌疑点。
