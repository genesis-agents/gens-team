---
name: project-engine-inversion-port-pattern
description: engine ↔ ai-app 反转端口（Dependency Inversion）标杆模式 —— SKILL_PROVIDERS + SOCIAL_PUBLISH_PORT 两例，让 engine tool 委托业务模块能力又不违反单向依赖
metadata:
  node_type: memory
  type: project
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

# Engine ↔ ai-app 反转端口模式（2026-05-15 新增第二案例）

## 场景

engine 层的 tool / service 需要业务能力（ai-app 内的浏览器自动化 / DB 写入 / 队列编排等），但 engine 不能 import ai-app（ESLint + jest 双重锁死单向依赖）。

## 标杆模式（已落两例）

### 例 1：SKILL_PROVIDERS（2026-05-01 PR-X-K）

- `ai-engine/skills/runtime/adapters/engine-skill-provider.adapter.ts` 实现 harness 的 `ISkillProvider` 端口
- harness `SkillActivator` 通过 `@Optional() @Inject(SKILL_PROVIDERS) providers?: readonly ISkillProvider[]` 解析
- harness 在 `harness.module.ts` 用 `useFactory: (engineProvider) => [engineProvider]` 绑定
- 方向：engine 向 harness 暴露能力（harness ← engine，符合 harness > engine 单向）

### 例 2：SOCIAL_PUBLISH_PORT（2026-05-15）

- `ai-engine/tools/categories/integration/abstractions/social-publish.port.ts` 定 token + interface
- engine tool（wechat-mp-publish / xhs-publish / social-publish-status）`@Optional() @Inject(SOCIAL_PUBLISH_PORT)` 注入
- `ai-app/social/engine-bridge/social-publish.adapter.ts` 实现接口
- `ai-app/social/engine-bridge/social-engine-bridge.module.ts` `@Global()` 绑定 token → adapter
- 方向：ai-app 向 engine 暴露能力（engine ← ai-app，但 engine 只看 Symbol token + 接口）

## 关键实现要点

1. **token 用 Symbol**：`export const SOCIAL_PUBLISH_PORT = Symbol("SOCIAL_PUBLISH_PORT");` —— 不用字符串避免命名冲突
2. **接口与 token 同文件**：types + interface + token 一起放 `abstractions/<name>.port.ts`
3. **`@Optional()` 注入**：未绑定时 tool 返回结构化失败（`success: false, error: "port not configured..."`），不抛 DI 异常，让 engine 在没装实现模块的部署里仍可启动
4. **`@Global()` bridge module**：bridge module 是 ai-app 一侧 thin module，只声明 `{ provide: TOKEN, useExisting: ConcreteAdapter }` —— @Global 让 token 对 engine 全局可见，engine 不需要 import bridge
5. **bridge module 导入 AiSocialModule（含 adapter providers）**：避免循环 —— adapter 与依赖（如 PublishExecutor）同 module scope
6. **facade 暴露 token**：ai-app 实现侧通过 `@/modules/ai-engine/facade` 拿 token + 接口（jest layer-boundaries.spec 只允许 ai-app 走 facade / abstractions/）
7. **AppModule 串接**：root `app.module.ts` 同时 import 业务 module + bridge module —— bridge 通过 forwardRef 拿 adapter

## 长任务委托技巧

发布是 30-120s 级长任务，engine tool 同步 doExecute 会卡爆 budget。模式：

- 端口签名返回 `PublishJobReceipt { jobId, status: 'queued' }` —— 立即返回
- 实现侧 `void this.executor.execute(jobId).catch(...)` 真 fire-and-forget
- 配套查询 tool（`social-publish-status`）查 jobId → DB 状态 → 映射为统一 PublishJobStatus
- jobId 直接复用业务行 id（如 SocialContent.id），不另设 job 表
- getPublishStatus 必须按 ctx.userId 过滤防跨用户读

## 反模式（不要这样做）

- ❌ engine ToolRegistry.register(toolInstance) 推送式 —— 失去 NestJS DI scope 管理
- ❌ 端口实现塞在 engine 一侧（"反正都是 hidden"）—— 等于把业务逻辑挪到 engine
- ❌ `@Global` 整个业务 module —— 会让 module 内所有 service 全局可见，污染 DI 名空间
- ❌ 把 PrismaModule import 进 bridge 然后让 bridge 自己实例化 adapter —— 拿不到 PublishExecutor 等同 module 的依赖

## 落地清单（写第三例时照抄）

1. `ai-engine/<bounded-context>/abstractions/<name>.port.ts` —— token + interface + input/output types
2. `ai-engine/<bounded-context>/abstractions/index.ts` —— barrel
3. `ai-engine/facade/index.ts` —— re-export token + types（ai-app 一侧通过 facade 拿）
4. engine tool / service 用 `@Optional() @Inject(<TOKEN>)` 注入
5. `ai-app/<domain>/engine-bridge/<name>.adapter.ts` —— 实现接口
6. `ai-app/<domain>/engine-bridge/<domain>-engine-bridge.module.ts` —— `@Global` 绑定 token
7. `ai-app/<domain>/<domain>.module.ts` providers + exports 加入 adapter
8. `app.module.ts` imports 加入 bridge module
9. spec：tool 端 mock 实现 SocialPublishPort 接口；adapter 端 mock PrismaService + Executor

## 验证

- `npm run verify:arch` 必须过（layer-boundaries.spec 拦截 ai-app → ai-engine 内部）
- mock 输入 ≠ 断言值（参见 [[feedback-mock-self-confirming-assertion]]）
- tool 端覆盖 4 个分支：未绑定 / 缺 userId / 正常委托 / 调用方传 accountId
