---
name: project-social-agent-team-w4-phase-2026-05-16
description: AI Social 重构成 Agent Team（W4 phase）—— 5 PR 拆解 / 严格 mirror playground / 严格基于 ai-harness + ai-engine 不重复造轮子
metadata:
  node_type: memory
  type: project
  originSessionId: ca6e8346-b1b3-4b70-92d3-8a333f6e80a3
---

**Status (2026-05-16)**: W1 done (frontend stepper) / W2 done (BrowserContextTool) / W4-PR1 done (9 SKILL.md 骨架) / PR-2~PR-5 pending

**核心约束（用户硬指令）**：

- "必须严格基于 Harness 和 Engine，不接受其他方案，不要自己重复造轮子"
- "你来专业决策" — 不来回问，自主推进
- "按 playground 玩法做"
- 跳过原 W3 god class 拆分（wechat.adapter.ts 2135 行 + ai-social.service.ts 1388 行保留不动，新 mission 路径绕过）

**Why**: AI Social 是单体 adapter + 同步链式编排，god class + 抽象缺失 + 编排手工化（成熟度 60%），需对齐 agent-playground 的"9-agent + 12-stage + harness 编排"形态。

**How to apply 拆 PR**:

- **PR-1**: docs/plan + agents/{role}/SKILL.md × 9（leader 完整 + 8 占位）+ skill-md-loader util + skeleton spec
- **PR-2**: 填 8 个 SKILL.md duty 详细内容
- **PR-3**: 9 agent.ts (IPlanBasedAgent) + 9 role service + 13 stage adapter
- **PR-4**: social-pipeline-dispatcher + social-business-orchestrator + social.config.ts + ai-social.gateway.ts + module 注册
- **PR-5**: mission entry endpoint + publish-executor.service 切换 + 真发 WeChat + XHS 回归（PR #111 publish 不退化）

**关键文件**：

- 设计文档：`docs/architecture/ai-app/social/agent-team-refactor.md` (parent W1-W5)
- 实施计划：`docs/architecture/ai-app/social/agent-team-w4-implementation-plan.md` (5 PR 拆解 + 12 stage primitive mapping)
- 分支：`refactor/ai-social-agent-team`
- 关键 commit：W1 `f3cd53218` / W2 `a161209c8` / W4-PR1 `9cf50f067`

**Mirror 来源**：

- `backend/src/modules/ai-app/agent-playground/`（8 agent role + 12 stage 完整实现）
- playground 总规模 ~15000 行；social mirror 估 ~10000+ 行（W4 phase 是多周工程）

**9 agent role**（playground 8 + social 独有 PublishExecutor）：

- Leader / Steward / PlatformProbe / ContentTransformer / CoverArtist / Composer / PolishReviewer / **PublishExecutor** ★ / PublishVerifier

**12 stage → harness primitive 映射** (详见 plan doc §"12 Stage → Harness Primitive 映射" 表):

- S1 budget-eval → persist/budget-pre
- S2 platform-probe → research/platform-schema
- S3 content-transform → synthesize/platform-adapt
- ...（plan doc 完整表）

**严格不写 / 不抽象**：

- 不自写 dispatcher 状态机 → 全注入 `MissionPipelineOrchestrator` / `MissionRuntimeShellService` / `MissionStageBindingsService` / `MissionCheckpointService`
- 不自写 retry 调度 → 用 `FailureLearnerService` + `MissionLivenessGuard`
- 不自写 LLM 调用 → `ChatFacade.chat` + TaskProfile
- 不自写 puppeteer 编排 → `ToolRegistry.get(browser-context).execute()` (W2 已落)
- 不自写 critique → `CritiqueRefineService.critique() + .refine()`

**功能保活红线（W4 期间硬要求）**：

- PR-5 真发回归通过前，旧 `publish-executor.service.execute()` 同步链式路径不下线
- 每 PR commit 必须含 W4-PR{N} 标记 + 功能保活摘要

**相关教训**：

- [[feedback_skill_md_allowedmodels_must_be_empty]] — SKILL.md 不硬编码模型名（2026-05-16 实测用户翻脸）
- [[feedback_refactor_must_preserve_function]] — 重构期间已工作功能必须真发回归不退化
- [[feedback_autonomous_phase_execution]] — Phase 级任务连续执行所有子 PR
