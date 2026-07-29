---
name: feedback-kb-is-import-sink
description: 'KB（library/rag）是 import sink，所有"添加文档"的入口都在 KB 一侧。给 KB 加新源（含内部 ai-app 模块如 playground / topic-insights 生成的报告）一律走 library/rag/services/X-import.service + KB 详情页面板，**不要**在 source 模块详情页加"导入到 KB"按钮（那是 source push 反向，破坏既有导入心智）'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

要给 KB 增加一个新的"数据源"（无论是外部 SaaS 如 Google Drive / Notion / 飞书，还是**内部 ai-app 模块生成的产物**如 Playground mission / Topic Insight report），必须遵守：

**正向（user mental model）**：

1. 在 `ai-app/library/rag/services/` 新建 `X-import.service.ts`，通过 PrismaService 直接读 source 表
2. 在 `RAGModule` 注册，`rag.controller.ts` 加 `POST /rag/knowledge-bases/:kbId/import-X` 和 `GET /rag/importable-Xs` 等 KB-scoped endpoint
3. 前端在 `components/library/import-panels/` 加 panel 组件（与现有 UrlImportPanel / NotionImportPanel / FeishuDataSourcePanel 同模式）
4. 在 `frontend/app/library/rag/page.tsx` KB 详情页挂载该 panel

**反向（错误模式）**：

- ❌ 在 source 模块详情页（如 mission 详情 / topic insight 详情）加"导入到 KB"按钮，让 source 反向 push KB
- ❌ 在 source 模块 service 加 `exportToKb` 方法 import `KnowledgeBaseService`
- ❌ source module 反向 import library/rag module

**Why**：2026-05-19 KB 接 Playground/Topic Insight 报告导入功能，我连续踩 2 次反向坑：

1. R1: 想在 mission detail 页加"导入到 KB"按钮 → 用户纠正"不用反向导入"
2. R2: 改用 source-push 但仍是 source 模块 service 调 library service → 用户再纠正"我是希望 KB 的导入能支持..."
3. R3: 才理解真正诉求 = KB 侧加面板，浏览所有可导入的源（含内部 ai-app 产物），与 Google Drive / Notion / 书签 / 笔记完全一致

正确的方向是 KB 详情页的"添加文档"区列出所有源选项，用户在 KB 侧统一管理。Source 模块（playground / topic-insights）**零变更**——它们只是数据，不知道也不关心 KB。

**How to apply（触发条件 + 自检清单）**：

1. 用户说"能不能在 KB / 知识库里导入 X"——立刻去 `library/rag/services/` 加 import service，**不要** 去 source 模块加按钮
2. PR 必备文件清单：
   - ✅ `library/rag/services/X-import.service.ts`（含 listImportableXs + importX 两个 method）
   - ✅ `library/rag/rag.module.ts` 注册
   - ✅ `library/rag/rag.controller.ts` 加 GET list + POST import
   - ✅ `components/library/import-panels/XImportPanel.tsx`
   - ✅ `app/library/rag/page.tsx` 挂载
   - ❌ **绝对不能有** source 模块的修改
3. 命名：source 模块产物 = `xxx-report-import` / `xxx-import`，与外部 SaaS 导入命名同模式（feishu-import / google-drive-rag / platform-import）
4. enum 加值：`KnowledgeBaseSourceType` 加新值 + 手写迁移 SQL（`ALTER TYPE ... ADD VALUE IF NOT EXISTS`，无 DO $$ 包裹）

**相关 commit**：

- abc5b4193 feat(library/kb): import playground / topic insight reports as KB documents（service 层 + 第一版 endpoint）
- 06cb22ff6 feat(library/kb): kb detail page imports playground / topic insight reports（list endpoint + 前端 panel）
- 48a7e70a2 fix(library/kb): wire playground / topic insight imports into AddDocumentsDialog（前端真正用户入口）

**前端入口在哪**：用户在 `/library` 页面看 KB 卡片，点「Add Content」打开的 **`AddDocumentsDialog`** modal 是真入口。挂载在 `/library/rag` 详情页是次级入口（备份用）。我第一次加在 `/library/rag` 不在 modal 里 → 用户截图反馈「这个界面什么都没有啊」。新源必须**同时**加到：

1. `frontend/components/library/resources/AddDocumentsDialog.tsx`（主入口，PLATFORM_SOURCES / EXTERNAL_SOURCES / OTHER_METHODS 三段卡片之一）
2. （可选）`frontend/app/library/rag/page.tsx` KB 详情页备份入口

链接：[[feedback-dont-lock-users-choice-with-provider]]
