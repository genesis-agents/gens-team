---
name: feedback-decisions-must-propagate-to-body
description: "决策表（§15 等汇总表）写一条决策不算落地；必须在 body 章节（schema / cron / 模板 / 验收等）至少 1 处具体落地，否则评审会反复抓'决策孤岛'红线"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

任何带"决策表"的设计文档（如 ai-radar daily-briefing-redesign），评审一定
会拿决策表与 body 章节逐项对齐。**只在决策表加一行不算闭环** —— 必须在
body 至少 1 个章节有：

- schema 字段定义（Prisma model）
- 算法 / 公式（service 伪代码）
- 模板渲染契约（Handlebars + 数据契约接口）
- cron / 事件契约（@Cron / @OnEvent 代码示例）
- 验收用例（§11.X 验收段加新断言）
- DB migration SQL 段（§10.1）

**反模式 — "决策孤岛"**（R2 → R3 → R4 连续 3 轮踩）：

| 决策表加了         | body 缺失                            | 评审结果           |
| ------------------ | ------------------------------------ | ------------------ |
| Smart Brevity 4 层 | §7.3.3 邮件模板仍 1 层               | NO with conditions |
| narrativeId        | §4.1 ASCII 无 NarrativeThread 行     | NO with conditions |
| weekly briefing E5 | §8.3 无 sweepWeeklyBriefing cron     | NO with conditions |
| tier3 instant E2   | §8.5 无 instantPushForTier3 字段     | NO with conditions |
| force/exclude 矩阵 | §11.2 行字面仍写 forceChannels="..." | P1 doc-consistency |

**反模式 — "渲染层孤岛"**（R3 → R4 踩）：

> dispatch type 在 cron 加了但**渲染层没补对应模板** = body 半截路径

| dispatch type       | 缺什么                     | 评审结果           |
| ------------------- | -------------------------- | ------------------ |
| RADAR_WEEKLY        | §7.3.6 weekly 邮件模板缺   | NO with conditions |
| RADAR_TIER3_INSTANT | §7.3.7 站内 + 公众号模板缺 | NO with conditions |

**Why:** 用户原话 "我需要 100% 的业务逻辑覆盖" + "100% 真实业务接入"。
决策表是 contract，body 是 implementation。决策表对 evaluator 来说是"承
诺"，body 对 evaluator 是"兑现"。承诺没兑现 = 文档不可执行 = NO。

**How to apply:**

1. 写决策表时 **强制每一行附带 "落地章节" 列**（如 J1: see §4.2-bis）
2. 改决策表 / 加新决策时，**搜索文档全文找所有该决策应触达的章节**，
   每个章节都补具体内容（schema/cron/template/验收）才能算闭环
3. 评审 prompt 时，**逐项 grep body 验证落地章节存在 + 非占位** —— 不只
   看决策表
4. PR 拆分时，**任何被切到下一 PR 的决策**必须在当前 PR 的决策表标
   "Phase 2 / 下 PR"，否则评审会以为漏了
5. cron / @OnEvent 事件源必须**同 PR 提供发射代码示例**（不能"由 PR-DR2
   补"）—— 渲染端 + 发射端 + 模板必须同 PR 闭环（"事件契约"段 §8.4-bis）

相关：[[feedback-no-dual-sources]] [[feedback-implementation-rounds-need-review-too]]
[[feedback-fallback-must-be-self-consistent]]
