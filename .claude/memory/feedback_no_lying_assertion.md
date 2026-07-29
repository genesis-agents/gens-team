---
name: 禁止 lying assertion，必须运行时校验
description: 写 backend payload 消费代码时，禁用 (p.X as PrimitiveArray) 强制断言；必须 Array.isArray + type guard 或 zod parse
type: feedback
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

写 backend 事件 payload / API response 消费代码时，**禁止** `(p.X as string[])` /
`(payload.X as Y[])` 这类强制类型断言。即使 backend 注释/类型声明的是 string[]，
实际 emit 的可能是 object[]（如 `[{type, severity, mitigation}]`），强制断言下
`.slice() / .map()` 在运行时直接 throw `TypeError`。

**Why:** 2026-05-06 我自己 4 天前写的 `leader:goals-set` handler `(p.initialRisks
as string[]).map(s => s.slice(0, 50))` 就是这种 lying assertion，让所有走完 S2
的 mission 详情页打开就崩。frontend tsc 全绿、spec 全绿，运行时直接炸 ErrorBoundary。

**How to apply:**

- 任何来自外部边界（HTTP body / SSE event payload / DB JSON column）的数组消费：
  `Array.isArray(x) && x.every(...)` 或者直接走 zod schema parse
- 标准模式：`const items = (raw as unknown[]).map(it => typeof it === 'string' ?
it : JSON.stringify(it))` —— 不假设元素类型
- 已加 lint 拦：frontend/.eslintrc.json 的 `no-restricted-syntax` 拦
  `as <PrimitiveArrayType>`
- 防御机制：events.ts 给关键事件填 zod schema，DomainEventBus.emit() 自动
  safeParse；STRICT_DOMAIN_EVENT_VALIDATION=true 时 throw 让 backend 自己炸而
  不是污染前端
