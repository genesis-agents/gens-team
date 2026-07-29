---
name: Playground 报告呈现彻底学 TI（v1.7）2026-05-07
description: agent-playground 报告 4 大问题（对账渲染/导出/章节编号/快速视图）+ 图文匹配雏形彻底解决，全 7 commit pushed 到 origin/main
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# 2026-05-07 Playground 报告呈现彻底学 TI（v1.7）

7 commit 全推：`df5777648` revert v1.6 → `9687771c9` 图文+快速视图重构。

## 4 个用户提的问题 + 1 个新加（编号）— 彻底解决

### 1. 对账总览渲染（Screenshot_11.png 真因）

- `ReconciliationPanel.tsx:103-105` 之前 `<pre whitespace-pre-wrap>` 直吐 markdown 源码
- 改 `ReactMarkdown + remarkGfm + rehypeSanitize` + 清洗 `[N]` 噪声
- commit `6452b17a2`

### 2. 导出彻底走 WYSIWYG（学 TI ExportDialog 完整链路）

**TI 链路（全在 backend/src/common/export/services/ + frontend/lib/utils/html-capture.service.ts）：**

1. 前端 `ExportDialog` 主按钮 → `HtmlCaptureService.capture(selector, {inlineStyles, freezeCharts, freezeMermaid})` 抓 DOM HTML+CSS
2. POST `/api/export` 带 `options.renderMode='wysiwyg' + wysiwygHtml + wysiwygCss`
3. 后端 `ExportOrchestrator.processExportJob:293` 看到 `renderMode==='wysiwyg' && wysiwygHtml` → 调 `WysiwygRenderService.renderByFormat`
4. `WysiwygRenderService` puppeteer `page.setContent(html)` → `page.pdf()` 输出真所见即所得 PDF

**playground 接入：**

- ContinuousReader 加 `data-export-content="playground-report"` 选择器
- ArtifactReader.ExportMenu 重构：删 PDF/DOCX/PPTX/HTML 旧异步路径，主按钮"导出报告"弹 `ExportDialog`（限 PDF/HTML），次按钮保留"原始数据"（Markdown/CSV/JSON）
- `ExportDialog` moduleType 加 `'playground'`，buildSource 走 `type='MISSION', missionId, topicId:''`
- commit `6452b17a2`

### 3. 章节标题彻底消失 + 自动层级编号（用户报"维度/章节/段落编号都有问题"）

**真因（重大发现）**：`per-dim-pipeline.util.ts:1227` 把 chapter 用 `## (H2)` 写入，但 reportAssembler 的 `formatDimensionContent → sanitizeHeadingLevels` 明确 `.replace(/^#{1,2}\s+.*$/gm, "")` strip 所有 H1/H2（注释："# / ## are reserved for the report framework"）。结果：每章节标题直接被删，正文坨在一起。

**修法（学 TI hierarchical numbering）**：

- per-dim-pipeline `## ${ch.index}. ${ch.heading}` → `### ${ch.heading}`：让 `formatDimensionContent.numberSubHeadings` 自动注入 `### N.M. {chapter}` 层级编号
- 前端 `ArtifactMarkdown.h2` override：维度 H2 自动加 `1. ` / `2. ` 前缀（closure counter），supplementary 标题（执行摘要/前言/目录/跨维度分析/风险评估/战略建议/结论/参考文献 + 英文同款）跳过编号
- 后端 markdown 不加 H2 N. 前缀（保 `buildSectionTree.fuzzyMatchDimension` 兼容）
- commit `7d4be9f34`

### 4. 图文匹配（chapter-writer 接 figureCandidates）

**TI 6-stage figure pipeline 精读后**（参考 `topic-insights/docs/figure-pipeline-plan.md`）：

1. `FigureExtractorService.extractFigures` URL 黑名单 + magic bytes 验证
2. `FigureRelevanceService.filterRelevantFigures` v17 Embedding 方案（`cosine(embed(caption), embed(topicTitle)) >= 0.35`）
3. `evidence-summary.utils.buildFiguresSummary` 排序 + 截 40 张 + figureId 编号 (FIG-N)
4. `LeaderPlanningService.planDimensionOutline` LLM 给每 section 分配 0-2 张图
5. `SectionWriterService.writeSection` LLM 写章节时按分配 inline 引用 + `backfillFigureUrls` 回填 imageUrl
6. `ReportSynthesisService.collectAllCharts` 跨维度去重 + 上限 8 张/dim + 孤儿恢复

**playground 与 TI 的差距**：

- chapter-writer **完全没接 figureCandidates** — LLM 写章节时不知道有图
- chapter-writer Output 只有 body/heading/wordCount/citationsUsed，**没有 figureReferences 字段**

