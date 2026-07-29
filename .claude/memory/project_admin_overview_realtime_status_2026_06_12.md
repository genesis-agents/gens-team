---
name: project-admin-overview-realtime-status-2026-06-12
description: admin 架构图实时状态 + 租户总览的三个用户拍板决策、前后端 key 契约、useApiGet onSuccess 引用稳定性陷阱
metadata:
  node_type: memory
  type: project
  originSessionId: 81cbebe5-e873-45d9-b27c-8545f6d4922b
---

2026-06-12 架构图（/admin/overview）实时状态化 + 租户状态页（/admin/tenants）重构，用户拍板的三个决策：

1. **租户 = 用户**：项目无 Tenant/Organization 模型（Workspace 是单用户私有），按 userId 聚合；接口按 tenant 语义命名（/admin/tenants/status），未来引入组织只换聚合维度。
2. **实时机制 = 30s 轮询**（非 WebSocket/SSE），用户明确选"先做轮询"；hook 在 `frontend/hooks/domain/useAdminStatus.ts`（后台 tab 不轮询、回前台立即刷新）。
3. **范围 = 架构图 + 租户总览**，16 个子页面状态接入留作后续。

**契约**：`GET /admin/overview-status` 返回 `cards[cardId].metrics` 的 key 必须与 `frontend/lib/features/admin/architecture.ts` 各卡 `statusMetrics[].key` 一致（后端 `overview-status.service.ts`）。改一边必须同步另一边。

**陷阱**：`useApiGet` 把 `onSuccess` 放进 fetchData 的 useCallback 依赖、又把 fetchData 放进自动执行 effect 依赖——传内联箭头函数会无限重复请求，必须 `useCallback([], …)` 固定引用。

**视觉**：用户反馈旧版"难看"，定调"现代/科技/商务/简约"——LAYER_STYLES 已去糖果渐变改白卡 + slate 发丝边 + 单色细轨，层级色只留轨/徽章/强调色；测试要求 badge 类名保留各层色相关键词（architecture.test.ts）。
