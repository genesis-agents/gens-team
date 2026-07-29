---
name: 后端响应必须解 ResponseTransformInterceptor 一层
description: 所有 frontend 直接 r.json() 的 fetch 必须先解 { success, data, metadata } 一层；setState 数组前必须 Array.isArray 守
type: feedback
originSessionId: 229b0e1c-bec7-47da-a470-14d8b4d071db
---

后端 `backend/src/app.module.ts` 全局注册 `ResponseTransformInterceptor`，把**所有**响应包成 `{ success, data, metadata }`。任何前端直接 `r.json()` 拿原始 response 的代码，必须解一层 `raw?.data ?? raw`。

**Why:** 2026-05-11 BYOK P6-P9 五处新写的 admin fetch 直接 `setProviders(rows ?? [])`，`rows` 是包过的对象不是数组，下游 `.map()` 全抛 `"e.map is not a function"`；用户的 `/admin/ai/models` 反复崩溃 10+ 轮才定位（commit 2f7a64a42）。

**How to apply:**

1. 任何 `await res.json()` 后**禁止**直接 setState：必须 `const raw = await res.json(); const payload = raw?.data ?? raw;`
2. setState 是数组时**必须** `Array.isArray(payload) ? payload : []`，不能 `payload ?? []`（`??` 挡不住对象）
3. 已有的"标准模板"在 `frontend/components/admin/ai-config/AIModelSettings.tsx` 的 `fetchModels` 里：`const result = await response.json(); const data = result?.data ?? result; setModels(Array.isArray(data) ? data : []);`，新代码照抄
4. **不要用** `useApi*` hooks 之外的裸 fetch 在数据驱动 admin/byok 模块写新代码 —— `apiClient.get<T>()` 已经自动解包
5. **元教训**：上线前用 DevTools Network 看一眼真实响应 JSON 结构，比盯着前端 setState 类型猜半天有效得多
