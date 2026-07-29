---
name: project_table_unification_truncatedcell_2026_05_23
description: 全系统数据行表归一到 TruncatedCell 公共组件 + R16 看护规则；分批进行中
metadata:
  node_type: memory
  type: project
  originSessionId: 64c38623-b98b-4bd7-8263-873820e1ac0a
---

2026-05-23 起：把全系统「数据行列表表」(A 类，约 58 张)统一成单行 + 截断 + 悬浮看全文 + token 配色。

**公共机制(已落地)**：

- 新增 `frontend/components/common/tables/TruncatedCell.tsx`——单行截断 + 仅溢出时挂 Radix Tooltip(ResizeObserver 重判)。用法须给宽度约束 `className="max-w-[Npx]"`。
- 彩色标识**复用** `ui/badges/StatusBadge`(tone SSOT) + `ui/tag/Tag`，**不造 TableBadge**(会重复)。配色走 `lib/design/tokens.ts`(statusToken/roleToken/toneToken)。

**看护机制**：`scripts/utils/audit-ui-discipline.ts` 新增 **R16-TruncatedCell-Required**(已 HARD_ZERO 焊死)——数据行表文件(import ui/table 原语 / `<DataTable>` / `MissionTaskList`)里、单元格上下文(`<Td>`/`render:`/`cell:` 附近)禁手写 `.slice/.substring(...)+省略号`，必须用 TruncatedCell。图表轴标签/数据预处理/toast/payload 的 substring 不算(已精准排除)。

**已全部迁完（6 波，~45 张，分支 feat/table-truncated-cell-unify 已推 origin）**：含 me(api-keys/models)、agent-playground(MissionTodoBoard/ComputeUsagePanel/FactTablePanel)、admin(ai-config/tools/skills/knowledge/secrets/users/recommendations/data-management/kernel/system/ai 各页)、ai-social/ai-research/ai-insights/ai-radar 等。admin 用户已明确要求**纳入**(2026-05-23「admin的要搞啊」)，admin 表保留自有 AdminStatusBadge 只换截断。

**不迁(已逐一确认)**：B 类 markdown 渲染表(ai-teams [topicId]、explore/report [id]、PlanContentPanel——列由 AI 内容定)；C 类卡片网格(AgentLiveGrid/MCPMarketplace/SkillsDashboard/WikiCardGrid)；D 类容器/骨架；MissionTaskList(共享 list 原语，截断在消费方 render)。ComputeUsageTab 残留的 substring 是图表轴标签预处理(非单元格，R16 不管)。UserModelsManagement line~920 的 truncate+title 是 KeyRequest 横幅非表格。

**push 注意**：working tree 有别的 session 未提交的 backend 改动(agent-invoker 穿透 ai-harness)致 pre-push verify:arch 失败，用户授权本分支 --no-verify 推送，与本改动无关。

单行取舍约定(用户已接受)：副信息收进 tooltip/title 换单行；行高 `py-2.5`；badge 换 StatusBadge(donated 无 pink tone 保留专色为例外)。
