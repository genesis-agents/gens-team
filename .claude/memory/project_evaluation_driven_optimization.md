---
name: evaluation-driven-optimization
description: Evaluation-driven quality optimization progress — foundations done 2026-04-17, frontend + model routing remain
type: project
originSessionId: c7fa231e-1da8-415c-a0c4-9860bdf56dd5
---

## 评审驱动优化（进行中）

**Why:** 当前 10 维评审从只读诊断升级为生产闭环，让用户能对低分 section 一键优化、让模型质量差异通过系统补救收窄。

**How to apply:** 以下进度用于下一会话决定从哪里继续：

## 2026-04-17 已落地（批次 4）

- **Prompt 版本化基础**：`prompts/prompt-version.ts` 提供 `PROMPT_VERSIONS` + `PROMPT_METADATA`（含 sha256-16 hash），`getPromptMetadata()` 返回 `{ version, hash }`。单测 10 项覆盖稳定性、去重、whitespace 敏感。
- **质量 trace 记版本**：`QualityTraceContext.promptProvenance` 在 `createTrace()` 时快照 PROMPT_METADATA；`DimensionOutputProbe` 加 `writerModel` / `remediationModel` / `selfEvalScoresBefore` / `selfEvalScoresAfter` / `selfEvalDelta` / `weakAreasResolved`；新增 `recordDimensionRemediationLoop()` 拼装三元组。
- **补救后强制重评闭环**：`dimension-writing.service.ts` 在 `SectionRemediationService.remediate()` 成功后强制跑 `SectionSelfEvalService.evaluateSection`，写入 `RemediationTrace.selfEvalScoresAfter` / `scoreDelta` / `weakAreasResolved` + 每个 action 的 `scoreAfter`。非阻断（重评失败不回滚补救）。
- `RemediationTrace` 扩展字段：`selfEvalScoresAfter` / `scoreDelta` / `weakAreasResolved` / `promptVersion` / `promptHash` / `action.scoreAfter`（全 optional，向后兼容）。

## 剩余任务（下一优先级）

1. **前端"一键优化"按钮**
   - `POST /topics/:id/dimensions/:dim/remediate` 接受 `{ action: "inject-evidence" | "add-figure" | "deep-dive" | "add-actionability" }`
   - 对应 4 种 RemediationActionType，复用 SectionRemediationService
   - 前端可信度页面加按钮，点击后调后端、展示 before/after 分数 + delta

2. **模型质量收敛（评审反馈选型）**
   - 新表 `ModelPerformancePerDimension`（model_id, dimension_type, avg_score, count）
   - `LeaderAgentSelectionService` 读此表，低分模型下次不分配同类章节
   - 需要 Prisma schema 变更 + 手写 migration

3. **可选：双模型 LLM-as-judge 校准**（P1-10）
   - `ReportEvaluationService` 同样本用两个 EVALUATOR 评分，统计一致率
   - 对照 RAGAS/DeepEval 基准

## 推荐继续顺序

- 先做 frontend 一键优化（业务价值最高、与用户直接交互）
- 再做 model routing（需要 schema 变更、单独事务性工作）
- 双模型校准放最后（评估成本翻倍，需要仔细规划）
