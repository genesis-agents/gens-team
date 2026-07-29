---
name: DeepSeek 模型清单与 base_url
description: DeepSeek 2026-07-24 后 deepseek-chat/reasoner 弃用，主线是 deepseek-v4-flash / deepseek-v4-pro；base_url 含/不含 /v1 都可
type: reference
originSessionId: ae254a5c-ed31-4a19-a1a9-3e170bc3d7c0
---

DeepSeek 官方 API 文档（2026-05-10 截图 21 来源）：

**模型清单（截至 2026-05）：**

- `deepseek-v4-flash` — 主线快模型（正式可用）
- `deepseek-v4-pro` — 主线 Pro 模型（正式可用）
- `deepseek-chat` — **2026-07-24 弃用**（仍指向 v4-flash）
- `deepseek-reasoner` — **2026-07-24 弃用**（二者别名/迁移路径，弃用后改用 deepseek-v4-flash）

**base_url：**

- OpenAI 兼容：`https://api.deepseek.com`（**不含 /v1**）
- Anthropic 兼容：`https://api.deepseek.com/anthropic`
- 同时 `https://api.deepseek.com/v1` 也接受（兼容 OpenAI SDK 把 `/v1` 放进 base 的常见用法）—— 两条 path 都 work，不要因为见到 `/v1` 就反射性删

**易踩坑：**

1. 看到用户配置 `deepseek-v4-flash` / `deepseek-v4-pro` **不要再断言"模型不存在"**。它们是 DeepSeek 正牌模型，2026-05-10 我曾误判（screenshot 21 被用户打脸）。
2. 老规范文档若提到 `deepseek-chat` / `deepseek-reasoner` 当 default，提醒用户 2026-07-24 之后必须迁移到 v4 系。
3. `getDefaultEndpoint` / `PROVIDER_API_DEFAULTS` 现行 `https://api.deepseek.com/v1` 是 work 的（DeepSeek 双 path 兼容），但官方推荐是不带 /v1。不要"修复"它（无 bug）除非有明确证据要换。
