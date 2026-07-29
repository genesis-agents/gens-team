---
name: feedback-optional-di-must-wire-module
description: 用 @Optional() 注入新依赖时必须当场配套 module.imports；spec mock 能掩盖 DI 容器没有 provider 的事故，prod 才炸
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6f88d14d-3d90-467a-b940-ff29c27662ce
---

## 反模式

```ts
// Service 端
constructor(
  @Optional() private readonly keyResolver?: KeyResolverService,  // ← 标 Optional
) {}

async someMethod() {
  if (!this.keyResolver) {
    throw new ServiceUnavailableException("KeyResolverService 未注入");  // ★ prod 会跑到这
  }
}
```

```ts
// Module 端忘了：
imports: [
  PrismaModule,
  SecretsModule,
  // ↑ 没加 KeyResolverModule
],
```

```ts
// Spec 端 mock 注入 — 永远过：
{
  provide: KeyResolverService,
  useValue: mockKeyResolver,  // ★ spec 拿到 mock，prod 拿到 undefined
}
```

→ 类型检查过、spec 全绿、prod 第一次接到用户请求就 throw。

## 根因

- `@Optional()` 让"DI 容器找不到 provider" 这种**配置错误**降级为"运行时 undefined"
- spec 用 `Test.createTestingModule({ providers: [{provide: X, useValue: mock}] })` 绕过 module 导入图，永远拿到 mock
- typecheck 只看类型签名，不看 DI 容器实际能不能解析

→ 三层防护 (type / spec / build) **全部失效**

## 正确做法

**Why**：2026-05-12 EmbeddingService 加严格 BYOK 改造（bdd0fc791），spec 39 项全绿、type-check 过、pre-push 5 项验证过，prod 首个用户请求就 throw "KeyResolverService 未注入"。补丁 c0eed7c71 在 AiEngineKnowledgeModule.imports 加 KeyResolverModule。

**How to apply**——任何用 `@Optional()` 注入新跨模块依赖时：

### 1. 写 service 时同步开 module.ts

`@Optional() private readonly X?: XService` 出现的同一个 PR/commit 里，**必须**：

- 找到 service 所在 `*.module.ts` 的 `providers: [ThisService]` 注册点
- 看是否已经 imports 包含 `XModule`
- 没有 → 立即加 `XModule` 到 imports

### 2. @Optional() 只允许两种用途

- **运行时配置开关**（plugin / feature flag）：例如 `@Optional() private readonly hookBus?: HookBus` 让 plugin 可拆
- **向后兼容老 spec**：例如 service 字段加了新依赖但不想破坏旧 spec mock 列表

**不允许**用 `@Optional()` 来"我懒得查 module wiring，先 Optional 让 type-check 过"。如果实际运行必须有该依赖，**必须**配套 module import，**不写 Optional**：

```ts
// 正确：实际必需 → 不写 Optional
constructor(private readonly keyResolver: KeyResolverService) {}
// + module.imports: [KeyResolverModule]
// → 启动时 DI 解析失败 → 容器 throw 启动错误 → 永远不可能进 prod
```

### 3. 严格 BYOK / 严格 KEY 类的强依赖一律不 Optional

`KeyResolverService`、`SecretsService` 这类系统级关键依赖：**必需**而不是 Optional。让启动失败胜过让用户请求失败。

### 4. PR self-review 检查项

写完 service 改动后，commit 前自检：

- [ ] grep 新增的 `@Optional()` 字段类型
- [ ] 对每个 `@Optional()`，确认对应 `*.module.ts` 已 import 该 module，或确认它真的允许缺失
- [ ] 如果 service throw "X 未注入" → 这是 self-evident 的 module wiring 漏配，立即在同 PR 修

## 历史案例

- **2026-05-12 EmbeddingService 严格 BYOK 改造**（commit bdd0fc791）：spec 39/39 + tsc 过 + 5 项 pre-push 全过，prod 第一个用户请求 throw "KeyResolverService 未注入"。补丁 c0eed7c71 加 imports。
- **2026-05-14 AICapabilityResolver 从未注册**（commit eecc5bb00）：`@Injectable()` 类标了，但**零** .module.ts 把它加到 providers。`toolFeatureProvider` 用 Optional 注入永远拿 undefined，`ToolFacade.capabilityResolveTools` 永远走 fallback 空 list → Leader agent 拿不到 tools。Greppable signal: prod log 反复出现 `[ToolFacade] capabilityResolver missing (DI not wired)`。修复：HarnessModule providers + exports 加该 class。

## 友邻

与 [[feedback_new_mechanism_must_e2e_verify]] 同源——spec 绿不代表跑得起来，必须真起一个 mission / 真接一次请求验证。
