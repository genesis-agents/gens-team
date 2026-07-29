---
name: project_self_driven_durable_transport_2026_06_04
description: self-driven Agent Team 从 SSE-over-POST 长连重构为 durable socket+replay 解耦传输（Stage 0-5 全合 main）
metadata:
  node_type: memory
  type: project
  originSessionId: 1192a7bc-0e81-42f9-9a96-bf85e85b7a6e
---

Self-Driven Agent Team（AI Ask 的 `self-driven-team` 伪模型）根本性重构，5 阶段全合 main（commit e4686ab9e..50933f014，2026-06-04）。

**根因**：原设计把整个 mission（plan 估时 45min + plan_confirm HITL 门挂 10min）流式跑在**一条 SSE-over-POST 连接**上。Railway 边缘是 HTTP/2，响应里 `Connection: keep-alive` 是 RFC 9113 禁止的 connection-specific 头 → `ERR_HTTP2_PROTOCOL_ERROR`，从 t=0 起一个事件都送不到浏览器 → 前端一直 "thinking..." → network error。**任何代理都撑不住 10min/45min 长连**，删头/缩心跳只是治标。

**正确架构**（照搬 playground 已在产运行的 durable mission 模式，非自造）：执行与连接彻底解耦。

- Stage 0 止血：删非法 `Connection` 头 + 修 `getGreeting()` 的 `new Date().getHours()` 渲染期 hydration #418/#423（UTC vs 本地时区）。
- Stage 1：`ask_self_driven_mission_events` 表 + `SelfDrivenMissionEventBuffer`(extends BusinessTeamEventBufferFramework，**chunk 事件 socket-only 不落库**防表爆) + `SelfDrivenEventRelay`(extends EventRelayFramework, ns `self-driven`)。13 个 `self-driven.*` 事件类型必须在 EventRegistry 注册否则 EventBus 丢弃。
- Stage 2：`ask_self_driven_missions` 表(durable ownership+终态，跨 pod replay/join 鉴权必需) + `SelfDrivenMissionDispatcher`(ai-app)驱动**未改动的** runner.run() 生成器→每事件 relay→MissionLifecycleManager.finalize 首写赢仲裁。**driver 放 ai-app 不改 harness runner**，更 MECE。
- Stage 3：POST `/ask/self-driven/run` fire-and-forget <1s 返回 + Socket.IO ns `self-driven`(afterInit 注册 SocketBroadcastAdapter) + GET `/replay/:id?since`(IDOR) + owner POST `/missions/:id/approve`。**审批关键**：awaiting_approval 的 requestId 恒为空且 /admin/approvals 是 admin-only，原审批只能靠 10min 超时自动放行；新方案让 HITL gate 多写 `approval:mission:{missionId}→requestId` 映射，owner 按 missionId 解析。删旧 SSE。
- Stage 4：前端 `useSelfDrivenChat` 复用既有 `useMissionStream` 思路——/run→水合 replay→join 房间→onAny 解包 envelope.payload→dedupe(type,timestamp)→断线 gap-fill+轮询兜底。审批条按 missionId。
- Stage 5：MissionLivenessGuard 孤儿检测。**坑：HITL 门期间 runner 不发事件，若按 5min 事件 stale 会误杀等待审批的 mission** → dispatcher 跑独立 30s 心跳，staleThreshold 设 12min(>10min 门)，只有 pod 真死(心跳停)才 markFailed+journal 终态事件让 UI 解卡。+ contract spec 锁死不得再引入 Connection 头/长连 SSE。

**采纳的默认值（openQuestions，可改）**：chunk 仅 socket 不落库；missions 表存 ownership+status；owner-scoped approve 端点；auto-approve 维持 10min；并发上限 3；v1 = durable events+orphan detection，**不做半程崩溃 resume**(playground 也没做)。

**未验证**（我无浏览器，需人工在 Railway HTTP/2 实测）：socket 重连、刷新中途 replay 续传、审批端到端、长任务存活。迁移 `20260610_add_ask_self_driven_mission_events` + `20260611_add_ask_self_driven_missions`（CREATE TABLE IF NOT EXISTS，排在 20260609 之后）。

技法/坑：bash 工具不是 PowerShell，`@'...'@` here-string 无效用多 `-m`；commitlint body ≤100 字符；eslint 类型感知吃满 4G 堆需 `NODE_OPTIONS=--max-old-space-size=8192`；本会话 3 个 `lint-staged automatic backup` stash 是**别的 session** office/agents 工作残留**勿删**。承接 [[project_facade_barrel_boot_crash_class_2026_06_03]]
