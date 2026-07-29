---
name: project_positioning_digital_employee_2026_06_09
description: GenesisPod 战略定位拍板——一人公司「专家 Agent」平台，去英雄化，验收 rubric 是命门 P0
metadata:
  node_type: memory
  type: project
  originSessionId: fd78da98-14aa-4d0f-8b03-5029d6793fb1
---

2026-06-09 用户与我三轮战略对话拍板的产品方向（代码看不出，落档 `docs/architecture/product-positioning.md`，为权威北极星）。

**定位**：GenesisPod = 一人公司/专业个体的「**专家 Agent**」平台。交易单位 = **干完的活（成品交付）**，不是零件（工具/技能）、不是通用 agent。面向 2B/专业个体，不面向开发者、不面向管个人设备的消费场景。

**坐标**：夹在「零件市场(MCP/技能库,用户是开发者)」与「通用龙虾(OpenClaw,开源25万星但盗刷/删库/工信部预警的『龙虾悖论』)」之间。**不在两端硬刚**——占中间唯一别人做不好的位置：**专业交付的可信度**。龙虾的软肋(不可控/抽卡)＝我们的结构性强项。

**护城河四层**：工作流程(打法)✅真跑 / 团队配置(阵型)✅真成军 / 技能✅真注入(buildSkillInstructions 注 SKILL.md 正文) / **★验收 rubric ❌缺失=P0**。关键诚实结论：`company-mission.service.ts` 的 `runReview` 只是 leader 同模型自评，无独立 evaluation、无合格门槛、无不达标重跑，DTO 无 rubric 字段。前三层让我们比龙虾稳，但「懂什么是好」这层未上路——而这正是模型替代不了的命门。

**术语迁移（用户明确要求去英雄化，回 2B/个人视角）**：英雄→专家 Agent、英雄市场→人才市场、收下→录用、我的英雄→我的团队、英雄任务→我的任务、**删雅称池 HERO_NAMES(知微/洞玄)→实例名用职能名(深度研究专员)**。内部标识(CompanyHero/`/company/heroes`)可暂不改名，仅 UI 文案+实例显示名。侧栏 nav-config 推荐最小改动(仅术语+图标 Crown→Users)，可选方案把专家 Agent工作台提为顶级分组。

**Why**：用户困惑「市场到底卖什么、贡献者贡献什么、变现什么」。答案三方同层自洽——贡献者交 Manifest(流程+分工+技能+强制rubric+样例)、用户买成品、按 mission 计费+作者 70/30 分成。

**How to apply**：后续 company/marketplace 呈现改动以 product-positioning.md §5/§6 为准；实现机制仍看 [opc-hero-model.md]。P0 = 把 rubric 接上 `runViaCapability` 终态前的独立 evaluation(用 ai-harness/evaluation critique/verify 非 leader 自评)+不达标重跑封顶。关联 [[project_self_driven_unlocks_2026_06_05]]（已有 evaluateAgainstRubric 自评雏形，可借）。
