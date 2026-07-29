---
name: feedback-tab-split-by-user-semantic-not-impl
description: UI tab 分界用用户语义（是否调外部 HTTP），不要照搬 backend 实现字段（implemented:true/false）
metadata:
  node_type: memory
  type: feedback
  originSessionId: ce962b97-346a-4c98-ae26-9cff763089b3
---

UI tab 分界**永远按用户语义**，不要照搬 backend 的实现细节字段。`implemented:true/false` 是"有没有 BaseTool 类实现"——backend 内部概念，用户视角不可见。

**Why:** 2026-05-11 admin/tools 把 implemented:true → 内置工具 / implemented:false → API 服务工具，导致 federal-register / arxiv-search / hackernews-search 等"调外部 HTTP 但是 BaseTool 实现"的工具错落到内置工具。用户：「政策研究的工具呢搞丢了？？？」「你到底有没有基本原则」。正确分界 B = 是否调外部 HTTP endpoint（不管要不要 key、不管 backend 怎么实现）。

**How to apply:**

1. 设计 tab/分组前先问"用户站在 UI 前期待什么语义？" → 用户语义为先
2. 即使 backend 已有现成字段（implemented / category / type）也要审视它的语义是否=用户语义；不等就别照搬
3. 共享分类真源里每个 category 应该明示 `tabKind` 字段，让"哪类在哪 tab"显式可读，不靠隐式 if 推断
4. MECE 标签要求：互不重复 + 不遗漏；中文 label 统一字数（如 4 字）让 UI 视觉对齐

**反模式**：

- ❌ 看 backend schema 有什么字段就直接拿来做 UI 分界 (`if t.implemented then ...`)
- ❌ 让一个 tool 同名概念在两 tab 都不出现（"政策研究的工具呢"）
- ❌ category 中英混杂、字数不齐（搜索 / 学术研究 / TTS / image-search 这种）
- ✅ tabKind 显式标记 + 4 字统一 label + 一次性 MECE 全表
