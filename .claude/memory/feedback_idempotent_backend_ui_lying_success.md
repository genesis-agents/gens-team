---
name: idempotent-backend-creates-ui-lying-success
description: 后端幂等返回 200 + 前端列表未过滤状态 → UI 假成功（按"撤销"toast 报"已撤销"实际没改变）
type: feedback
originSessionId: 7d028ab3-e546-4f0f-9b44-f6ee8ffbc81d
---

后端 mutation 接口幂等（`if (already X) return existing`）+ 前端列表渲染**所有**记录而不按状态过滤 → 用户按"撤销/删除/取消"，后端 200 OK，toast 报"已撤销"，列表却毫无变化。

**Why**：2026-05-08 admin GrantKeyModal "当前授权" 把 `/admin/key-assignments?userId=X`（无 status filter）所有 KeyAssignment 渲染成行，撤销按钮挂在每行；用户撤销已 REVOKED 行，后端 service 第 137 行 `if (existing.status === REVOKED) return existing` 返回 200，UI 假成功。

**How to apply**：

1. 列表组件**默认**只展示当前可操作状态（如 ACTIVE / PENDING），历史状态走"全部/历史"独立 tab
2. fetch URL 必须显式传 `status=ACTIVE` 不要依赖前端 client 端过滤
3. 操作按钮必须按状态守卫：`{status === 'ACTIVE' ? <RevokeButton /> : null}`，防御 fetch filter 失效场景
4. 后端幂等是好设计（防 retry 双扣），不要为了"让 UI 看出来"改成抛错——错在 UI 不该显示按钮
