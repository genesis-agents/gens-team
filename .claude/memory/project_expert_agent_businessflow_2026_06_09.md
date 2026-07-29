---
name: project_expert_agent_businessflow_2026_06_09
description: 专家 Agent 业务流闭环落地——验收 rubric 上运行路径（护城河 P0 补齐）+ 入参富化 + 职能名，commit 0284e0238
metadata:
  node_type: memory
  type: project
  originSessionId: fd78da98-14aa-4d0f-8b03-5029d6793fb1
---

2026-06-09 全自驱（workflow 勘察+设计 → 主 Agent 实施+验证+推主干）完成「专家 Agent 业务流闭环」。commit **0284e0238**（main）。承接 [[project_positioning_digital_employee_2026_06_09]] 的 §7 P0/P1 后端清单。

**护城河 P0 补齐（验收 rubric 上运行路径）**——架构决策 AD-1：**surface deep-insight 内部已有的 reviewer verdict，不另接 ai-harness/evaluation JudgeService**（reviewer=`MissionReviewerAgent` 已产 `{score,verdict:approve|revise|reject,notes[]}`，再接 Judge 是重复采购 token）。落点：

- `CapabilityManifest` 加 `rubric{passThreshold,maxAttempts}`；deep-insight 默认 `{60,2}`。
- runner 加 `synthReviewVerdict()` 把内部 reviewer 输出映射进 `CapabilityRunResult.reviewVerdict`（纯数据映射，0 额外 LLM）。**校正**：原 `extractVerdicts()` 只读 `r.verdicts[]`（reviewer 不产该字段）→ `result.verdicts` 恒空，真分埋在 `byStage.review`，**之前没 surface 没 gate**。
- company `runViaCapability` 终态前 gate：`score>=passThreshold` 判 `passed`，不达标且 `attempt<maxAttempts` 递归重跑（**只对"跑成功但低分"重跑，不对 result.status=failed 重试**，react-runaway 看护），落 `result.review.{score,verdict,passed,threshold,attempts,notes}` JSON（**无 schema 变更**）。单测 `company-mission-acceptance.spec.ts` 实证封顶不死循环。
- 之前 `runReview` 只是 leader 同模型自评——现在英雄派单真过验收门。

**其余**：adoptHero 删 `HERO_NAMES` 雅称池→默认名取 `manifest.title`+同名加序号；`CapabilityRunInput` 扩 `withFigures/knowledgeBaseIds/searchTimeRange` 全链路透传 researcher（**校正**：style/length/audience 默认 `SingleShotWriterAgent` 不消费，没乱加）；下发任务对话框改 canonical `MissionDialogShell`+折叠高级配置。

**Why/How to apply**：这是「专家 Agent=数字员工」差异化的命门落地（vs 通用龙虾的"抽卡/无验收"）。后续新能力若无内部 reviewer verdict，再走 evaluation/JudgeService 兜底（本期未接）。真·LLM 端到端需部署后 gens.team 跑（push 已触发）。

**坑（血泪）**：Write 工具传相对路径会按 Bash cwd 解析——我 `cd backend` 后 Write `backend/src/...` 结果落到 `backend/backend/src/...`，jest ENOENT 查半天。**Write 一律用绝对路径**。关联 [[feedback_*]] 待补。