**本轮修法（最低限度但可用）**：

- chapter-writer Input 加 `availableFigures` 字段（FIG-N + caption + sourceUrl + relevanceHint）
- chapter-writer prompt 加"可用图片"section：让 LLM **用文字描述**对应数据/趋势（"如统计图所示..." / "增速曲线呈倒 V 型 [3]"），与 reportAssembler 末尾追加的图形成语义呼应
- per-dim-pipeline.PerDimPipelineArgs.researcherOut 加 figureCandidates 类型
- per-dim-pipeline 调 ChapterWriterAgent 时传 availableFigures
- **不让 LLM 直接 inline `![](#FIG-N)`** — LLM 编号空间与 reportAssembler 的 `fig-{sec.id}-{i}` 命名不一致，强行 inline 反而渲染破图
- 实际图片渲染由 `reportAssembler.injectFigurePlaceholders` 在每章节末尾兜底追加（保留兼容路径）
- commit `9687771c9`

**P1 已完成（commit `331b9eebf`，2026-05-07）**：

- chapter-writer Output schema 加 `figureReferences: { figureId: string; anchorParagraph?: number; caption?: string }[]`（学 TI section LLM 输出结构化 figureReferences，不嵌入 markdown）
- chapter-writer prompt 加结构化引用指南 + 严禁 inline `![](#FIG-N)` 的破图占位符
- per-dim-pipeline `WrittenChapter` / rawDraft 类型扩展 figureReferences；runChapterPipeline 透传
- reportAssembler.buildFigures 双路径改造：
  - **优先**：扫描 `r.chapters[].figureReferences` → figureId（FIG-N）解析 candidates[N-1] → 关联 chapter dim section + paragraphIndex（anchorParagraph - 1）+ referencedBy 头条加 chapter heading
  - **兜底**：未被 chapter ref 选中的 candidates 按 dim 追加章节末尾（兼容旧路径 / LLM 漏选）
- AssembleInput.researcherResults[].chapters[] 类型加 figureReferences
- 2 条新 spec：精确路径（paragraphIndex/caption/referencedBy）+ LLM 幻觉守卫（FIG-99/INVALID 静默丢弃）
- 50/50 测试全绿

### 5. 快速视图重构（参考 TI QuickViewReport）

- 执行摘要 ReactMarkdown + remarkGfm 渲染（旧版 `whitespace-pre-line` 不渲染 markdown）
- 全局 topHighlights 按 `sourceDimensionId` 分组 → "维度核心发现"卡片（每维度 Top 3 finding/trend）
- 风险机遇红绿对比卡（keyRisks 红 + topHighlights type=opportunity 绿）— TI 同款"风险与机遇速览"
- 战略建议保留扁平 topRecommendations（playground quickView 没有 forEnterprise/forInvestors 受众细分字段，不强加结构）
- `cleanText` 工具去 [N] / 字数计数 / 加粗符号 等噪声
- commit `9687771c9`

## 关键架构文件索引（TI 标杆）

- `frontend/components/common/ExportDialog.tsx` — TI 同款 WYSIWYG 导出 UI
- `frontend/lib/utils/html-capture.service.ts` — DOM HTML+CSS 抓取
- `backend/src/common/export/services/wysiwyg-render.service.ts` — puppeteer page.pdf 渲染
- `backend/src/common/export/services/export-orchestrator.service.ts:293` — wysiwyg/editable 模式分发
- `backend/src/modules/ai-engine/content/report-template/pipeline/dimension-content-formatting.utils.ts` — formatDimensionContent（含 numberSubHeadings/sanitizeHeadingLevels）
- `backend/src/modules/ai-engine/content/report-template/pipeline/report-formatting.utils.ts:43` — numberSubHeadings 实现
- `backend/src/modules/ai-app/topic-insights/services/dimension/section-writer.service.ts:1516` — backfillFigureUrls 模式（playground P1 学）
- `backend/src/modules/ai-app/topic-insights/docs/figure-pipeline-plan.md` — TI 完整 figure 6-stage 流水线说明

## 元教训

- **遇到"为什么 X 不工作"先 grep 整链路**：本轮"章节标题消失"用了 30 分钟才意识到是 sanitizeHeadingLevels 删了 H2，原因是没在第一时间从 chapter-writer 输出一直追到 reportAssembler 拼接
- **学 TI 不是抄方法名，是理解整条链路**：figure pipeline TI 6 stage 都得理解才知道 playground 哪几个 stage 缺位
- **WYSIWYG 不是切技术栈，是前后端配合**：前端不抓 HTML+CSS，后端再厉害的 puppeteer 也只能渲染模板（playground 之前 ExportMenu 不传 wysiwygHtml 是真因）
