---
name: feedback-reuse-existing-capabilities
description: '用户多次强调"充分利用系统既有的能力" — 先 Explore agent 调研 + 列出可复用 service 路径，再设计；不要自己造新 service / wrapper / utility 重复造轮子'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

任何新功能 / 修 bug 涉及"是否需要写新 service / wrapper / utility"时，
**必须先 Explore agent 列出项目里所有相关的既有能力**（含 service 名 + 文件
路径 + 方法签名 + 是否能复用），再决定写新代码。

**Why:** 2026-05-18 ai-radar AI 推荐源质量整改：原计划写新 preflight check
service + 新 YouTube channelId resolver service。Explore 一查发现：

- `CollectorRouter.fanOut` 已经有完美的并发探测能力（含错误隔离）
- `assertSafeHttpUrl` 已守 SSRF
- 拿 collector 自己跑 `since=未来` trick 就能做 preflight（不需要新 HEAD wrapper）
- YouTube @handle resolution 只需 12 行 fetch + regex 内联到 collector
  内部，不需要抽公共 YoutubeMetaService

用户原话："**一定要充分利用系统既有的能力！！！！**"（4 个感叹号）

**How to apply:**

- 写新 service / wrapper / utility 前先 Explore: "项目里有什么可复用的 X
  能力，文件路径 + 方法签名 + 能否直接复用"
- 列出 3 类既有能力 → 评估能不能直接调 / 复用 pattern / 必须新建
- 必须新建时也要复用既有 `assertSafeHttpUrl` / `CollectorRouter` / `ContentFetchService`
  等公共件
- YAGNI 优先：唯一 caller 的 helper 内联到 caller 文件，不抽 service
- 这条与 [[feedback-no-dual-sources]] 配合：避免再造一个"几乎一样但参数微调"
  的双源

相关：[[feedback-no-dual-sources]] [[feedback-look-at-history-before-redesign]]
