---
name: feedback_structuredclone_windows_oom
description: structuredClone(5000+ events) 在 Windows + jest worker 默认堆触发 DataCloneError OOM；buffer/replay 类 read API 用顶层 spread 浅克隆代替（payload 标 readonly 表达契约）
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7c275681-3745-4c0b-b722-fbe6b75dc9e0
---

事件 buffer / replay 类服务的 `read()` API 不要用 `structuredClone(events)` 做隔离防护，尤其当上限 ≥1000 时。

**Why**：Windows + jest worker 默认堆下，`structuredClone(5000 BufferedEvent[])` 触发 `DataCloneError "out of memory"`，pre-push hook 拒推任何含该模块改动的 PR（commit a238185f3 临时 it.skip 后才能推 radar PR）。structuredClone 是 V8 内部 deep walk + 重建，对大数组成本随 N 线性 + 触发 worker GC 风暴。

**How to apply**：BufferedEvent 字段都是 primitive + readonly payload（接口契约：调用方不得 mutate payload），改 `source.map(e => ({...e}))` 顶层 spread 即足：

- 隔离 type / agentId / traceId / timestamp 字段（即测试 `events[0].type = "mutated"` 不污染内部）
- payload 引用共享，但契约约束调用方不 mutate，与 readonly 修饰一致
- 5000 events 跑 0.8s，原结构 OOM
- 适用所有"事件流缓冲 + read 隔离"模式（agent-playground 同类 buffer 同源）

参考：[[feedback_lint_staged_hung_kill_recipe]] 同属 Windows + jest 默认堆陷阱。
