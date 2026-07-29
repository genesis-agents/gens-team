---
name: 全局组件 hook 必须 gate auth
description: Sidebar/MobileNav/AppShell 这类对未登录用户也渲染的组件，新增的 useApiGet/socket 必须 gate token，否则可能引发 401→logout 反弹
type: feedback
originSessionId: 4d72a7f4-2b71-4bc9-b97c-fbd5bade4332
---

**规则**：在 `Sidebar` / `MobileNav` / `AppShell` / `Providers` 这类**对未登录用户也渲染**的全局组件中新增 `useApiGet`、`useApiPost`、`socket.io` 等"挂载即打 API"的调用时，必须显式 gate token：

```tsx
const { user } = useAuth();
const { count } = useUnreadNotificationCount({ enabled: !!user });
// 或
if (!user) return null;
useNotificationSocket(); // 现在 socket 已经内部 gate token，是好示范
```

**Why**：2026-05-06 通知系统 W4（commit `a36bd3051`）把 `useUnreadNotificationCount()` 放进 Sidebar 顶层无条件调用，叠加 `apiClient` 401→`logout()` 路径（commit `dadcf5697`，`logout` 是 `window.location.href='/'` hard reload），未登录用户首次落地立刻 401 → reload → 又 mount → 又 401 → 死循环闪烁。两笔 PR 单独看都安全，叠加爆炸。

**How to apply**：

- review 通知 / 用户中心 / 状态徽章这类未登录无意义的功能时，特别检查它的入口组件是否对未登录用户也渲染
- 看到 `Sidebar.tsx` / `AppShell.tsx` / `Providers.tsx` 顶层新增 hook 调用，必问"未登录会触发 API 吗"
- 端到端验证一定要 logout 后开 UI 看一下，不能只验证已登录路径
- 修复 `useNotificationSocket` 是好范本：内部直接 `if (!tokens?.accessToken) return;`，调用方无心智负担
