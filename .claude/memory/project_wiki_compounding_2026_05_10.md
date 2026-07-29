---
name: Wiki "compounding" loop landed (3-PR sweep)
description: 2026-05-10 wiki cron + auto-ingest + KB-query bridge — Karpathy's continuous-compile promise wired end to end
type: project
originSessionId: b949ea5a-fac4-41e1-9876-2bd78c4ce5c5
---

2026-05-10 三个 PR 把 LLM Wiki 从"用户手动 trigger 的孤岛"改成"连续编译 + 透明消费"的形态。

**commits (local, not pushed yet)**:

- PR-3 `b1103a23c` `feat(library/wiki): wire daily lint cron to existing config fields`
- PR-1 `0011bbb4e` `feat(library/wiki): auto-ingest scheduler that compounds on raw refresh`
- PR-2 `9707c0b77` `feat(library/kb-query): wiki-aware KB query facade (transparent bridge)`

**做的事**:

1. PR-3 救活孤儿配置：`WikiKnowledgeBaseConfig.cronLintEnabled` + `cronLintDailyBudgetCalls` 自 v1.5.3 P1 起 schema 有字段无消费方。新 `WikiLintScheduler` 03:00 UTC daily 跑全量 lint，跳 23h 内已跑过的 KB；`WikiLintService.runFullLintAsCron(kbId)` 旁路用户 auth。

2. PR-1 自动 ingest：pull-based scheduler 每 5min tick，cursor=MAX(WikiDiff.createdAt) 任意来源，候选=updatedAt>cursor 且非 placeholder/non-ERROR。每 KB 5min debounce + 20/day budget + per-KB failure 隔离。`WikiIngestService.ingestAsCron(kbId, docIds)` 用 `__system_auto_ingest__` 哨兵 userId（非 FK），diff 仍出 PENDING 待用户 accept（governance preserved，不自动 apply）。

3. PR-2 KB-query 桥：新建 `library/kb-query/KbQueryService` 在 L3 层组合 `WikiSourceProvider` (BM25 in-memory, k1=1.5/b=0.75, oneLiner 3x boost, mixed CJK/ASCII tokenizer) + `RAGPipelineService`。confident wiki hit (top≥0.5 AND cum≥1.5) → wiki short-circuit；否则 fallback 至 chunk RAG。ai-ask 一行构造器换 `RAGPipelineService` → `KbQueryService`，198 specs 全绿。

**架构关键决策**: 桥层必须在 L3 (`ai-app/library/kb-query`) 而非 L2 (`ai-engine`)——因为 `ai-engine cannot import ai-app modules` 是 ESLint `no-restricted-imports` 红线，wiki 在 ai-app。

**Why:** Karpathy LLM Wiki 三大缺口 (auto-ingest / lint cron / query→wiki) 不补则 wiki 是个昂贵但消费方为 0 的孤岛。

**How to apply:**

- 用户问"wiki 自动跟刷新么 / lint 自动跑么 / AI-ask 能用 wiki 么"——答 yes，全在 d94e52e05..9707c0b77 之间
- 后续若 topic-insights / teams 要从 wiki 受益，迁 RAGFacade.query 调用方至 KbQueryService（同 RAGQuery/RAGResponse shape，drop-in）
- WikiPageEmbedding 写入路径仍是 P3（向量 RAG 替代 BM25 是后续 follow-up，当前 KB ≤ 200 页 BM25 cost 可忽略）

**孤儿字段还剩**: 无（cronLint* 已接电；autoIngest* 也已接电）。

**未推送**：用户明确"先提交不推送"。push 由用户决定。
