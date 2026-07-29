---
name: agent-playground 与项目 Skill 系统脱节
description: 2026-04-30 发现 playground 8 个 agent 完全没用 SkillRegistry，与 research/writing/topic-insights 的标准模式不一致
type: project
originSessionId: 9ee93735-736f-41d7-a9c6-b9c1b21d7a9b
---

playground (`ai-app/agent-playground`) 的 8 个 agent（leader/researcher/reconciler/analyst/steward/verifier/writer/reviewer）有 18 个 `agents/*/duties/*.md` prompt 文件，但**完全绕过项目自建的 skill 系统**：

- `agent-playground.module.ts` 里 grep 不到 `SkillRegistry` 任何引用
- 没有 SKILL.md frontmatter，没有 `activateFor`/`allowedTools`
- 走的是 `utils/duty-loader.ts` + `buildPromptFromDuty()` 的私有加载路径

而隔壁 ai-app 模块都接入了：

- `ai-app/research/research.module.ts` import ai-engine/skills
- `ai-app/writing/ai-writing.module.ts` import ai-engine/skills
- `ai-app/topic-insights/topic-insights.module.ts` import ai-engine/skills
- `ai-app/office/slides/skills/slides-skills.module.ts` 自己有 skills 目录
- `ai-app/contracts/skills/ai-app-scaffolding.skill.md` 是项目认可的 ai-app skill 模板

**Why**: playground 是项目最活跃的 ai-app（最近 5 个 commit 全在动它），SOTA 12-stage pipeline、ReportArtifact v2、failure cascade、quality 闭环 5 件套全在这；但因为快速迭代，duty markdown 走了私有路径没接入 SkillRegistry。这与 `project_audit_baseline_2026_04_29.md` 中"playground 系统性绕过项目质量护栏"的发现一致——是同一现象的不同切面。

**How to apply**:

1. 任何关于 "skill 化 playground" / "playground 重构" / "duty 文件统一管理" 的讨论，提醒"先收敛到 ai-engine SkillRegistry，不要新建第三套"
2. 改造代价：duty markdown 加 frontmatter（半天）+ module.ts 在 onModuleInit 注册（半天）+ agent.buildSystemPrompt 改查 registry（1 天）。是收敛而非新建
3. 不能 skill 化的部分：`agent-playground.gateway.ts`（WebSocket）、`controller.ts`、`adapters/socket-broadcast.adapter.ts`、`services/mission/workflow/team.mission.ts`（12-stage DAG 编排）—— 这些是平台机制
4. 与 `project_audit_baseline_2026_04_29.md` 关联：playground 绕过质量护栏 + skill 系统脱节是同一架构债的两个面
