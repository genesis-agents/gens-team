---
name: Wiki Augmentor DI Port — playground 等 ai-engine 工具消费 wiki
description: PR-Wiki-Aug 2026-05-10 commit 923f042bf：rag-search 通过 KB_QUERY_AUGMENTOR 端口透明消费 wiki，覆盖所有 ai-engine 工具消费方（playground / topic-insights / writing / research）；同批 fix 373a7f48d 修 budget:soft-warning event 命名漂移
type: project
originSessionId: b949ea5a-fac4-41e1-9876-2bd78c4ce5c5
---

PR-Wiki-Aug：把 wiki 消费面从 ai-ask 单点扩到所有 ai-engine 工具消费方。

**Why**：用户问"现在 LLM Wiki 能够被 playground 消费吗" → 不能。playground / topic-insights / writing 等 L3 应用通过 ai-engine 的 `rag-search` tool 取知识库，而 rag-search 直接 `RAGPipelineService.simpleQuery`，绕过了 ai-ask 在 PR-2 引入的 wiki-aware `KbQueryService`。哪怕 KB 开了 wikiEnabled=true，下游工具仍是 chunk-RAG only。

**How to apply**：再讨论"哪些 app 能消费 wiki"时，记下面是当前 (2026-05-10) 真值。

**架构**（Dependency Inversion port，与 `engine-skill-provider.adapter.ts` 同模式）：

```
ai-engine/rag/abstractions/kb-query-augmentor.interface.ts
  ├── IKbQueryAugmentor.simpleQuery(query, kbIds, topK?) → SearchResult[]
  └── KB_QUERY_AUGMENTOR = Symbol(...)             # NestJS DI token

ai-app/library/kb-query/                           # 实现端
  ├── KbQueryService.simpleQuery(...)              # wiki-first → chunk RAG fallback
  └── KbQueryModule (@Global() useExisting: KbQueryService)

ai-engine/tools/.../rag-search.tool.ts             # 消费端
  └── @Optional() @Inject(KB_QUERY_AUGMENTOR) kbAugmentor?: IKbQueryAugmentor
      doExecute → (kbAugmentor ?? ragPipeline).simpleQuery(...)
```

**关键约束**：

- 端口在 ai-engine，实现在 ai-app — 严格保持 L3 → L2 单向
- `@Global()` 让 KbQueryModule 在任何地方加载一次后，rag-search 自动获得 wiki 能力，**不需要** AiEngineModule 反向 import KbQueryModule
- ai-engine 文件**不能**写业务名（`playground` 等）— layer-boundaries.spec.ts §R0-A5 拦截。本 PR 注释里 PR 标签从 `PR-Wiki-Playground` 改为 `PR-Wiki-Aug`

**消费方现状**：
| 消费方 | wiki 入口 | 状态 |
| --- | --- | --- |
| ai-ask | KbQueryService.query() (PR-2) | ✓ 已上线 |
| agent-playground / topic-insights / writing / research | rag-search tool → KbQueryService.simpleQuery (PR-Wiki-Aug) | ✓ 透明，零代码修改 |
| 任意未来 L3 app 想要 wiki | 注 KbQueryService 直接用 query()，或经 rag-search 自动享受 | ✓ |

**Spec 覆盖**（commit `923f042bf`）：

- `kb-query.service.spec.ts`：5 新 cases on `simpleQuery`（routing matrix mirrors `query`）
- `rag-search.tool.spec.ts`：3 新 cases（augmentor preference / undefined fallback / error path）
- 全部 33/33 绿 + layer-boundaries 22/22 绿

**同批关联 fix（commit `373a7f48d`）**：
push 时 `playground-event-contract.spec.ts` 拦截到 0361b03ed (budget caps PR) 的命名漂移 — backend 注册 `budget:warning-soft` 但 emit + 前端听 `budget:soft-warning`，DomainEventBus 静默 drop。两行 typo 修。

**没做的**：

- query() 路径（带 LLM 合成）的 augmentor 端口 — 当前只暴露 simpleQuery 给工具用；工具消费者只要 SearchResult[] 不要 RAGResponse
- 增量重写 rag-search tag/description 把 wiki 概念暴露给 LLM — wiki/chunk 区分留给消费侧 metadata.source 自决
