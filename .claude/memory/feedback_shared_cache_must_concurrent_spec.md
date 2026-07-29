---
name: shared cache 多 pod 场景必须并发 spec
description: 当跨实例共享 cache 时，spec 必须用 Promise.all 真并发而非顺序调用，否则会掩盖 read-modify-write 丢更新 bug
type: feedback
originSessionId: bd5e6ed5-b4a4-484f-b8d5-b68b1b25e668
---

引入 `CacheService` / Redis 让多 pod 共享状态时，spec 中"跨 instance 共享"测试必须用 `Promise.all` 真并发发起两个写操作，断言两个写都体现在最终状态。顺序调用（A 写完再 B 读再 B 写）会让 read-modify-write 看起来正确，但实际多 pod 并发场景下后写覆盖先写。

**Why**：mission-election-tracker.service.ts 引入 cache 持久化后，spec "shares reservation history across tracker instances via cache" 是 trackerA.reserve → trackerB.reserve 顺序操作，掩盖了 `ensureLoadedEntry` cache.get → modify → cache.set 无 CAS 的丢更新缺陷。4 路评审中 reviewer / arch / tester 三路独立点出这个问题，但 spec 假绿没拦住。

**How to apply**：

1. 任何 `cache.set` / Redis write 类操作，spec 必须有一个 `Promise.all([ instanceA.write(), instanceB.write() ])` 用例
2. 断言最终状态包含两个写（merge 行为）或显式承认丢更新（best-effort 降级 + 注释锁定）
3. 实现侧若做不到原子合并，必须暴露 `setIfVersion` / Lua script / append-only 接口，spec 验证乐观锁冲突自旋
4. 顺序 spec 只能验证基础读写正确，不能当并发证据；review code 时遇到"shares X across instances"必须看是不是 `await A; await B` 顺序写法
