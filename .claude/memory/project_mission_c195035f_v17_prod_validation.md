---
name: mission c195035f v1.7 生产验证 + preface guard 冲突
description: 2026-05-07 mission c195035f 首个 v1.7 切主线后真实 deep mission，装配核验全过 ✅ 但 preface fixed slot 内容空触发 S11 guard 失败
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

2026-05-07 mission `c195035f-d6fd-4dae-a9a0-d5176048e4e6`（"2026 全球碳中和政策进展"，深度 / zh-CN）是 v1.7 (commits c238b80f8 / f9a187452) 推主线后第一个真实 deep mission。

**v1.7 装配不变量全部符合预期 ✅**（这是关键证据：v1.7 在 prod 真实工作）：

- `templateId = "multi-dimension-report@v1"` ✅
- `sanitizerVersion = "1.0.0"` ✅
- `sectionCountMismatch = undefined` ✅（sections.length === expectedSectionCount）
- 15 sections（10 dim + exec/preface/toc + crossDim + references）
- **dim sections 字数分布 4112-4711（max/avg ≈ 1.08x）** — 完美均匀，对比 mission eafceb32（49K 单段）就是 v1.7 backend 控结构的目标态

**Why mission 仍 failed**：S11 内置 guard `chapter_content_incomplete`（`MIN_NON_EMPTY_SECTION_CHARS=40`）catch：14 substantive sections 中 13 ≥40 字符，**'前言' section bodyBytes=0**。

**根因**：

- `MULTI_DIMENSION_REPORT_TEMPLATE` 中 preface slot 是 `kind: "fixed"`（无论 body 空否都产出 section）
- 但 leader signoff 真跑了（accountabilityNote 460+字），**没有任何 stage 把 leader foreword wire 到 `segments.bodies.preface`**
- segment-extractors.util.ts 当前不读 leader signoff 输出
- 结果：fixed slot 总会产 section，但 body 全空，触发 guard

**How to apply（修复路径）**：

- 选 Option A：把 preface 从 fixed → optional（commit 待 push，最小侵入 2 行 + spec）
- expectedSectionCount 对 optional + fromBuilder 已经正确处理（resolveBuilderHasContent 检查 segments.bodies.preface?.trim()），所以 sectionCountMismatch 仍保持一致
- 不要走 guard 列白名单方向（guard 增加业务知识，分层不干净）
- 不要走"leader 必填 preface"方向（影响面大，改 leader prompt 有 evaluation 副作用）

**业务上的真痛点**：leader signoff 输出（accountabilityNote / refusalReason / leaderVerdict）目前没有任何 wire 到最终报告 — 这是另一个独立问题，不在本次 v1.7 范围。

**Mission 数据快照**（用 `scripts/dev/monitoring/watch-mission-c195035f.js` 还原）：

- elapsed 43.5 min, tokens 1.14M, cost $3.42
- 10 dim × 2-3 chapter 全过审（chapter scores 98-100）
- S9b objective evaluation: overall 66 / score 69（warnings: chapterBalance 110%>50% / lengthAccuracy 45727字 vs 8000 偏差 472% / redundancy 22%>15%）— 报告偏长但结构是对的
- S10 leader signoff: leaderVerdict='good', signed=true
- S11 guard catch → markFailed，report_full 未落 DB
