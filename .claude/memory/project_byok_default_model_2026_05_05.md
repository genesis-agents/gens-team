---
name: byok-default-model-fix-2026-05-05
description: BYOK 默认模型选错的真根因 — 8 处 dropdown 用 `find(isDefault) || [0]`，没把 user-key 推队首；commit da7804613 用共享 helper 统一
type: project
originSessionId: acdf2e58-962d-41b9-bf28-19d5d36e5773
---

事故：用户配了 BYOK key（如 xai），但 papers / youtube / 知识库 / 管理后台 dropdown 默认选中的还是 admin 标记的 `isDefault` 系统模型（system OpenAI）。发消息时 KeyResolver 严格 BYOK 模式（commit 0635c70d9 删了 SYSTEM fallback）找不到用户 OpenAI key 直接报错。截图里所有模型也无任何 `[My Key]` 视觉标记，让用户误以为全走系统 key。

**Why**：8 处使用 `useAIModels` 的页面，每个都 inline 写了 `aiModels.find((m) => m.isDefault) || aiModels[0]`，没把 `isUserKey: true` 的模型推到队首。AI Ask 之前已写对（`isUserKey > isDefault > [0]` + 绿色 `My Key` chip），但模式没共享出去。后端 `getEnabledModelsForFrontend` 正确给 BYOK 模型打了 `isUserKey: true` 标记，runtime KeyResolver 也正确 PERSONAL → ASSIGNED 优先 — 整条链路只有 dropdown 默认值 + UI 标记两步是断的。

**How to apply**：

- 看到 `find((m) => m.isDefault) || [0]` 默认值模式，**永远改成 `pickPreferredModel(models)`**（在 `frontend/hooks/features/useAIModels.ts`），优先级 isUserKey 命中 > 命中里的 isDefault > admin default > [0]
- 看到 `<option>` 渲染 `{model.name} ({model.provider})`，**永远加 `{model.isUserKey ? ' · 我的 Key' : ' · 系统 Key'}`** 后缀（option 不能放 component，只能纯文本）
- 自定义 button picker 用 `<ModelBadges model={model} />` 共享组件（`frontend/components/common/ModelBadges.tsx`），渲染绿色 My Key chip
- 新增 dropdown 时的 checklist：(1) pickPreferredModel 默认 (2) isUserKey 文字/chip 标识 (3) 是否需要 modelType 过滤
- 反模式：每个页面再 inline `find(isUserKey) || find(isDefault) || [0]` —— 已经有共享 helper，重复就漂移

落地（commit da7804613）：

- 8 处 sweep：app/page.tsx + app/explore/youtube/page.tsx + app/admin/workspace/page.tsx + components/explore/core/ExploreContent.tsx + components/ai-image/ImageGenerator.tsx + components/ai-teams/SummaryDialog.tsx + components/ai-teams/TopicSettingsDialog.tsx + app/ai-ask/page.tsx + components/explore/components/AIModelSelector.tsx
- 共享：useAIModels.ts 加 `pickPreferredModel` + 7 个 vitest spec；新建 `components/common/ModelBadges.tsx`
- 后端不动：KeyResolver 已严格 BYOK；simple-chat userId 通过 RequestContextMiddleware 解 JWT 设到 AsyncLocalStorage，ChatFacade `request.billing?.userId ?? RequestContext.getUserId()` 兜底 OK；显式传 billing.userId 需要带 moduleType/operationType 必填字段，不属本次范围

测试：vitest 26 specs 全绿（含 7 新增 pickPreferredModel）；tsc 双端零 error。
