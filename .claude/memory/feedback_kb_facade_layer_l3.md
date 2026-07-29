---
name: KB-aware augmentation must live at L3 (ai-app), not L2 (ai-engine)
description: Wiki / KG / 任何"对 KB 的二次加工层"想接入 RAG 消费链时，桥层必须在 ai-app/library/，不能挤进 ai-engine/rag/
type: feedback
originSessionId: b949ea5a-fac4-41e1-9876-2bd78c4ce5c5
---

任何"对 KB 的二次加工层"（wiki / 知识图谱 / 摘要库 / future X）要接入下游 AI app 的 KB 查询消费时，**桥层必须在 ai-app/library/，不能在 ai-engine/rag/**。

**Why:** ESLint `no-restricted-imports` (`backend/.eslintrc.js`) 锁死 `ai-engine cannot import ai-app modules`。wiki / KG 等"加工产物"的服务都在 `ai-app/library/`。如果想让 RAGPipelineService 直接知道 wiki，要么 ai-engine 反向 import ai-app（违规），要么把 wiki schema 知识下沉到 ai-engine（破 MECE，让 engine 知道 agent/business 概念）。两条都错。正确做法是新加一个 L3 facade（如 `ai-app/library/kb-query/KbQueryService`）组合 ai-engine RAGPipelineService + ai-app/library/wiki/WikiSourceProvider。

**How to apply:**

- 用户说"让 X 自动用上 KB 的 wiki / KG / 摘要"时，先答"在 L3 层加 facade，不动 ai-engine"
- 桥层暴露的 query API 要保持与 RAGPipelineService.query (RAGQuery → RAGResponse) 形状一致——consumer 一行构造器换名即可，避免 ripple
- consumer 迁移 path：`@Optional() RAGPipelineService` → `@Optional() KbQueryService`，调用点全替换；先迁高价值 consumer（ai-ask），其余 follow-up
- 不要试图用 ai-engine 的 DI token / global provider 做 plugin 注入——Nest module 边界 + Optional inject 的语义会让 ai-engine 端"看得见但不可控"，调试时反而更乱

**反例**：把 WikiQueryService 挂进 ai-engine/rag/ 当一个 strategy；把 wiki_pages 表搬进 engine 让 RAGPipelineService 直接读。这两种都已被这次设计 round 排除掉。
