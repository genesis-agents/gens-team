---
name: 改造架构时文件顶部注释必须同步更新
description: 重写服务的内部架构（如从内存改为 DB 真源）后，文件顶部 module-level 注释必须同步更新，否则误导维护者；review 时凡是"实现描述类"注释都要逐字对照新代码
type: feedback
originSessionId: bd5e6ed5-b4a4-484f-b8d5-b68b1b25e668
---

服务文件顶部往往有 module-level 注释描述存储模式、并发策略、依赖关系。架构改造（如"内存 Map → DB advisory lock"）后这段注释最容易被遗忘——开发者改完代码就提交，忘了顶部注释还停留在旧架构。

**Why**：2026-05-11 round 2 评审中 reviewer + arch 两路独立点出 `mission-election-tracker.service.ts:9-13` 注释仍写"in-memory Map / 重启清空 / 当前本地 Map 够用且 0 网络开销"，但实现已是"DB advisory lock + Cache mirror + Local fallback"三层架构。新来的维护者读注释会以为是无状态内存方案，做错决策。

**How to apply**：

1. **改完核心服务后立即重读顶部注释**：把注释里每句话对照新代码逐字校验，凡是与新实现冲突的必改
2. **特别注意 5 类高危词**：
   - 存储方式：`in-memory / Map / Redis / DB` 任一变化必更新
   - 持久化：`重启清空 / 持久化 / 跨进程 / 单进程`
   - 并发：`锁 / CAS / 串行 / 并发安全`
   - 网络：`0 网络开销 / 跨 pod / 单实例`
   - 角色：`无状态 / 有状态 / 真源 / cache / mirror`
3. **PR review checklist**：任何修改 `*.service.ts` 的 PR，文件顶部 30 行注释必须看一眼，确认与新实现匹配
4. **写新注释时避免绝对断言**：尽量说"当前主路径"而非"唯一路径"，给未来改造留余地

**反模式**：commit message 写"重构 X 服务为 DB 真源"但注释仍说"内存 Map 够用"、改完代码不重读注释、新加 `if (this.prisma) {...}` 分支但注释只描述其中一个分支。
