---
name: project-3layer-maturity-audit-2026-05-15
description: 2026-05-15 四路并行审计 engine/harness/playground 三层成熟度与 playground 标杆资格、业界排位
metadata:
  node_type: memory
  type: project
  originSessionId: 2e1aa3d7-8b7e-49df-aad3-c8b0058ddbc8
---

# 三层架构成熟度 + 标杆资格 + 业界排位 三问综合诊断

**4 路并行**：arch-auditor / general-purpose 标杆评估 / claude-code-guide 业界对标 / explorer SOTA 复核

## 三句话直答

1. **架构成熟度 7.2/10**：边界 / Facade / SKILL.md 密度 / 看护机制 / 协作模式已达标杆水准；但有 P0 概念违规（SkillRegistry 双源 engine+harness 同名）+ checkpoint 双套抽象 + 14 处 Map 未迁 Redis
2. **Playground 标杆资格 82/100，有条件**：对 **mission-pipeline 派**强标杆（writing-team 已 dogfood + invariants.md/template.md 固化）；对 **chat-driven / SSE / topic-insights 派**过度框架，不强制迁移
3. **业界排位 95/120 二线前 3**：与 LangGraph、OpenAI Agents SDK 并列；距 Anthropic Managed Agent（110/120）差 15 分；Anthropic Managed Agent 60% 对齐度 → 修完 P0 三件后可达 95%

## 12 维度业界对标（满分 10）

```
                  Genesis  Anthropic MA  Claude SDK  LangGraph  OpenAI  AutoGen  CrewAI  Mastra
分层 Facade          9        10            9          9         7        7        7        4
唯一 Registry        5  ⚠     10            9          9         7        6        6        2
ReAct loop           9        10            9          9         9        8        7        6
评测闭环             7  ⚠     10            7          6         6        8        4        2
状态外置             5  ❌    10           10         10         9        7        6        2
Multi-agent          9        10            9          9         8        9        9        4
Guardrails           9         9            9          7         9        8        6        2
Tracing              9        10            9          9         9        8        5        2
Skill 抽象           9  ⭐     7            9          4         5        6        7        2
MCP / Tool           8        10           10          7         9        8        7        4
Lifecycle            8        10            9          9         7        8        6        2
看护机制             9  ⭐    10            4          9         6        5        4        2
合计              95/120   110/120       99/120     97/120     91/120  87/120   82/120  65/120
```

## Genesis 三大独门优势

- **Markdown SKILL.md 标准化**（50 个）— 业界仅 Anthropic 在推
- **ESLint + spec + pre-push 三层强制 layer-boundary** — 业界唯一硬看护
- **Postmortem→VectorMemory 闭环 + A2A IPC 五协议 + Debate/Vote/Review 三协作模式**

## Genesis 系统性短板（距 Anthropic MA）

| #   | 短板                              | 工作量 |
| --- | --------------------------------- | ------ |
| 1   | Stateless 外置仅 20%（14 处 Map） | 2 周   |
| 2   | 多模型 Transparent Failover 缺失  | 10 天  |
| 3   | Dreaming 主动反思（跨 mission）   | 12 天  |

## P0 阻断标杆 3 件

1. **SkillRegistry 双源（2h）**：harness facade export 改名 `BuiltinSkillCatalog`；文件顶部已有 "NAME COLLISION WARNING"
2. **Leader-chat 绕过 harness Runner（1w）**：`leader-chat.service.ts:15` PR-8 注释 TODO；作为标杆出现"全 agent 走 harness 但 leader 例外"反例
3. **Stateless 外置 Phase 2-3（2w，与短板 1 重合）**

## 标杆使用建议

```
新建 mission-pipeline 派 (debate-team / planning-team / agent-team) → 强标杆，照抄 8 项必备
存量 mission-pipeline (teams)                                     → 弱标杆，大重构再渐进对齐
chat / SSE / topic-insights 派 (research / writing / TI)          → 不要套，过度工程
```

## 与 memory 记录的关键漂移（40% 准确度）

- ❌ `project_playground_r2c_complete_2026_05_04` → simple-loop 仍存活（chapter-reviewer 合理保留，非"已删"）
- ❌ `project_harness_stateless_phase9_2026_04_30` → 仅 MissionElectionTracker 迁好，14 处 Map 未迁
- ⚠️ `project_skill_sediment_2026_05_01` → SKILL.md 已沉淀但 agent 不真消费 getSkill()
- ⚠️ `project_audit_p0_round_2026-04-29` lengthProfile 闭环 → DTO 在但 finalize 不校验字数
- ✅ `project_liveness_guard_unified_2026_05_05` → 真已统一
- ✅ `project_tools_skills_mechanism_pr12_2026_05_01` → ToolACL Pipeline 真已落

## 标杆模板 8 项必备（提炼自 invariants.md + template.md）

1. `&lt;team&gt;.module.ts` 零 deep import，仅 ai-harness/facade + ai-engine/facade
2. `pipeline-dispatcher` + `business-orchestrator` 双 service 拆分（IM-1）
3. `cross-stage-state.ts` 替代 ad-hoc cache（IM-2）
4. onModuleInit: skillLoader → registry → livenessGuard；onApplicationBootstrap: promptSkillBridge
5. 提供 `MISSION_RUNNER` / `MISSION_LIST_READER` token via contracts
6. `MissionCheckpointService` 通过 useFactory + 自己的 store
7. agents/&lt;role&gt;/SKILL.md + soul.md + duties/ 子目录
8. jest per-dir 85%/75% + `__tests__/` 镜像目录结构

## 关联记忆

- 替代 / 修正：[[project_playground_r2c_complete_2026_05_04]]、[[project_harness_stateless_phase9_2026_04_30]]、[[project_skill_sediment_2026_05_01]]
- 延续：[[project_playground_benchmark_pr_progress_2026_05_04]]、[[project_north_star_anthropic_managed_agent]]、[[project_anthropic_audit_2026_04_30]]
- 同主题历史：[[project_playground_minimality_audit_2026_05_08]]、[[project_playground_sota_gap_summary]]
- 既有冲突源：[[reference_two_skill_registries]] 已记录但未列为 P0
