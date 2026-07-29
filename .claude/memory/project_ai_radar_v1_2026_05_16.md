---
name: project-ai-radar-v1-2026-05-16
description: AI 雷达 v1 落地 6 PR (R1-R5 + R6 整改) + 5 路评审 2 轮 5/5 共识；持续监控多源采集 + 5 agent + 8 stage pipeline
metadata:
  node_type: memory
  type: project
  originSessionId: eb9df724-2242-4336-8d27-58151c093da9
---

**功能**：AI Radar 新模块 `ai-app/radar/` —— 针对主题/对象/实体持续监控 X / YouTube / RSS / Custom 数据源，AI 自动相关性过滤 + 信号洞察。

**Why**：用户对 Topic Insights（一次研究）和 Agent Playground（一次 mission）外补持续性监控模块；MECE 差异点 = 持续 cron + 多源 + 信号洞察 + 周期性。Plan 文档 `~/.claude/plans/snuggly-churning-plum.md`。

**How to apply**：再加新 AI 模块时遵循同样 5-PR 拆分（骨架 → 采集 → AI/pipeline → 调度 → 前端）+ 4 路评审两轮共识范式；模块代码全在 `backend/src/modules/ai-app/radar/` + `frontend/{app,components}/ai-radar/`。

**关键 commits**（worktree `feat-ai-radar` branch `worktree-feat-ai-radar`）：

- PR-R1 `78dc865b4`：数据骨架（Prisma 5 model + 4 enum + 7 DTO + 5 stub controller）
- PR-R2 `846f359cf`：4 collector (RSS/YT/X-Nitter/Custom) + SSRF util + sourceHealth cooldown
- PR-R3 `1306789b3`：5 agent (relevance/quality/entity/signal/source-curator) + RadarPipeline S4-S8 + LLM fallback
- PR-R4 `e5f702401`：cron scheduler @EVERY_MINUTE + cron-parser nextDueAt + NotificationService 接入
- PR-R5 `cf4de8a5a`：22 endpoint API + 2 page + 6 组件 + Sidebar/MobileNav 集成 + i18n
- PR-R6 `362ef83f4`：评审 P0/P1 整改 21 项 + 35 spec（agent-utils / hash.util / ssrf-util / cron-util）

**5 路评审 2 轮共识达成**：Round 1 4 路 NO（架构 YES）→ R6 整改 → Round 2 5/5 YES：

| 路           | Round 1    | Round 2 | 关键 P0                                                                          |
| ------------ | ---------- | ------- | -------------------------------------------------------------------------------- |
| Security     | NO 8 P0    | YES     | refresh 竞态 / SSRF DNS rebinding / cron 注入 / RateLimit 缺位 / nested DTO 未验 |
| Frontend     | NO 3 P0    | YES     | acceptedOnly 字符串布尔 / UpdateRadarSourceInput 类型过宽 / JSON.stringify 双重  |
| Contract     | NO 4 P0    | YES     | 21 endpoint 跨端契约错位                                                         |
| Code Quality | NO 4 P0    | YES     | assertCron 注释逃逸 / N+1 update / collector 错误吞                              |
| Arch         | YES 9.2/10 | YES     | facade 边界严格                                                                  |

**沉淀的关键反模式**：

- [[feedback_refresh_create_must_be_tx_atomic]] —— refresh dedup window 不防真并发，必须 `$transaction` 原子 acquire
- [[feedback_block_comment_star_slash_escape]] —— TS 块注释含 `*/` 字面提前结束
- 双重序列化反模式：DTO `@ValidateNested` 而非父层 `JSON.parse` 套子 DTO
- N+1 update 反模式：S4/S5/S6 改 `$transaction([...updates])` 批量
- Round 1 NO 必须 R6 整改后开 Round 2 全 YES 才算共识（见 [[feedback_consensus_must_iterate_to_all_yes]]）

**v1 scope cut**（不在本期）：X Spaces / 实时流 / 多用户共享 / 实体图谱 / 邮件 webhook 推送 / 主题模板市场 / 历史回填。

**Follow-up**：Service 层 spec 补齐（Round 2 code quality reviewer 接受作 follow-up）；Railway prod 端到端真跑验证（worktree merge 后）。
