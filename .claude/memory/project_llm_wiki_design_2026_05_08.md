---
name: project_llm_wiki_design_2026_05_08
description: 2026-05-08~09 LLM Wiki (Karpathy 模式) 设计 6 轮 4 路集体评审 + v1.4 4/4 共识达成（终态在 commit 1c6a6be48）；含"架构归属 3 维度"元教训
type: project
originSessionId: 54c18056-7ea3-468e-afdd-91622f116738
---

## 终态版本（2026-05-09 更新）

设计文档 v1.4 + R5+R6 评审纪要 commit `1c6a6be48` 已 push。**4/4 APPROVED-FOR-IMPLEMENTATION**。

v1.2.1 → v1.3（v1.3 commit `7e4685a98` 上提 4 项到 engine）→ v1.4 （commit `701b3a866` + `1c6a6be48`）：v1.3 上提"上提过头"被 R5 architect 抓出 2 BLOCKER：

- MultiResolutionSearchService 过度抽象（单消费方 + EmbeddingService+VectorService 两步可表达）→ 砍
- consistency/ 与 cross-cutting-synthesis 概念双源 → CONTRADICTION/DATA_GAP 折叠为 CrossCuttingSynthesisService 加 2 公共低级 API；consistency/ 只留 StaleDetectorService

**最值钱的额外元教训（v1.3→v1.4 双倍打脸）**：

8. **架构归属审查必须 3 维度问**：① 是否穿透 facade（依赖方向）② 是否过度集中 app（漏上提）③ 是否过度抽象/与既有重叠（错上提）。v1.0~v1.2 architect 只问 ①漏 ②；v1.3 弥补 ② 又错在 ③。下次设计任务的 architect prompt 必须明文列三项。
9. **"上提"前必须 grep 既有能力库**：CrossCuttingSynthesisService 已 export Contradiction/ResearchGap 给 topic-insights，新建 ConsistencyChecker 等于双源。**Read 既有 service 类型 export > 新建 service**。
10. **"3 处使用再考虑抽象"红线**：MultiResolutionSearchService 单消费方就上提=过度抽象。即使叫"通用"，无 ≥3 处复用就违反。
11. **上提同时必须清旧双源**：slug-normalize 上提到 engine 但留 5 处既有 ad-hoc = 增加第 6 处双源，**上提 PR 必须包含"替换全项目所有 ad-hoc 实现"为强制验收项**。
12. **跨轮 APPROVED 才算共识**：architect R2/R3 APPROVED 不代表 R5 也 APPROVED。能力归属维度只在 v1.3 引入"上提到 engine"动作时才触发。**最后一轮才能定调**。
13. **小修走 v1.x.1，大修走 v1.x，但都能省评审**：v1.4 是大修（砍 service / 改 facade），但只动 architect 关心的归属维度，R6 仅复评 architect 一路（reviewer/security/tester R5 已 APPROVED 不重复审），节省 75% 成本。**评审范围匹配修改范围**。

## 6 轮迭代各轮发现的真正维度

| 轮  | 触发维度              | 真问题                                                                                                                                     |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | 实状对齐              | 7 处虚构 entity（fact-extraction.service / EmbeddingChunk / KnowledgeBaseGuard / Note 挂 KB / WikiSkillTokens / WikiDiff 漏建 / pgvector） |
| R2  | 数据完整性 + 安全     | 5 处缺 FK + revert IDOR + affectedSlugs 信任                                                                                               |
| R3  | 数字漂移 + 路径完整性 | 7 张/12 个数字漂移 + deletes 数组完全没参与冲突保护                                                                                        |
| R4  | 收尾微修              | doc-drift 修补                                                                                                                             |
| R5  | **架构归属（关键）**  | MultiResolutionSearchService 过度抽象 + consistency↔synthesis 概念双源                                                                     |
| R6  | 复核                  | doc-drift 同步修复                                                                                                                         |

**12 维度 4 路评审在不同轮触发不同发现，单维度审查会漏掉 5/6 轮的真问题**。

## 背景

用户："Karpathy 提出来的 LLM WIKI，我想用在我的知识库上面，请帮我设计系统的方案"

