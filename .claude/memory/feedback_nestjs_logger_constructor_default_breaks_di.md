---
name: feedback-nestjs-logger-constructor-default-breaks-di
description: "NestJS Module/Service constructor 参数把 Logger 设默认值 (`logger: Logger = new Logger(...)`) 会让 DI 仍尝试解析 Logger provider 失败 → bootstrap 炸；改用类字段或 @Optional()"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

## 反模式

```ts
@Module({ ... })
export class FooModule {
  constructor(
    private readonly bar: BarService,
    private readonly logger: Logger = new Logger(FooModule.name), // ★ DI 炸
  ) {}
}
```

**Why（2026-05-12 b14068ff0 事故）**: NestJS DI 通过 `Reflect.getMetadata("design:paramtypes", ...)` 拿到构造函数参数类型。看到 `Logger` 就尝试从 DI 容器解析；Logger 不是 provider → 抛 "Nest can't resolve dependencies"，Railway production bootstrap 失败。TypeScript 的默认值 `= new Logger(...)` 只有在 DI 解析失败时才会用——但 NestJS 是 throw 而非 fallback。

## 正确模式

### 选 1（首选）：类字段无 DI 参与

```ts
export class FooModule {
  private readonly logger = new Logger(FooModule.name);

  constructor(private readonly bar: BarService) {}
}
```

### 选 2：@Optional() 装饰让 DI 容忍 undefined

```ts
import { Optional } from "@nestjs/common";

constructor(
  private readonly bar: BarService,
  @Optional() private readonly logger: Logger = new Logger(FooModule.name),
) {}
```

## How to apply

- 写 NestJS Module / Service / Controller constructor 时，**永远不要**把 Logger 作为有类型注解的参数（即使有默认值）
- Logger 用类字段：`private readonly logger = new Logger(ClassName.name);` ——这是 nestjs.com 文档的官方写法
- 如必须 inject（罕见，比如 Logger 是项目自定义 provider），用 `@Inject` 显式 token + 在 module providers 注册
- code-review 看到 constructor 有 `Logger` 类型参数 → 立即标 P0

## 友邻

- [[project_byok_thorough_cleanup_2026_05_12]] — 当时 push 7 commits 后 Railway 部署被这个炸阻断
