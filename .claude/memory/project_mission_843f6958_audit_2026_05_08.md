---
name: mission-843f6958-deep-audit-2026-05-08
description: 2026-05-08 mission 843f6958 深度审视 — 5 根因 / 9 PR / 5 轮 4 路评审 / 4/4 共识
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

## 2026-05-08 mission 843f6958 深度审视 + 5 轮共识

**commits**：`40edcb9d6`（PR-1~8 push 但未达共识，违反 feedback 红线）+ `5a21ea3c0`（PR-9 补足 4/4 共识）

**用户痛点**：截图反馈 mission 843f6958 "很多图片占位 + 深度审视所有问题"

## 5 条根因（DB 真数据深度扫描）

1. **图占位机制断裂**：figures 数组 12 张图 + imageUrl 完整，但 fullMarkdown **0 个 #fig 占位**（v1.6 切主线后 structural.content 覆盖 legacy.fullMarkdown，injectFigurePlaceholders 输出被丢弃）
2. **chapter-writer prompt 4 处歧义**：sourceUrl 暴露 / "两件事一起做"双轨 / 缺反例 / JSON envelope 软约束 → LLM 写出 4 类垃圾（`![FIG-N](url)` / `<figureReferences>` / `<figure>` / prompt-as-url）
3. **77 空 H3 章节**：chapter body 第一行直接 H3 子小节（无引言段）→ 章节标题紧接子小节 heading，视觉层级混乱
4. **双 sanitizer 双源**：legacy `removeHallucinatedImages` + 主路径 `sanitizeMarkdownBody` 互不知，主路径 0 figure 规则
5. **defect-scanner 半闭环**：跑了但只 emit toast，formatCorrectness 硬编码 80，quality 给低分但说不出原因

## 9 个 PR（commit 40edcb9d6 + 5a21ea3c0）

- **PR-1**：injectFigurePlaceholdersPublic 暴露 + s8 figureReferences 透传 + structural 后注入
- **PR-2**：chapter-writer prompt 单契约 + 4 反例 + 删 sourceUrl
- **PR-3**：chapter-writer body 第一行约束 + dimension-integrator 加 c.body
- **PR-4**：legacy removeHallucinatedImages 加 4 条规则
- **PR-5**：buildQualityStub formatCorrectness 派生分 + hardGateViolation
- **PR-6**：主路径 sanitizeMarkdownBody 加 3 条 figure 规则（修 R2 第 4 路装错管线）
- **PR-7**：rebuildSectionTreePublic + s8 二次 inject 后 rebuild（修 R2 offset 漂移）
- **PR-8**：spec 8 条新断言（sanitizer 5 + assembler 3）
- **PR-9**：referencedBy 重映射 + chapter intro fix-up + 2 spec（修 R4 阻塞）

## 5 轮 4 路评审历程

| 轮  | architect       | reviewer                    | coder        | 第 4 路                                    | 共识           |
| --- | --------------- | --------------------------- | ------------ | ------------------------------------------ | -------------- |
| R1  | NO-WITH-CAVEATS | NO-WITH-CAVEATS             | (单边 trace) | NO-WITH-CAVEATS                            | 4/4 NO         |
| R2  | YES             | NO（PR-3 软约束）           | YES          | NO（PR-4 装错管线 + PR-1 offset）          | 2/2            |
| R3  | (跳过)          | (跳过)                      | (跳过)       | NO（referencedBy 悬挂 + 缺 spec）          | 单路 NO        |
| R4  | YES             | NO（同 R2）                 | YES          | NO（referencedBy + ID 分裂 + missing-dim） | 2/2            |
| R5  | (R4 不变)       | YES（PR-9-B 程序性 fix-up） | (R4 不变)    | YES（PR-9-A 真修 + spec）                  | **4/4 YES** ✅ |

## 元教训（必沉淀）

1. **未达共识就 push 是红线违反**（feedback_consensus_must_iterate_to_all_yes）：commit 40edcb9d6 是反例，用户问"集体共识了吗"才发现没走完整 4 路
2. **第 4 路独立评审最尖锐**：3 次都点出 architect/reviewer/coder 看不到的根因（装错管线 / referencedBy 悬挂 / ID 格式分裂）
3. **prompt 软约束 ≠ 拦截层**：reflexion maxIterations=1 实际不 self-critique，必须程序性 fix-up（per-dim-pipeline 的 ensureChapterIntro 是范本）
4. **双源治理**：4 条 figure regex 在 PR-4（legacy）+ PR-6（主路径）字面重复，违反 feedback_no_dual_sources。follow-up 抽 stripFigureNoise 公共函数
5. **DB 真数据驱动深度扫描**：sim-deep-audit.js 5 维度扫（figures / hierarchy / content / citations / quality）发现的 5 根因，比凭代码推理多得多

## Follow-up（不阻塞）

1. 抽 stripFigureNoise 公共函数（治本双源）
2. per-dim-pipeline.util.spec.ts 加 ensureChapterIntro spec（reviewer R5 建议）
3. missing-dim + figure inject 共存 spec（第 4 路 R4 提）
4. ArtifactFigure.referencedBy[].sectionId 悬挂在 v1.6 既有 — PR-9-A 已修，但需 audit 历史 mission 数据是否需要 backfill
5. 35 unused citations 派生分（R2 第 4 路独立洞察）