参考 Karpathy 2026-04-04 gist `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`：3 层（raw/wiki/index+log）+ 3 操作（ingest/query/lint）+ markdown SoT + `[[wiki-link]]`。

设计文档归档：`docs/architecture/ai-app/library/wiki/llm-wiki.md`（v1.2.1，APPROVED-FOR-IMPLEMENTATION）

## 用户决策（4 项）

| 决策          | 选定                             |
| ------------- | -------------------------------- |
| Wiki 范围     | 复用 KnowledgeBase（不新建资源） |
| RAG 态度      | 默认不走 RAG（忠于 Karpathy）    |
| Ingest 自主度 | LLM 提议 diff 用户接受           |
| 交付顺序      | P0→P1→P2→P3 按序                 |

## 翻译到 Genesis 的关键非显然适配

1. **raw 是 KnowledgeBaseDocument 不是 Note**：v1.0 把 Note 当 raw 是最关键概念错位（Note 用户笔记，没挂 KB）；KnowledgeBaseDocument 才是 KB 内 raw 单位且自带 5 层 chunking 管道
2. **embedding 走独立 WikiPageEmbedding 表**：不复用 ChildEmbedding（强 FK 到 ChildChunk → KBD），wiki 不要 chunk 要整页 embed
3. **embedding 字段 Json 不 vector**：Railway 不支持 pgvector，与 ChildEmbedding 一致
4. **wiki skill 走 PromptSkillBridge.registerDomain("library")**：不在 facade 新增 token；writing/research/topic-insights 都是这个 pattern
5. **KB 鉴权用 service 层 hasAccess() 不创新 Guard**：本期沿用现有模式，不引 KnowledgeBaseGuard
6. **export 复用 ExportJob**：扩 ExportSourceType.WIKI + ExportFormat.TARBALL，不另起异步导出协议

## 数据模型最终态（10 张新表）

WikiPage / WikiPageSource / WikiPageLink / WikiPageRevision / WikiPageEmbedding / WikiDiff / WikiOperationLog / WikiOperationLogPage / WikiLintFinding / WikiKnowledgeBaseConfig

**关键 schema 决策**：

- WikiPageRevision 是版本史最小化形式（仅 pageId+body+contentHash+opId）— 解决 stale lint + revert，不做 diff 链
- WikiOperationLogPage 用独立 id PK + nullable pageId（Prisma 复合主键不允许 nullable）+ onDelete: SetNull 保留历史
- WikiPageEmbedding.model 默认 `""` 不硬编码 provider 模型名（CLAUDE.md 反硬编码）
- WikiDiff.affectedSlugs 是 String[]，配套 GIN partial index `WHERE status='PENDING'`（手写 SQL）

## apply 事务关键步骤（v1.2.1 完整）

```
A. zod parse WikiDiff.items（防 LLM 输出非法字段）
B. 实时重算 affectedSlugs = creates ∪ updates ∪ deletes（不读 DB 预存）
C. 对其他 PENDING diff 也实时重算其 affectedSlugs（不读 DB）— 集合冲突判定
D. SELECT ... FOR UPDATE 锁全部涉及 page（含 deletes）
E. baselineHash 比对（锁定后再算）
F. 写 WikiPageRevision（apply/edit/revert 三处都写）
G. upsert × creates+updates
G2. delete WikiPage WHERE slug IN deletes
H. delete + insert WikiPageLink
I. upsert WikiPageEmbedding × 2N（事务内必须）
J. WikiOperationLog
K. 回填 revision.opId
L. WikiOperationLogPage × N
M. WikiDiff.status=APPLIED
异常：捕获 Prisma P2034 → 1 次重试 → 仍失败 409
```

## 4 轮 4 路集体评审过程

