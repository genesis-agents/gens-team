---
name: feedback_multi_reviewer_must_separate_concerns
description: 5 路评审分工必须正交（harness 复用 / 架构边界 / mission 生命周期 / SKILL.md / DI），重叠会让 P0 票数虚高、漏点同时存在
metadata:
  node_type: memory
  type: feedback
  originSessionId: ca6e8346-b1b3-4b70-92d3-8a333f6e80a3
---

# 多路评审分工正交，禁止重叠

发起 5 路并行评审时，5 个 reviewer 各自必须锁定**互斥**的关注域：

- **A 复用度**：是否真用 MissionPipelineOrchestrator / RuntimeShellFramework / facade 现成基元，而非自写
- **B 架构边界**：facade 穿透 / 反向依赖 / 业务名漏入 engine / 模型名硬编码（运行 grep 验证）
- **C 生命周期**：DomainEventRegistry / Gateway / event-buffer / mission_completed emit 位置 / abort 透传 / dedup
- **D 内容产物**：9 SKILL.md / agent.ts 是否硬编码模型、品牌、emoji
- **E 模块接线**：providers / imports / exports / 循环依赖 / DTO 装饰器 / 危险断言

**Why**：上次 ai-social round-1 用这组分工正好命中：A 给 4 P0 集中在 orchestrator，C 给 6 P0 集中在 lifecycle，互相不撞票；D 只给 2 P1 cosmetic，E 给 3 P1 DTO 细节。**互斥**让总票数真实（实际 13 P0/P1 全独立），不会虚高也不会漏。

**反例**：若让 A 同时管 facade 边界 + orchestrator + DI，会有"A 报 orchestrator 时漏了 DTO，E 又重复报"的浪费；或两个 reviewer 都报"WebSocket 缺失"导致一个 P0 被记两遍误判严重度。

**How to apply**：

- 写每个 reviewer prompt 时**先列禁止区**："你不审 X，X 由 reviewer Y 负责"
- prompt 强制要求"已读文件清单"，让我能交叉验证覆盖率
- 共识投票必须独立给（YES/NO），不允许"参考其他 reviewer 后再投"

Links: [[feedback_consensus_must_iterate_to_all_yes]] · [[feedback_5_reviewer_parallel_audit]]
