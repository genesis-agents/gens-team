---
name: notification-system-2026-05-05
description: 通知系统从"前端 mock + 后端孤岛"半实现态打通到事件驱动持久化 + 实时推送
type: project
originSessionId: acdf2e58-962d-41b9-bf28-19d5d36e5773
---

事故：admin 后台广播 + 业务任务完成都不让用户看到通知。

DB 实证（2026-05-05）：

- notifications 表 79 行，admin 广播写入正常（"hello" × 48 / "V2.2.0 Release" × 27）
- 但前端 `/notifications` 页面读 Zustand `useSettingsStore` 本地 mock，从不调 API

四个断层：

1. DB → 用户读端断：page.tsx 不调 API，只读 INITIAL_NOTIFICATIONS
2. 业务任务 → 通知断：notifyResearchCompleted 定义但生产代码零调用；research/playground/writing/office 全不发
3. 实时推送断：NotificationService.eventEmitter.emit("notification.created") 已埋点但**全项目零 listener**，更没 NotificationGateway
4. 旁路断：NotificationsAdminService.broadcastNotification 用 raw SQL INSERT…SELECT，绕过 EventEmitter2 → 即使有 listener 也收不到广播

**Why**：通知系统是一个典型"基础设施齐全（service/controller/preset/DTO 全有）但接线缺失"的半成品。Hooks 层（`frontend/hooks/domain/useNotifications.ts`）连完整的 list/unread/mark/preferences 都齐了，只是页面组件没接进来。

**How to apply**：

- 看到"基础设施定义齐 + 业务零调用"模式时（grep 函数名 → 只有 spec 引用）→ 接线断了，不是逻辑 bug
- 设计跨模块通知时优先**事件驱动**，业务模块零 import 通知服务（B2 而非 B1）
- 实时推送层（gateway）和持久化层（service）必须分清——gateway 监听 EventEmitter2，service 同时落 DB + emit
- raw SQL 旁路（如 broadcast 的 INSERT…SELECT）必须显式 emit 聚合事件，否则绕过 listener

设计落档：`docs/architecture/ai-infra/notifications/notification-system-design.md` 4 层 + 3 Phase 拆分

落地（commit a36bd3051）：

- W1：前端 page.tsx 重写（删 mock 接 hooks）+ Sidebar bell unread badge + settingsStore 删 notifications 块
- W2：`ai-app/notifications-bridge/` 新模块（NotificationBroadcastAdapter 实现 IBroadcastAdapter，accepts `agent-playground.mission:completed`）+ NotificationsBridgeModule onModuleInit 注册到 DomainEventBus
- W3：NotificationGateway namespace=/notifications + JWT handshake + user:${userId} 房间 + admin broadcast emit 'notification.broadcast' 走频道级 io.emit

测试：5 后端 suites / 63 tests + 2 前端 suites / 42 tests，tsc 双端零 error

注意点（踩坑沉淀）：

- ai-infra (L1) 不能依赖 ai-harness (L2.5)，所以 NotificationBroadcastAdapter 落在 ai-app/notifications-bridge 而非 ai-infra/notifications 内
- DomainEventBus 没有 subscribe 方法，监听必须实现 IBroadcastAdapter
- topic-insights/research 用自有 SocketIO emit（research-event-emitter.service），**没上 DomainEventBus**，所以 V1 listener 接不到 research 完成；W4 follow-up 任务
- EventEmitterModule 在 app.module 已经 forRoot()，子模块直接注入 EventEmitter2 即可，不用再 import
- 复用 NotificationType.RESEARCH_COMPLETED 枚举做 mission 完成（避免 schema 迁移）；细分留 W4
- Prisma JSONB 字段 `update.translatedTranscript = null` 写的是 JSON null 字面量而非 SQL NULL；要 SQL NULL 必须用 raw SQL（注意区分）
- lint-staged 提交时会用 Prettier 重排表格列宽和多行回调签名，commit 后看到 system-reminder 提示是正常的

W4 follow-up（已记录在设计文档 §8）：

- topic-insights research / writing / office 完成事件接入（迁到 DomainEventBus 或加二级 adapter）
- quietHoursStart/End 真正生效
- NotificationType 枚举细分 MISSION_COMPLETED / WRITING_COMPLETED / OFFICE_COMPLETED

---

## 2026-05-06 后续修复：路径双前缀漂移（用户实测仍未收到）

**真因**：用户报"系统通知功能仍无效"。Railway prod 实测：

- DB 写库 100% OK：admin broadcast 给 54 个 active 用户每人写一条 UPDATE 通知，本人账号 unread_count=7
- 但前端 unread badge 不显示——`useApiGet('/api/notifications/unread-count')` 拼到 `apiClient.baseUrl=config.apiUrl='/api/v1'` 后变成 `/api/v1/api/notifications/unread-count` → 双前缀 → backend 必 404
- prod curl 实测：错误路径 404 / 正确路径 401（要 auth），二者明确证实根因

**4 个文件 18 处全错**：

- `useNotifications.ts` 6 处（list / unread-count / mark-read / read-all / delete / preferences×2）
- `useAdminCollections.ts` 5 处
- `useAdminStorage.ts` 4 处
- `useAdminModels.ts` 3 处