| 轮次        | architect                             | reviewer                               | security                                     | tester                                        | 修订         |
| ----------- | ------------------------------------- | -------------------------------------- | -------------------------------------------- | --------------------------------------------- | ------------ |
| R1 (v1.0)   | NEEDS-CHANGES (3 BLOCKER 虚构 entity) | NEEDS-CHANGES (3 P0)                   | NEEDS-CHANGES (2 P0)                         | NEEDS-CHANGES (1 BLOCKER P2 precision 不可测) | v1.1         |
| R2 (v1.1)   | APPROVED ✅                           | NEEDS-CHANGES (9 新项 schema 关系缺漏) | NEEDS-CHANGES (2 P1 IDOR/affectedSlugs 信任) | APPROVED ✅                                   | v1.2         |
| R3 (v1.2)   | APPROVED ✅                           | NEEDS-CHANGES (2 doc-drift)            | NEEDS-CHANGES (1 P1 deletes 漏 + 3 P2)       | APPROVED ✅                                   | v1.2.1       |
| R4 (v1.2.1) | -                                     | APPROVED ✅                            | APPROVED ✅                                  | -                                             | **4/4 共识** |

## 元教训（最值钱的 7 条，反复踩了才学到）

1. **设计文档与代码库实状对齐是第一责任** — v1.0 7 处虚构 entity（fact-extraction.service / EmbeddingChunk / KnowledgeBaseGuard / Note 挂 KB / WikiSkillTokens / WikiDiff 漏建 / pgvector）。grep 一次 schema/facade 就能避免。**CLAUDE.md "分析先行禁止猜测" 红线**。

2. **新增 schema 字段必须立即写 Prisma `@relation`** — v1.1 加了 3 处 nullable FK 但都没写关系声明。Prisma 不校验，运行时无 FK，service 层无法 join。reviewer R2 集中爆雷。

3. **数字一致性是低 hanging fruit，每轮都漏** — v1.0/v1.1/v1.2 各有数字漂移（7/10、12/13）。"修了一处漏一处" 三轮都踩。审稿前先 grep `^model `、数表行数、数 endpoint 行数。

4. **新增机制必带新攻击面，安全审查每轮都要重做** — v1.1 引入 baselineHash + affectedSlugs → security 抓 IDOR + 信任；v1.2 引入 deletes 数组 → security 抓 Step B 漏 + Step D 锁不全。**"上次过了就不管"是安全审查反模式**。

5. **4 路评审的真实价值在覆盖维度** — 单 reviewer 找不到 schema 关系缺漏，单 security 找不到表数量漂移，单 architect 找不到 spec 可测性盲区。**多路并行独立、不串通**才能覆盖 12 维度。

6. **跨轮 APPROVED 才算共识** — architect 在 R2 就 APPROVED，但 R3 又找出 5 项小补充。**最终共识必须是 4/4 同时 APPROVED**，错峰 APPROVED 不算。

7. **小修走 v1.x.1 patch level，不另起 v1.3** — R3 reviewer 2 处 doc-drift + security 1 P1+3 P2 体量适合 patch。新版本号 ".1" 节省一轮全文审查；R4 仅复核 reviewer + security 两路（architect/tester R3 已 APPROVED 不复评）。

## 落地路径（4 phase 12 天）

| Phase                  | 范围                                                                     | 周期 |
| ---------------------- | ------------------------------------------------------------------------ | ---- |
| P0 schema + ADR        | 10 张表 + migration（含 GIN partial）+ ADR-XXX-wiki-vs-graph-coexistence | 1 天 |
| P1 ingest + edit + log | 全 service + 13 必测 spec                                                | 4 天 |
| P2 query + lint        | 双分支 + 5 类 lint + cron                                                | 3 天 |
| P3 UI + export         | tree/markdown/diff/lint 面板 + ExportJob 集成                            | 4 天 |

每 Phase 落地后做一次 4 路集体评审到 4/4 共识再进下一 Phase。

## 验收 spec 必测（13 个文件）

跨 KB IDOR / wikiEnabled gate / SELECT FOR UPDATE 串行 / WikiDiffItemsSchema zod parse / affectedSlugs 实时重算 / baselineHash 确定性 / PATCH edit 写 revision / revert 跨页 IDOR / link-parser 10 条边界 / slug-normalize / model 字段非空写入 / cron+手动 lint 并发 / wiki-query Branch B 不加载非 top-K
