---
name: LLM Wiki P3a/P3b 占位全部补完 2026-05-09
description: Wiki 模块所有"P3a 后续上线"占位按钮在 2026-05-09 全部补完真实现（commit c9cd11f8f）；前置 commit 链 + 各占位的最终落点 + Library Wiki tab 现在功能完整
type: project
originSessionId: d7fa9dec-c281-49d4-9fe6-5c8f85de1f5d
---

LLM Wiki 模块前端"P3a 后续上线"占位 6 件套全补完，git pull 之后用户发现 wiki 子界面五个按钮都弹 alert，连续两个 commit 全部补真实现。

**Why**: 用户抱怨"为什么都不支持？？？" + "也不要来回反复了" → 不能再打补丁，必须把所有占位一次性变真功能。

**How to apply**: 后续若再讨论 Wiki 功能，记住下面 6 件占位都已是真实现而不是 alert，不要再以"占位"心智去回答用户问题。

**完整实现链（commit by commit）**:

| 占位 (旧 alert) | 现状                                                                                                                                                                      | 落地 commit      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Query 浮动面板  | `WikiQueryPanel` 右侧 420px drawer，调 `wikiApi.query`                                                                                                                    | 26dd40339        |
| 手动建页        | `CreateWikiPageModal` (slug kebab-case 校验 + 5 字段表单)                                                                                                                 | 26dd40339        |
| Settings        | `WikiSettingsModal` (5 字段：inlinePageCount/inlineTokenBudget/ingestMaxTokens/cronLintEnabled/cronLintDailyBudgetCalls) + 后端 GET/PATCH `:kbId/config`                  | 26dd40339 + 后端 |
| Export          | 前端 `exportWikiAsMarkdown` (listPages + getPage 拼合 → Blob 下载)；后端 POST `:kbId/export` 维持 501 stub 注释说明走前端拼合                                             | 26dd40339        |
| Log 抽屉        | `WikiLogDrawer` 真列表（`wikiApi.listOperations` → time-reverse cards：op badge 配色 + actor + 相对时间 + affected slugs；INGEST=violet/LINT=amber/EDIT=sky/REVERT=rose） | **c9cd11f8f**    |
| 启用其他 KB     | KB 选择器 dropdown 底部加"启用其他知识库的 Wiki"按钮，复用 `WikiEnableToggleModal`                                                                                        | **c9cd11f8f**    |

**配套后端**:

- `WikiKbAdminService.listOperations(userId, kbId, limit)`：VIEWER+ 访问 + wikiEnabled gate + limit clamp [1, 200] + 联表 affected slugs + actor username（注意 User schema 里是 `username` 不是 `name`）
- 路由 `GET /library/wiki/:kbId/operations` 在 `WikiKbAdminController` 里
- `KnowledgeBaseService.hasAccess` 平台 admin bypass + wikiEnable 放宽到 VIEWER+（前置 commit ce9baf9a6）
- `wiki-ingest.service.ts` 改用 `TaskProfile { creativity: deterministic, outputLength: long }` + `AIModelType.CHAT`，不再硬编码 temperature/maxTokens
- LLM-bound endpoints 客户端 timeout 提到 ingest 180s / query 120s / runLint 120s（前置 4085b8a6c）

**已知后续未做项（对外暂无 UI 入口或明确说明）**:

- 服务端 tarball export：POST `:kbId/export` → 501 NotImplemented，前端走客户端 markdown 拼合即可
- Diff 三色 split-view：当前是文本 side-by-side preview
- WikiPageEmbedding-driven Branch B query：后端已有 fallback warning，UI 不需特别处理

**踩坑教训**: prisma upsert 必须 split `Prisma.WikiKnowledgeBaseConfigUpdateInput` 与 `Prisma.WikiKnowledgeBaseConfigUncheckedCreateInput` 两个分支，否则 TS 不接受混合 shape (commit 9f7571e3d)；User select 是 `username` 不是 `name`。
