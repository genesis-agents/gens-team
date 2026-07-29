---
name: 不要硬编码 provider 元数据
description: provider endpoint / testModel / capabilities 走 DB ai_providers 真源 + 获取按钮动态拿 modelId；TS 常量字典只允许做"DB 未 seed"的迁移期 fallback，禁止往里加新行
type: feedback
originSessionId: ae254a5c-ed31-4a19-a1a9-3e170bc3d7c0
---

provider 元数据（endpoint / api_format / test_model / capabilities）必须走 DB `ai_providers` 表（migration 20260505b 建的，admin 可在 UI 维护）；
模型 ID 走前端"获取"按钮调 provider `/v1/models` 动态拉。

**Why**：

- 仓库 2026-05-05 的 PR-1 已经把 `user-api-keys.service.ts:PROVIDER_DEFAULTS` 11 个硬编码搬到了 DB `ai_providers` 表，迁移 SQL 注释明文写"替代 hardcoded PROVIDER_DEFAULTS 字典"
- 添加新 provider（如 doubao / zhipu / kimi）应该写 SQL seed 而非改 TS 常量；admin 还能在 runtime 加 scope=user 的自定义 provider
- 模型 ID 是用户配 BYOK 时实时从 provider API 拉（"获取"按钮），跟"硬编码若干默认模型"反向

**How to apply**：

- 修 BYOK / 测试 / 探活 / 健康检查 等需要 provider 配置的代码时：先查 `prisma.aIProvider.findFirst({ where: { slug, scope: 'system' } })`
- `provider-defaults.ts` 那份 TS 常量只在 DB 未 seed（首次启动 / 失败回退）时兜底，**禁止往里加新条目**——新 provider 走 SQL migration seed
- 如果发现某 service（如 `provider-model-catalog.service.ts`）查的字段名错了（schema 是 `slug` 但服务写 `provider`），修字段名而不是绕开
- 用户的反应："为什么都是硬编码？？？？？不应该是动态获取的模型ID吗"——意思是模型 ID 通过"获取"按钮拿，provider 元数据通过 DB 拿，两层都不该写死在 TS 里
