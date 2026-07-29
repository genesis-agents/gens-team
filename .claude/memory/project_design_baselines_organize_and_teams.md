---
name: project-design-baselines-organize-and-teams
description: 对话整理(#1) + Agent Teams 呈现迁移(#2) 设计基线 v0.5 四路评审 4/4 通过，进实施带 P0 门禁
metadata:
  type: project
---

两个用户核心诉求已完成「先设计 → 四路评审 → 迭代共识」，状态 **v0.5/v1.0 评审通过（4/4）**。

> **进度（2026-05-21）**：#1 **P1 后端 + P2 前端（书签）已完成、端到端可用**。P1-1 数据 `7b931ed40` / P1-2 6 工具 `99bf649a7` / P1-3 集成 `5b0503124` / P1-4 测试 `fe78c4e60` / P2-1 SSE 客户端 `08c79dfc2` / P2-2 对话模式(面板 Tab+OrganizeChatMode) `4bcf75b1e`。每波 tsc0+verify:arch 100/100+audit 14/14。**剩余 #1**：单步撤销(需后端 reverse 端点)、>20 预演确认、P3 笔记/外部、P4 i18n/错误路径；**待真机实测**：consumeCredits 真扣费 + E2E。**#2 未开工**（先修 BLK-7 gateway JWT）。

原始设计（仍有效）：

- **#1 对话式 AI 整理**（书签/笔记/外部，一键 + 对话并存）：[设计](../../../docs/features/library/conversational-organize-design.md) · [ADR-006](../../../docs/decisions/006-conversational-organize.md)。复用 `ToolFacade.chatWithToolsStream` + organize ITool（薄封装 collections/notes 既有写）。**进 P1 前置门禁**：P0 调研 BLK-3（工具隔离 + userId→ToolContext 链路）/ BLK-4（会话历史注入）/ BLK-6（modelConfig 计费）回写后锁 v1.0。详见 [[project-agent-tool-loop-api]]。
- **#2 Agent Teams 呈现标准化**（落标准 21 P3，迁 agent-playground canonical）：[设计](../../../docs/features/ai-teams/presentation-migration-design.md) · [ADR-007](../../../docs/decisions/007-ai-teams-presentation-migration.md)。3153 行 god-class `ai-teams/[topicId]/page.tsx` → 薄页 + `lib/features/ai-teams/deriveTeamsView` + `common/mission-detail` Frame + 角色卡(team-topology/avatars) + 标准化 Tab。**进 P0 前置**：先修 BLK-7（`ai-teams.gateway` userId 无 JWT 校验，可伪造）。

用户已拍板：单步即时撤销 ✅ / 破坏性·批量>20 预演确认 / 独立 OrganizeSession 建表 / 旧页一次性切换(带功能映射全覆盖+真机跑通双闸)。顺序：**#1 先做**。

评审纪要（四路两轮 + 11 阻断项 + 拍板）：`docs/features/2026-05-21-design-review-minutes.md`。设计文档归 `docs/features/{module}/`（标准 10），非 architecture/。
