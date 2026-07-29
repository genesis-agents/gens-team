---
name: verify-field-names-both-ends
description: 跨文件字段名修 bug 时必须 grep 两端验证字段名一致，禁止 type assertion 撒谎给 TS
metadata:
  node_type: memory
  type: feedback
  originSessionId: 494c61c5-c748-4a7c-a8fd-f4d7cda538da
---

修跨文件传递数据的 bug 时（如 service.method() 返回某 snapshot，调用方读字段），**必须明确 grep 两端字段名一致**。

**Why**: 2026-05-19 social budget 闸"永远 0"bug，我看到 framework 给 pool 设置 `maxCostUsd: maxCredits * 0.002`，没去 verify dispatcher 实际读了什么字段，就把 MAX_CREDITS_BY_PROFILE 数字调高 commit。用户截图 prod 仍然 fail 后再排查，发现 dispatcher 用了字段名 typo：

pool.snapshot() 返回：`{ poolCostUsd, poolCostRemaining, poolTokensUsed, poolTokensRemaining }`
dispatcher 读的：`snap.remainingCostUsd ?? snap.maxCostUsd ?? snap.poolCostUsd` ← 三个全错

dispatcher 用 `as { remainingCostUsd?: number; maxCostUsd?: number; poolCostUsd?: number }` 手动 assert 类型，绕开了 TS 编译错误。Type assertion 让 TS 闭嘴 = 撒谎给编译器，运行时全 undefined。

**How to apply**:

- 修跨服务 / 跨文件数据传递 bug，**第一步**永远是 grep 读取方代码的具体字段名，找到对应的写入方 / 返回类型定义文件，对比字段名是否完全一致
- 看到 `obj as { fieldA?: ...; fieldB?: ... }` 这种 inline assertion，**必须警惕** — 这是 TS 编译器警告被强行压制的位置，运行时大概率出错
- 配置数值类的 bug（如"超额 / 不足"），先 grep 字段是不是真的被读到，再调数值。否则改配置等于盲改
- "测试通过 + type check 通过"不等于"运行时正确" — type assertion 让 TS 看不到 typo

相关：[[feedback_frontend_bug_check_network_response_first]] 端到端追踪 / [[feedback_systematic_analysis]] 系统性分析
