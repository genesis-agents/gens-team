---
name: 两个 SkillRegistry 同名陷阱
description: 项目里有 2 个同名 SkillRegistry 类，职责不同但常被混为一谈；讨论 skill 时必须先确认是哪个
type: reference
originSessionId: 9ee93735-736f-41d7-a9c6-b9c1b21d7a9b
---

项目里有 **两个 SkillRegistry 类同名共存**，技术债 `P1-3 rename deferred`（rename 触及 ~65 文件）。

**ai-engine/skills/registry/skill-registry.ts**

- CRUD 风格，按 `domain` / `layer` / `tag` 索引
- 程序化 `ISkill` 对象（不是 SKILL.md），DB-backed via `SkillContentService`
- 是 **生产路径主线**：被 ai-harness/facade（ai.facade.ts、chat.facade.ts、team.facade.ts）、ai-harness/runtime/teams、ai-harness/kernel/base/base-agent.ts、open-api/skills-api 全面依赖
- `PromptSkillBridge`（ai-engine/skills/runtime/prompt-skill-bridge.service.ts）会把 SKILL.md 转成 PromptSkillAdapter 注册到这里
- 通过 `import { SkillRegistry } from "@/modules/ai-engine/facade"` 访问

**ai-harness/kernel/skills/skill-registry.ts**（已改名 BuiltInReActSkillRegistry, 2026-05-01）

- 内存版，按 `name` 索引，`Map<string, ISkill>`（ISkill = frontmatter + Markdown body）
- `SkillLoader` 在 OnModuleInit 时扫描 `ai-harness/kernel/skills/built-in/*/SKILL.md` 加载
- 2026-05-01 已沉淀 17 个 built-in（覆盖 playground 全 mission 流程 M0→M7）：
  - **流程类**: mece-mission-planning / dimension-research / leader-mid-mission-assess /
    cross-dim-fact-check / cross-dim-synthesis / dim-chapter-integration /
    leader-foreword / leader-signoff
  - **质量类**: chapter-quality-gate / dimension-quality-review / multi-judge-mission-review /
    report-meta-critic / citation-audit / objective-report-evaluation
  - **跨切关注**: budget-stewardship
  - **legacy**: web-research / critical-review
- 给 ReActLoop / SkillActivator 在 prompt 时按 role/tag 拉取
- 通过 `import { BuiltInReActSkillRegistry } from "@/modules/ai-harness/facade"` 访问

**Why**: 早期分层尝试遗留 + rename 改动面太大延期。

**How to apply**:

1. 用户/讨论提到 "skill 系统"、"SkillRegistry"、"skill 化" 时，先确认是哪一个，不要假设
2. ai-app 业务模块（research/writing/topic-insights/office）注册自己的 `*.skill.md` 走 ai-engine SkillLoaderService 路径
3. ReActLoop 内置激活的"通用辅助 skill"才走 ai-harness/kernel/skills/built-in
4. 判断"skill 是否被使用"必须 grep 两个 import 路径：`ai-engine/skills` AND `ai-harness/facade`（取 SkillRegistry）。只 grep 一个会得出错误结论（曾经 sub-agent 误判 ai-engine/skills 为死代码）
5. 文件头部 1-23 行（两边都有）有 NAME COLLISION 警告注释，是判断关键
