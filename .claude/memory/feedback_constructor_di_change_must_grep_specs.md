---
name: constructor-di-change-must-grep-specs
description: "NestJS service constructor 新增 inject 必须 grep 所有 `new Service(` 直接构造点修参数，不只靠 testing module"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f4887b10-a190-477c-87ef-92a946e335e1
---

NestJS service constructor 新加 @Inject 参数后，**testing module providers 列表**只覆盖
通过 `module.get()` 拿实例的 spec；spec 里**直接 `new Service(...)`** 的就绕过 DI，
新加参数会 undefined / `this.xxx is not a function`。

**实例**：NotificationDispatcher 加 DispatcherQuotaService inject 后，
notification-dispatcher.spec 有 3 处 `new NotificationDispatcher(siteCh, prefSvc, resolver, emailCh?)`
直接构造的 test，第 4 参数（quotaService）漏 → 跑 `quota.check is not a function`。

**Why**：DI 容器只在 `Test.createTestingModule()` 里跑；spec 自己 `new` 绕过容器，
是为了精确控制 channel 注入顺序等场景，但代价是 constructor 变更要手维护。

**How to apply**：

- service constructor 变更后 grep `new ${ServiceName}\(` 全仓
- 同时更新 testing module providers + 所有直接构造点
- spec mock 至少要让新 inject 的 method 不 throw（mockReturnValue / mockImplementation）
- 优先用 module.get() 而非直接 new，仅"测试特殊注入顺序"才直接 new