**Spec 假绿教训**：`useNotifications.test.ts` 6 处也写 `'/api/notifications/...'` 字面值断言，跟错误生产代码"对照"通过，没暴露 bug。这正是 [feedback_e2e_must_visit_ui] 元教训"必须打开 UI 看渲染"——spec 路径字面值断言只能守住"实现没漂移"，**不能守住"路径本身写对了"**。

**修复**：4 文件 18 处删 `/api` 前缀，spec 6 处同步改。type-check 零错，65 tests 全绿（26+39）。

**护栏建议（未实施）**：

- ESLint `no-restricted-syntax` 规则禁止 `useApiGet('/api/...')` / `apiClient.X('/api/...')` 字面值
- 或者 `apiClient.buildUrl` 在 path 以 `/api/` 开头时 console.warn

**Why**：W3 commit a36bd3051 当时只跑了 mock spec + emit 验证，没按 [feedback_e2e_must_visit_ui] 真打开 UI 看 badge，所以路径错从来没被发现。

**How to apply**：

- 接受"通知/广播类系统已打通"的 PR 时，必须实测 UI 上 badge 数字+1，不能只看"emit 正常 / DB 写入 / spec 全绿"
- 任何 useApiGet/apiClient 的 path 含 `/api/` 都是 100% bug 信号——baseUrl 已经包含

---

## 2026-05-06 W5：清理后 badge 不刷新 + ESLint 护栏

**问题 1：mark/delete 后 Sidebar badge 不更新**

- useNotificationActions 的 markAsRead/markAllAsRead/deleteNotification 调成功后**只 setLoading(false)**，没有任何刷新机制
- Sidebar 的 useUnreadNotificationCount 在另一个组件树，本地 useApiGet cache 不会自动失效
- 跨组件协调**只能靠全局信号**

**修复**：新建 `frontend/lib/notifications/notification-events.ts` lazy singleton EventTarget

- `emitNotificationMutated()` —— 三个 action 调成功后 emit
- `onNotificationMutated(listener)` —— useUnreadNotificationCount + useNotifications 在 useEffect 监听 → refresh
- SSR 安全（typeof window 兜底）；0 依赖

**为什么不用 SWR/Zustand 现成的**：单一信号语义，纯事件不带状态。Zustand 是状态管理，过度设计；EventTarget 是浏览器原生 + 模块级 singleton，最少代码原则。

**问题 2：同类 bug 缺护栏**

- 加 ESLint `no-restricted-syntax` 2 条规则到 frontend/.eslintrc.json：
  - `useApi(Get|Post|Put|Delete|Mutation) > Literal[value=/^\/api\/(?!test)/]`
  - `apiClient.X > Literal[value=/^\/api\/(?!test)/]`
- 用 `(?!test)` 负向先行排除 spec mock 的 `/api/test` 字面值
- 全 frontend 扫描 0 触发（生产代码已修干净，无遗漏）
- probe 5 错样本全捕获

**commit**：

- 688e5a831 通知 path 修复（4 文件 18 处 + spec 6 处）
- b5e1fb0be ESLint 护栏（.eslintrc.json）
- W5 emit/listen 改造（待 commit）

**How to apply**：

- 跨组件 mutation 协调首选 EventTarget 模块级 singleton（lazy + SSR 安全）；除非状态真需要共享，否则不上 Zustand/Redux
- ESLint selector `[value=/regex/]` 支持 esquery 正则属性匹配；JSON 字符串里 `\\` = `\`
- 多 session 并行时永远 pathspec 精确，绝不 git add -A / git restore --staged 全清

---

## 2026-05-06 W6：mission completed 通知 actionUrl 双错 → 404

**真因**：DB 实测 `action_url = '/playground/missions/{id}'`，但前端真实路由 `/agent-playground/team/{id}`，双错（根路径 + 路由段）。

**修 2 处代码**（commit `3752df9ec`）：

- `NotificationBroadcastAdapter:114` `appBasePath: '/playground'` → `'/agent-playground'`
- `NotificationPresetsService:130` `${appBasePath}/missions/${id}` → `${appBasePath}/team/${id}`
- prod DB 用 SQL UPDATE REPLACE 修了 1 行旧 url

**spec 假绿**：spec 字面值断言 `'/playground/missions/m1'` 跟错代码"对照"通过——又是同 useNotifications.test 同模式的"路径字面值断言不能守路径写对"陷阱。

**新护栏建议**（未实施）：

- backend e2e 启动一次 mission 完成流，访问 actionUrl 看真实 status code
- 或：path 字面值断言改成 "包含真实路由分段"（matchObject `expect.stringContaining('/team/')`）

**How to apply（重申）**：

- 通知/路由/链接类系统接受 PR 时，spec 必须用"实际访问 endpoint"而非"字面值匹配"，否则 spec 与生产代码同时漂移、互相对照通过、bug 永不暴露
- 合并 fronetend/backend 的"前端路由 ↔ 后端 actionUrl"约定时，必须有一处单一权威（如生成器函数 / 共享常量），别让两边各自硬编码
