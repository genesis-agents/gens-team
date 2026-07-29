---
name: feedback_dto_class_not_interface
description: NestJS controller @Body() 必须接 class DTO（带 class-validator 装饰器），不接 interface；Partial<X> 完全绕过校验
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2e1aa3d7-8b7e-49df-aad3-c8b0058ddbc8
---

NestJS controller `@Body() updates: Partial<SomeConfig>` 是 class-validator 死角——interface/type 在运行时不存在，`ValidationPipe` 无目标可校验，任意 payload 直接进入业务层。

**Why**: 2026-05-15 PR-I Dreaming 整改 Round 2 安全评审发现 `PATCH /admin/dreaming/config` 用 `Partial<DreamingSchedulerConfig>` 裸 interface，攻击者可传 `sampleSize: -1` / 7 字段 cron / `tokenBudget: Number.MAX_SAFE_INTEGER` 直接 spread 进 scheduler config。Round 3 通过新建 `UpdateDreamingConfigDto` class + 5 字段 `@IsInt @Min @Max` / `@Matches` 装饰器 + `@UsePipes(ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))` 才修复。

**How to apply**: 所有 `@Body()` 形参必须接 class 类型（PascalCase + Dto 后缀），class 字段每个都有合适装饰器：

- 数字字段：`@IsInt() @Min(...) @Max(...)` 或 `@IsNumber()`
- 字符串字段：`@IsString() @MaxLength(...)` 或 `@Matches(/regex/)` 限制字符集
- 布尔字段：`@IsBoolean()`
- 可选字段：`@IsOptional()` + 类型装饰器组合
- whitelist + forbidNonWhitelisted 让多余字段直接 400 而不是静默剥离
- 即使 endpoint 是 stub / PR-I 阶段未 wiring，骨架落地就要校验，否则后续接通 cron 即可被滥用

**反例**：`@Body() updates: Partial<XConfig>`、`@Body() body: any`、`@Body() data: { x: number }`（inline literal type 同样无校验）。
