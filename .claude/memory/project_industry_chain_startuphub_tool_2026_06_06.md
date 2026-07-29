---
name: project_industry_chain_startuphub_tool_2026_06_06
description: StartupHub.ai 接成了 engine tool（非 env 直读），key 走 admin ToolConfig
metadata:
  node_type: memory
  type: project
  originSessionId: 4862591b-2b17-46cf-8f32-b3012e5e2dfa
---

产业链分析(industry-chain)的初创/未上市公司画像，由 StartupHub.ai 提供，已在
2026-06-06 (commit 02ab843de) 做成**标准 engine tool**而非 service 内联 fetch：

- 工具：`ai-engine/tools/categories/information/data/startuphub.tool.ts`，
  id=`startuphub-startup`，category=information。已在 `tools.provider.ts` 三处注册
  （import / ALL_TOOL_CLASSES / TOOL_ID_CLASS_MAP）+ category index 导出。
- key 解析走 `policyDataService.getApiKey("startuphub-startup")` → **admin ToolConfig DB
  表**（Secret Manager），不再读 `process.env.STARTUPHUB_API_KEY`。要让线上生效，必须在
  admin 工具管理里给 `startuphub-startup` 配 key（Bearer sk*live*...）。
- 调用方：`industry-chain.service.ts` `getEntityStartup` 经 `toolRegistry.tryGet`，
  **仅对 COMPANY 类型且无 CIK 的节点**启用（美股上市走 SEC/finance-api，不重复）。
- 前端：drawer 里 "初创档案" SectionPanelCard（融资/员工/赛道/总部），controller
  `GET entity/:entityId/startup`。

**Why:** 用户明确要求"这个不应该做成一个工具么"，拒绝 service 内联 fetch。
**How to apply:** 项目里任何外部数据源接入一律按 BaseTool 模式做成 engine tool +
policyDataService 管 key，不要在 app service 里直接 fetch + 读 env。
参见 [[feedback_index]] 里的"复用公共能力，拒绝重复造轮子"。
