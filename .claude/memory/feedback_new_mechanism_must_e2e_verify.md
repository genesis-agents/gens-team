---
name: 新机制必须端到端打通才算落地
description: 加新的横切机制（diversity / tracker / context propagation）只接读端不接生产端 = 死代码；上线前必须 trace 一次完整调用链 + 真跑一遍验证
type: feedback
originSessionId: ae254a5c-ed31-4a19-a1a9-3e170bc3d7c0
---

加新的**横切机制**（diversity scoring / tracker / context propagation / 任何依赖
AsyncLocalStorage 或 setter-wired DI 的服务）时，"接读端"和"接生产端"两件事
**必须同一 PR 完成**，缺任何一端整个 feature 是死的。

典型陷阱（2026-05-10 ModelElectionService.diversityScore 案例）：

- ✅ 加 score 函数 + ✅ 加 tracker 服务 + ✅ DI module wire + ✅ SpecBasedAgent
  读 tracker
- ❌ mission orchestrator 入口端 `KernelContext.run({ missionId })` 没接
- 结果：tracker.getElected(undefined) → [] → diversity score=0 → 机制等同于
  从未写过，但 commit / spec / doc 都显示"已落地"

第二个案例（2026-05-12 Playground mission checkpoint resumable）：

- ✅ Phase 5 checkpoint store 写盘 + ✅ liveness guard 标 failed + ✅
  `GET /missions/resumable` endpoint + ✅ controller spec
- ❌ agent-playground 前端 mission 列表没消费这个 endpoint（只有 topic-insights
  前端接了）
- 结果：用户在 Playground 看到 mission 卡在 running 15min→failed，
  没有任何"上次中断可继续"提示，必须进详情页手点"更新"才能续跑；
  Phase 5 checkpoint 整套机制对 Playground 用户体感 = 不存在

**Why:** 横切机制有 N 个接入点，只看读端 spec 全过 ≠ feature work。Spec mock
了 tracker / mock 了 KernelContext，永远抓不到入口未接的 bug。这种 bug 上线
后用户报"为什么没用"我才回头看，又把"自己留的坑"讲成"考古发现"被打脸。

**How to apply:**

1. 加横切机制前，先 grep `KernelContext.run` / `XxxContext.run` 在每个 ai-app
   是否都有 — 缺一个就是 caller 端要补的入口点
2. 实现完读端 + 生产端后，**手动跑一个真 mission**，在生产端入口加 console.log
   或断点验证 missionId 真到了 tracker；不允许只跑 spec 就 push
3. PR description 必须列出"接入了哪些入口（initial run / rerun / dispatch /...）"
   作为 checklist
4. 写 postmortem 时不要把"自己加的机制没接通"包装成"我发现 X 没有 Y"——
   直接说"我加机制时漏接了 X 入口"，否则会被用户揭穿"你怪工具？"
