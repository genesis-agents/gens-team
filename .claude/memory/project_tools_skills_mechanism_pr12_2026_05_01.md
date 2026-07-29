---
name: tools-skills-mechanism-pr1-pr2-landed
description: 2026-05-01 机制审计 P0-#1/#2/#5 落地（callTool 走 Pipeline + Output reject 软切 + ToolACL 搬中间件），3 commits 已合 main，未 staging 验证
type: project
originSessionId: 8a597039-012b-4808-b6e7-ad19724f374c
---

# 2026-05-01 Tools/Skills 机制审计 P0 修复落地

## 已完成 commits（main）

| commit      | 范围                | 关键改动                                                                                                                                     |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `1a816b000` | feat(secrets)       | SecretsManager 集成 ExpectedSecretsPanel；后端 `getExpectedSecrets` API + `secret-name-mapping` 三字段扩展前序 commit `1b414ff59` 已落       |
| `cd8aa8ee3` | fix(tools) P0-#1/#2 | BaseSkill + BaseAgent.callTool 走 ToolPipeline；ValidationMiddleware 加 STRICT_OUTPUT_VALIDATION flag 软切（默认 off）                       |
| `492dcc2c3` | fix(tools) P0-#5    | ToolContext 加 duck-typed environment 字段；PermissionMiddleware 加 entitlement 检查 fail-closed；agent-runner Step 4 召回过滤保留作双重防御 |

## 关键设计决策

**Why: 双重防御**（不删 agent-runner 召回过滤）：

- 召回阶段 = LLM tool list 过滤 → 让 LLM 看不到无权工具，避免幻觉调用
- PermissionMiddleware = 运行时拦截 → 单一真相源
- 任何不进 ToolPipeline 的调用路径召回还能兜底

**Why: callTool fallback**（this.toolPipeline ? pipeline : direct execute）：

- BaseSkill / BaseAgent 改造时 3 个 wiring 站点（ai.facade / team.facade / teams-mission-orchestrator）当前作用域不持有 ToolPipeline 实例，加 TODO(PR1-wiring) 注释
- fallback 让单测兼容 + 渐进式接入零中断

**Why: STRICT_OUTPUT_VALIDATION 默认 off**：

- 抽样审计 image-generation 失败路径 + agent-handoff async 路径与自己声明的 outputSchema 不严格对齐
- 软切策略：staging 灰度两周观察 → 修不一致 schema → 切 prod

## 测试基线

全量回归 84 suites / 2231 tests 全绿；type-check 0 error（前后端）。

## 后续追加完成（同日）

| commit                                                                              | 范围                                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `feat(secrets) admin 面板加待配置 secret 卡槽` `1a816b000`                          | Secret 预置初版（已先于本日 commit）                                    |
| `fix(tools) pipeline 接通` `cd8aa8ee3`                                              | P0-#1/#2 BaseSkill+BaseAgent 走 Pipeline + Output reject 软切           |
| `fix(tools) toolacl 搬中间件` `492dcc2c3`                                           | P0-#5 entitlement 搬到 PermissionMiddleware                             |
| 用户/自动 commit `81097bd04` 把 secret 4 区块后端逻辑 ride-along 进 A2A spec commit | 异常但代码正确                                                          |
| `feat(secrets) 4 区块分类` `8a962f78e`                                              | UI 重构（解 21 orphan 误报）+ 扩展指南 docs/guides/adding-new-secret.md |
| `fix(tools) m2 收尾` `0a2e91194`                                                    | M2 zod 切换 + 60 工具 sideEffect 全量声明 + 守护脚本                    |

外加预先完成的 image-generation / agent-handoff outputSchema 修正（让 STRICT_OUTPUT_VALIDATION=1 可切 prod）+ M3 PromptSkillAdapter 接 LLM Function Calling + M4 harness-inspector facade 穿透修复。

## 收尾事实

- 测试基线：98 suites / 2841 tests 全绿；前后端 type-check 0 error
- M4 双 Registry 收敛已早被改名 BuiltInReActSkillRegistry 完成（注释 65 文件 rename 已是历史），本期只剩 1 个 facade 穿透违规，已修
- M3 Function Calling 仅做单轮 tool_use 回路，多轮 ReAct 留作下迭代
- LLM provider adapter 接口未扩展（OpenAI/Anthropic/Google/XAI 接口未改），tools 字段在 ChatCompletionOptions 层透传

## 留作下个迭代

1. M3 多轮 tool_use ReAct loop（当前仅单轮）
2. LLM provider adapter 真正消费 tools 字段（当前仅类型透传）
3. STRICT_OUTPUT_VALIDATION=1 staging 灰度 → prod 切换
4. harness 重跑路径消费 sideEffect 字段（当前已声明全量）
5. 21 orphan 误报：用户已配的 LLM key / 学术 key 现在全部归 B/C 区块，但还可加一次性脚本帮用户把 category 字段从 OTHER 修成 LLM/ACADEMIC（可选）

## How to apply

- 后续做 wiring 真正注入时，加注释说明 PR1 fallback 已经在防回退
- 后续启动 STRICT_OUTPUT_VALIDATION=1 前，先跑 image-generation / agent-handoff 的失败路径单测
- 修 schema 不要碰业务返回结构；要么放宽 schema（加可选字段）要么补返回字段
- 双 SkillRegistry 收敛时记得查 `ai-harness/kernel/skills/skill-registry.ts:4-23` 顶部注释里写明的 65 文件影响清单
