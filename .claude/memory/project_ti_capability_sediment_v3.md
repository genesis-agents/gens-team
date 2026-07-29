---
name: ti-capability-sediment-v3-2026-04-29
description: TI 商用基线零修改前提下的 quality 闭环 5 件套沉淀 + 全量接入 Playground 标杆 (2026-04-29)
type: project
originSessionId: 2823765d-c5eb-49e8-8fc4-98cd7201499f
---

## 背景

TI 是商用基线，必须一字不动。Playground 是标杆 Agent 范本，要消费业界领先实现。
"沉淀"的真正含义：**从 TI 提炼参考实现 → 唯一一份落到 ai-engine / ai-harness → Playground 消费**。
不是复制副本（v1 错），不是改 TI import（v2 错），是抽象出独立的标杆实现。

## 落地范围

### 沉淀位置（共 6 项）

1. `ai-engine/llm/output-utils/strip-chart-json.utils.ts` —— LLM 图表 JSON 残留清理（纯函数）
2. `ai-engine/llm/types/model-tier.ts` —— 模型分级（已存在，发现重复后未额外建副本）
3. `ai-engine/content/report-template/` —— 整体物理迁移（git mv 自 ai-app/contracts/report-template）
   - 13 类格式化标准 (4344 行) + 写作规范常量 (782 行)
   - contracts 留 re-export shim：`index.ts` + `pipeline/report-formatting.utils.ts`（解决 TI deep import）
4. `ai-harness/governance/critique/report-quality-gate.service.ts` —— code-enforced 全报告级质量门控
5. `ai-harness/governance/critique/section-remediation.service.ts` —— 弱维度合并补救 + STRONG tier 升级
6. `ai-harness/governance/critique/report-evaluation.service.ts` —— 10 维 EVALUATOR 模型评审 + 模型对比
7. `ai-harness/governance/critique/quality-trace-compute.service.ts` —— 全链路质量 trace 纯计算（拆出 TI 的 prisma 持久化部分）

### Playground 全量接入（5 个 stage 改动 + 2 个新 stage）

- **ReportAssemblerService** 注入 ReportQualityGateService + stripChartJsonFromContent（assemble 主流程消费）
- **新 Stage S8B**：`s8b-section-quality-enhancement.stage.ts` 在 S8 后 S9 前
  - 4 维写中自评（SectionSelfEvalService）
  - 弱维度合并补救（SectionRemediationService）— 阈值 7
  - 强制重评 + score delta 校验
  - 退步保护（delta < -0.3 拒绝替换）
- **新 Stage S9B**：`s9b-report-objective-evaluation.stage.ts` 在 S9 后 S10 前
  - EVALUATOR 模型 10 维独立打分
  - 多模型对比（不同 chapter 的 writerModel 差异）
  - 落 reportArtifact.metadata.pipelineEvaluation
- **S10 Leader signoff** 注入 objectiveScore / objectiveGrade / objectiveFeedback —— Leader 拿到客观证据
- **Leader.agent QualitySnapshot + LeaderFinalQuality schema** 加 3 个 optional 字段

## 验证

- `npx tsc --noEmit` —— 0 错误（仅另一 Agent 的 config.module.ts 缺 ResourceLifecycleModule，与本次无关）
- `npx jest --testPathPattern=(ai-harness|agent-playground|topic-insights)` —— **304 套件 / 8838 用例全绿**
- TI 行为：零字节修改，依然走原 import 路径（TI 的 quality 服务文件不动；contracts shim 兼容 deep import）

## 跨 Agent 协调

本次会话期间另一个 Agent 在 `explore/resources` + `management/ingestion` + `prisma migrations` 做 YouTube 视频治理 + Resource Lifecycle 工作。
**白名单原则**：本次只改我的 14 个文件（quality 沉淀 + Playground 接入），其它 Agent 文件零接触。
教训：多 Agent 并行时必须列白名单，不要触碰非自己范围的文件。

## How to apply

- TI 商用基线绝不修改任何字节，包括 import 路径。沉淀只是"参考实现的抽象"，不是迁移。
- "沉淀"≠ 复制副本。如果 ai-engine / ai-harness 已经有一份实现，先 grep 验证，避免双副本（曾误建 model-tier.config 在 election，发现 types/model-tier 已存在后撤销）。
- contracts 这种被 TI 内部多处 deep import 的模块下沉时，必须在原路径留 shim 兼容 deep import，不能仅靠 index.ts 顶层 shim。
- Playground stage 的命名规范：sN / sNb / sNc，narrative.util.ts 的 NarrativeStage 类型必须同步扩展。
- 客观评分作为 leader 的"证据"，不是替代 leader 决策—— schema 字段保持 optional，让 Leader 自己决定权重。
- 所有外层 LLM 调用都已通过 runMission 的 withUserContext 包裹，stage 内调 sectionRemediation/sectionSelfEval/reportEvaluation 不需再 wrap billing。
