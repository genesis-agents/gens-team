---
name: mock 自我印证型 spec 是假绿
description: spec 让 mock 返回值 X，断言又用 X，配合 objectContaining 宽松匹配 → 实现改写也能过，spec 没有真断言力
type: feedback
originSessionId: bd5e6ed5-b4a4-484f-b8d5-b68b1b25e668
---

spec 反模式：mock 让某依赖返回 `{ id: "diff-1" }`，被测实现读这个 id 写到下游，断言又写 `{ lastAppliedDiffId: "diff-1" }`，且用 `expect.objectContaining({...})` 宽松匹配。这种 spec 是 mock 自我印证 —— 实现改成从入参读、从硬编码常量读、甚至 undefined（被 objectContaining 漏掉），spec 依然过。

**Why**：wiki-diff.service.spec.ts 中 `wikiDiff.findUnique` 返回 `id: "d1"`，`tx.wikiDiff.update` mock 默认返回，断言 `lastAppliedDiffId: "diff-1"` —— reviewer 和 tester 两路独立指出"实际值不可知，objectContaining 可能假过"。spec 看起来覆盖了 refreshDocumentCoverage 调用，实际什么都没真验证。

**How to apply**：

1. 断言值与 mock 输入值必须**不同**：mock 让 `findUnique` 返回 `"diff-xyz"`，断言验证 `lastAppliedDiffId: "diff-xyz"`，证明数据从 mock 链路真的传到了断言点
2. 链路上每个中转 mock（findUnique → update → 业务字段）都用独特值，避免一个常量贯穿全流程
3. 优先用 `toEqual` 精确匹配；`objectContaining` 只在确实有不关心字段时用，且不关心字段必须在测试名里说明
4. review spec 时若发现"mock A 返回 X、断言又是 X、`objectContaining`"三件套，必判假绿
