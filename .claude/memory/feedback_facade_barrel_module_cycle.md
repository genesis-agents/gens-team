---
name: feedback-facade-barrel-module-cycle
description: ai-engine/facade 重新导出 Service 时必须直接路径，跳过含 @Module 的 barrel——否则 ai-app 用 facade 触发 ContentFetchModule decorator 链式加载 → ContentProcessingModule undefined 崩溃
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

`ai-engine/facade/index.ts` re-export Service 时**必须直接指向具体 .service.ts**，不能用 `./content/fetch`、`./content/long-form`、`./content/image` 这种 barrel index — 因为 barrel 第一行往往 `export { XxxModule } from "./xxx.module"`，触发 Module decorator evaluation，连锁加载它的 `imports: [..., ContentProcessingModule]`，CJS 循环下 `ContentProcessingModule` 还在 mid-eval → `imports[0]` = `undefined` → Nest scanner 直接抛 "Nest cannot create the ContentFetchModule instance".

**Why**：2026-05-12 prod 事故。W1 加 PreparseModule + 在 facade 加 `export { ContentFetchService } from "@/modules/ai-engine/content/fetch"`（含 barrel）→ W6 部署后 prod NestJS bootstrap 立挂。Scope: AppModule → AdminModule → AiEngineModule → ContentFetchModule.imports[0] undefined.

**How to apply**：

1. facade 加新 Service re-export 时，用具体路径：
   - ❌ `export { ContentFetchService } from "@/modules/ai-engine/content/fetch"` （barrel）
   - ✅ `export { ContentFetchService } from "@/modules/ai-engine/content/fetch/content-fetch.service"`
2. Types 同理：`export type { FetchedContent } from "@/modules/ai-engine/content/fetch/content-fetch.types"`，不要 `from "..."content/fetch"` 走 barrel
3. ai-app 侧仍走 facade（ESLint `no-restricted-imports` 规则不变，facade is the ONLY 允许越界的 module）
4. 新加 ai-app 子模块的 NestModule 时，**imports 优先用最小依赖**（如 `ContentFetchModule` 而非 `AiEngineModule` god-module），降低 evaluation 顺序敏感性

**触发条件检查清单**：

- 新加 facade 行：是否走 barrel？grep `export.*from.*"@/modules/ai-engine/[^/]*"$` 找疑似行
- 新加模块 imports：是否一句话 `imports: [AiEngineModule]`？AiEngineModule 内涵 30+ 模块，evaluation 序列敏感

**相关 fix**：facade commit 40abd0dca（2026-05-12）

链接：[[feedback-prettier-after-write]] [[project-wiki-v2-rebuild-2026-05-12]]
