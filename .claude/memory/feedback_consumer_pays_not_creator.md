---
name: feedback-consumer-pays-not-creator
description: BYOK 付费方 = 实际使用功能的人（consumer），不是资源 creator；creator 跟付费无关
metadata:
  node_type: memory
  type: feedback
  originSessionId: ce962b97-346a-4c98-ae26-9cff763089b3
---

跨用户/协作场景下 BYOK 付费判断：**谁使用谁付钱**，付费方 = 实际消费 LLM 功能的人，跟资源 creator 完全无关。

**Why:** 2026-05-11 wiki auto-ingest cron 用 KB.userId（creator user-B）作为 BYOK 上下文，user-B 创建 KB 但从未使用 wiki，把 KB 分享给 admin。admin 触发 wiki ingest 使用 wiki → 付费方应该是 admin。用 creator 当付费方导致 user-B 没配 BYOK 时 cron 每 5 分钟报错刷屏，且 user-B 永远不会出现来配 BYOK，wiki 永远卡死。用户多次纠正"应该是当前用户啊，不是说这个知识库创建的人啊"+"谁消费谁付钱啊"。

**How to apply:**

1. 任何跨用户协作场景下的 BYOK / 配额 / 计费上下文：先问"这次调用是谁在消费"，不是"这个资源是谁创建的"。
2. 消费者识别 = 实际触发功能使用的人（manual trigger / API 调用 / UI 操作），需要从使用历史里取（如 WikiDiff.createdByUserId 非哨兵）；creator 字段（userId / ownerId）只代表元数据归属，跟付费解耦。
3. 自动化任务（cron / scheduler）的消费者：从功能使用历史里挑最近一位用户，验证其 BYOK 有效；没人用过 → 跳过（不偷偷烧 creator BYOK 也不退回 SYSTEM）。
4. 同模式适用：library/explore/research 等"分享给他人"场景，付费方一律是接收方/使用方，不是分享方。

**反模式列表**：

- ❌ `userId: kb.userId` 当 LLM 调用上下文（即使有 fallback / withUserContext 兜底）
- ❌ "owner 优先 → 没 BYOK 再找成员"（owner 角色跟消费无关，不该有优先级）
- ❌ "未授权时静默切到任意 admin BYOK"（admin 隐性付别人账单）
- ✅ 从 WikiDiff / OperationLog / 业务历史里取最近真实使用者作为消费者
- ✅ 没有真实使用历史 → 跳过 + 等待用户首次手动操作建立消费关系
