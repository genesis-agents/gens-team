---
name: feedback-refresh-create-must-be-tx-atomic
description: refresh/create RunSlot 类竞态必须 prisma.$transaction 原子 acquire，5s dedup window 不够防多请求并发拿同一 slot
metadata:
  node_type: memory
  type: feedback
  originSessionId: eb9df724-2242-4336-8d27-58151c093da9
---

任何"创建一个 long-running run / job / mission 行 + 同时标记排他锁"的 endpoint，必须把"查 active run → 没有就插 row"放进 `prisma.$transaction(async tx => { ... })` 内原子完成，不能用"先 findFirst → 再 create"两步走，哪怕外面套了 dedup window。

**Why**：AI Radar PR-R2 `RadarRunController.refresh` Round 1 security reviewer P0：dedup window 是"5s 内同 topic 不重复入队"，但**两个并发请求几乎同时到 controller**时，两边都 findFirst 返回 null → 两边都 create RUNNING → 双跑 LLM 烧 budget + 行级竞争。dedup window 只防快速连点，不防真正并发。R6 commit `362ef83f4` 改成 `$transaction(async tx => { const active = await tx.radarRun.findFirst(...); if (active) throw; return tx.radarRun.create(...); })` 一次握死。

**How to apply**：

- 任何 controller 路由 = "查唯一 active 资源 + 没有就建一个" → 全程在 `$transaction` 里，不能拆两步
- 同样适用：`/missions/start` / `/jobs/launch` / `/reports/generate` 等
- 区别于 `feedback_create_endpoint_needs_dedup_window`：dedup window 是表层（防快速连点 UI），$transaction 是底层（防真并发数据竞争）。两层都要，缺一不可
- 检查清单：搜 `findFirst.*status.*RUNNING` 后紧跟 `create.*RUNNING`，中间没 `$transaction` 包裹 = bug
- spec 必须 `Promise.all([refresh(...), refresh(...)])` 真并发，顺序 await 调用掩盖 race（见 [[feedback_shared_cache_must_concurrent_spec]]）
