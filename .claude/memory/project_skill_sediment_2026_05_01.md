---
name: SKILL.md sediment 2026-05-01
description: 17 个 Anthropic 标准 SKILL.md 沉淀完成，覆盖 playground 全 mission 流程 M0→M7；下一步 PromptSkillBridge 让 agent 删内联 prompt
type: project
originSessionId: 6662308c-f32e-469e-9b10-9e586bf7ddb0
---

**Fact**: 2026-05-01 把 playground 14 个 duty.md / agent inline prompt 升级为
Anthropic 标准 SKILL.md（YAML frontmatter + name/description/version/tags/
allowedTools/activateFor），全部进 `ai-harness/kernel/skills/built-in/`，由
SkillLoader@OnModuleInit 自动注册到 BuiltInReActSkillRegistry。

提交链：

- `264aa241f` failure-learner 上提（pre-skill）
- `65d4cbeb8` tier-1: cross-dim-fact-check / report-meta-critic / citation-audit
- `503dd28f3` tier-2: 8 个（leader-signoff / mece-mission-planning / dimension-research /
  dim-chapter-integration / chapter-quality-gate / dimension-quality-review /
  multi-judge-mission-review / budget-stewardship）
- `62d365f5f` tier-3: objective-report-evaluation
- `6811f42ef` 修 dab20c096 留下的 orphan-detector spec / 阈值 mismatch
- `756a2fd49` 收尾: leader-mid-mission-assess / leader-foreword / cross-dim-synthesis

**Why**:

1. playground 8 agent 之前内联 60-200 行 prompt 在 buildSystemPrompt() 里，
   research / topic-insights / writing 想复用同一协议得复制一份 → 漂移
2. 北极星目标 = 对标 Anthropic Managed Agent (Claude Agent SDK)，他家 SKILL.md
   是事实标准，不能继续用项目私有的 duty.md 概念
3. SkillRegistry 同名陷阱（reference_two_skill_registries.md）— 两个 registry
   分工：ai-engine 是业务 skill DB-backed CRUD，ai-harness 是 ReAct 内置
   markdown skill。后者 2 个跑龙套 → 17 个独立认知协议是真正的能力沉淀

**How to apply**:

- 当用户说"沉淀 X 为 skill"或"复用 playground 能力"，**先**：
  - grep `ai-harness/kernel/skills/built-in/<name>/SKILL.md` 看有没有
  - 没有就按 Anthropic 标准格式新建：YAML frontmatter（必含 name / description /
    version / tags / activateFor）+ Markdown body（Inputs / 协议步骤 / Output
    JSON shape / Hard rules / What this skill is NOT）
- 当 ai-app 模块（research / writing / topic-insights）想用某个 skill，
  agent 的 `@DefineAgent({ skills: [...] })` 添加 skill name，
  SkillActivator 会在 prompt 时拼接 instructions
- **下一步未完成**: PromptSkillBridge 让 8 个 playground agent class 删除内联
  prompt（每个 agent 减 50-200 行）。需要新 PR 验证 agent runtime + skill
  activation 真的在 production prompt 里 inject 了 SKILL.md 内容
- 17 个 skill 全名见 `reference_two_skill_registries.md`

**Status**: 沉淀阶段已落地，agent 接入阶段未启动（属于 PR-X-skill-bridge 范畴）。

**2026-05-15 复核**：

- ✅ harness 侧 class 已改名 `BuiltinSkillCatalog`（skill-registry.ts:28），保留 `BuiltInReActSkillRegistry` 兼容别名。NAME COLLISION 已消除
- ✅ ai-harness/facade re-export 路径分离（engine 的 SkillRegistry vs harness 的 BuiltinSkillCatalog 各自 export）
- ⚠️ agent 仍未真消费 getSkill()：PromptSkillBridge 在 agent-playground.module.ts:onApplicationBootstrap 注册了 "agent-playground" domain，但 agent class 内部还是依赖 inline prompt + duty.md 拼装；真正"通过 BuiltinSkillCatalog.getSkill() 拿 SKILL.md body 注入 prompt"的链路 PR-8（leader-chat 改造）落地后会显性化
- ⚠️ leader-chat.service.ts:15 注释 "PR-8 把 buildLeaderChatPrompt 整体迁到 SkillRegistry（待）" 仍是 TODO
