---
name: 2026-05-06 未登录闪烁回环 bug 真因
description: /ai-ask 未登录持续刷新闪烁 — apiClient 401→logout→hard reload + Sidebar 无条件打通知 API 两笔 commit 叠加触发
type: project
originSessionId: 4d72a7f4-2b71-4bc9-b97c-fbd5bade4332
---

**Bug**：2026-05-06 用户反馈未登录访问 `/ai-ask` 页面持续刷新闪烁，登录后恢复。

**真因（两笔独立 commit 叠加）**：

1. `dadcf5697` (2026-01-27) `frontend/lib/api/client.ts` 在 401 路径加了 `refreshAccessToken → logout()` 兜底。`logout()` 实现是 `window.location.href = '/'`（hard reload）。
2. `a36bd3051` (2026-05-05 通知系统 W4) 在 `Sidebar.tsx` 顶层无条件调用 `useUnreadNotificationCount()`（`useApiGet('/api/notifications/unread-count')`）。

未登录时调用链：mount → 401 → 没 refresh token → `logout()` → `window.location.href='/'` → home 页 `router.replace('/ai-ask')` → mount 又打 API → 死循环。

**修复**：`frontend/lib/api/client.ts` 401 分支前置短路 — 没有 `accessToken` 直接抛 `UNAUTHENTICATED` 401，不进 refresh→logout 路径。

**Why**：原意是兜底 token 过期，但无 token 用户根本没东西可 logout。`logout()` 又是 hard reload，被全局组件触发就形成死循环。

**How to apply**：

- 401 处理只对"曾经登录"用户做 logout，对从未登录用户直接抛错
- 单独看每笔 PR 都安全，叠加时危险 —— 评审通知/Sidebar 类全局组件改动时必须打开未登录 UI 验证
- 类似模式（hard reload + 全局组件无条件 hook）值得加一道架构守护

**关联 memory**：

- `feedback_e2e_must_visit_ui.md` — 端到端验证必须打开 UI 看渲染
- `feedback_global_component_must_gate_auth.md` — 新增同步沉淀
