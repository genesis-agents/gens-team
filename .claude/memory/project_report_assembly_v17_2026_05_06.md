---
name: report assembly v1.7 共识收尾
description: 2026-05-06 playground 报告装配重构 v1.7 4 轮共识收尾 + 主线 commit hash + 隐藏坑
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

playground 报告装配重构（PR-A0~A5 + v1.5 + v1.6 切主线 + v1.7 三轮收尾）于 2026-05-06 推主线完成（origin/main = `f9a187452`）。

**关键 commit**：

- `c238b80f8` v1.7 三轮共识收尾（fence lang-aware + F19/F20/F21 + sectionCountMismatch 反向 spec 改写 + recomputeCitationOccurrencesPublic 直接单测 + 业务名清）
- `f9a187452` v1.7 4 轮共识 security 真 bug 修（stateDiagram → statediagram） + docs 回填 §13 v1.4-impl 行

**Why**：mission `eafceb32` 49,244 字塞一段（buildSectionTree 反向解析在 mermaid 孤儿 fence 后吞掉 `## 维度二`-`## 维度十二`）— 改用 backend 控结构 + LLM 只填 body，sections 一次性产出（StructuralReportAssembler）。

**How to apply**：

- 改 markdown sanitizer / report assembly 时**必先**读 docs/architecture/ai-harness/evaluation/report-assembly-invariant-redesign.md（v1.4 设计层 + §13 v1.4-impl 实现增量）
- 4 轮专家共识门槛：4 路 GO + docs 同步（arch / tester / reviewer / security 各自评分） — 用户指令是"所有专家认为可发布否则持续迭代"
- structural 是主路径，legacy 仅 catch fallback；不要再加 env flag（"切入主线，不能做样子"是用户原话）
- 安全审 4 轮真发现 ORPHAN_FENCE_LANGS 中混合大小写 lang `stateDiagram` 经 `.toLowerCase()` 后 Set 永不命中（false-negative）— 此类 lang allowlist 必须**全小写**；v1.7 已由 F22 fixture 锁死

**隐藏坑**：

1. ES named export `expectedSectionCount` 不能用 `jest.spyOn`（不同 transpile target / strict mode 下不稳定），改用真分歧（如 `<thinking>` 净空触发 expected/actual 差 1）
2. fence H2 close 必须 lang-aware；纯字面"fence 内 ## 就关"会让 python/bash 教 markdown 语法的代码块误关
3. structural 替换 fullMarkdown 后，legacy `recomputeCitationOccurrencesPublic` / `recomputeSectionFigureIdsPublic` 必须改 public 调用，否则 sections[].citations = [] → quality.citationDensity = 0
4. ai-engine 是 base layer，doc string 不能提 `playground` / `topic-insights` 等业务唯一名（layer-boundaries.spec 21 项之一 `Base-layer business leakage` 会拦）
5. 字面常量 H2 阈值（如 `expectedSectionCount`）+ 优先 sanitize 的 trim 检查，sanitizer 后 body 净空时 expected/actual 会差 1 — 是合法 mismatch 信号源（已写入 metadata.sectionCountMismatch）

**验证**：131/131 spec 跨 5 文件（markdown-sanitizer 32 / structural 22 / legacy assembler 42 / s8 stage 14 / arch boundary 21）+ tsc --noEmit 0 error
