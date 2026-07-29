---
name: agent-latency-tracking-design
description: Agent 端到端时延跟踪系统的最佳实践方案设计，包含四层 span 模型、精度分析和实现路径
type: project
originSessionId: 66027d0d-b849-4cef-acfe-7779227e062c
---

## Agent 时延跟踪系统 — 最佳实践方案

### 2026-04-17 设计结论

**核心原则**：只测能精确测的，不造假数据。

**四层 Span 模型**（对齐 OpenTelemetry）：

- L1 Session Span: 用户触发 → 研究完成
- L2 Step Span: 业务语义单元（搜索、规划、写作）
- L3 Action Span: 原子操作（LLM call / Tool call）
- L4 Provider Span: LLM provider 内部（TTFT = 排队+prefill+首token，不可拆分）

**精度边界**：

- 可精确测（<1ms）：后端内所有操作（Step/Action/工具调用），前端埋点
- 可推算（±5ms）：前端→后端 WAN（心跳校准 RTT/2）
- 不可测：LLM provider 内部排队 vs prefill 拆分

**Why:** 用户要求符合精度的时延测量，需要明确哪些能测、哪些不能测，避免造假数据。

**How to apply:** 工具调用埋点是当前最大缺口（秒级影响），WAN 测量对分钟级研究意义不大但可以做。
