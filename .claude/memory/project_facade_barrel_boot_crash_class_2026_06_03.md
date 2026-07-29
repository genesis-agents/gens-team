---
name: project_facade_barrel_boot_crash_class_2026_06_03
description: facade-barrel 循环导致 DI 启动崩溃的"一类"事故 + CI boot smoke-test 守护设计 + 残留 latent 文件
metadata:
  node_type: memory
  type: project
  originSessionId: 34cc9f3a-3a11-418a-b534-b390c2a4d2ca
---

**崩溃类**：`@Injectable` provider 从 facade barrel（`ai-engine/facade` index）**value-import**（具体类/函数，非 `import type`）会构成 import-time 循环加载，DI 解析时被注入类为 `undefined` → 生产启动崩溃（"Nest can't resolve dependencies" / "metatype is not a constructor"）。2026-06-03 生产事故 = `content-fetch.service` 注入到 undefined 的 `WebContentExtractionService`，hotfix **#220**（web-content-extraction 改从 credentials source 直引）。

**根因机制**：barrel `facade/index.ts` re-export 海量符号，其中 `skills/runtime → ai-harness/facade → critique → chat.facade → facade.providers → content-fetch` 这类链会绕回来。`import type` 被 tsc 擦除**不**产生运行时 require 循环→安全；`import {具体值}` 才危险。

**#221（fix/harness-barrel-boot-landmines，本 session）修 3 个残留 active landmine + 装系统守护**：

- `ai-harness/facade/facade.providers.ts` `RateLimitService` → `ai-engine/reliability/rate-limit/rate-limit.service`（最阴：`@Optional` 注入，循环下解析成 undefined **静默关闭限流**而非崩）
- `report-quality-gate.service.ts` 10 符号 → `report-formatting.utils`(8)+`report-writing-standards.constants`(getQualityChecklist)+`strip-chart-json.utils`(stripChartJsonFromContent)
- `report-artifact-assembler.service.ts` 8 符号 → `final-report-post-processing.utils`+`dimension-content-formatting.utils`+`strip-chart-json.utils`+`report-formatting.utils`

**CI boot smoke-test（系统级守护，#221 引入）**：CI 此前**从不真正启动应用**（单测全 mock）→ DI 循环崩溃类整批漏到生产。新 `boot-smoke` job：`backend/scripts/ci/boot-smoke-test.js`（**纯 JS**）`require('../../dist/app.module')` 后 `NestFactory.create(AppModule,{logger:false,abortOnError:false})` 再 `app.close()`。

- **只 create 不 init**：DI provider 实例化在 create 阶段（崩溃正发于此），`onModuleInit` 在 `app.init()`，故无需 Redis/DB 真连。
- **`abortOnError:false` 必加**：默认 NestFactory ExceptionsZone 解析失败直接 `process.exit(1)` 吞堆栈，加它才 reject 让 catch 打印。
- **必须跑编译后 dist，不能 tsx**：tsx 的 resolveTsPaths 与本仓 `@/` tsconfig paths **不兼容**，Windows+Linux 均 `ERR_INVALID_URL_SCHEME`（app.module 透传 `@/` 全仓）。dist 已被 tsc-alias 重写为相对路径，且与生产 `node dist/main.js` 启动路径一致。故 CI job = `npm ci` + `npm run build`（含 prisma generate）+ `npm run test:boot`。需喂 env：`DATABASE_URL`+`JWT_SECRET`+`STORAGE_ADMIN_KEY`（构造期校验 throw；`SETTINGS_ENCRYPTION_KEY` 仅 production 校验，test 跳过）。本地实测 BOOT_OK 8.3s。

**残留 latent（待 PR#14，task #14；当前 boot 都过=非 active，但仍是同类隐患）**——harness 内仍 value-import engine facade barrel 的文件（`import type` 的 figure-relevance/ai-capability-resolver/function-calling-executor 已安全跳过）：

- `evaluation/critique/section-remediation.service.ts`：`classifyModelTier` → `llm/types/model-tier.types`
- `runner/loop/plan-act-loop.ts` + `runner/loop/external-observation.util.ts`：`wrapExternalContent` → `safety/security/llm-injection/external-content-wrapper.utils`
- `runner/tool-routing/semantic-tool-selector.ts`：`ScoredRouterService`/`defaultScorers` → `routing/scored-router.service`+`routing/signal-scorers`、`ToolRegistry` → `tools/registry/tool.registry`
- `protocols/a2a/adapter/a2a-team-member-adapter.ts`：`normalizeMarkdownSlug` → `content/markdown/slug-normalize.util`
- `teams/business-team/invocation/business-team-agent-invoker.framework.ts`：`isRetryableError`/`calculateBackoffDelay`/`sleep` → `safety/utils/error-detection.utils`（该文件已有注释承认循环风险却仍 barrel-import）

**不加 ESLint 守护（已定）**：曾考虑加 `@typescript-eslint/no-restricted-imports`（`allowTypeImports:true`）禁 `ai-harness/**` value-import `ai-engine/facade` barrel，但**判定不加**——harness 编排 engine 公共 facade 是**预期架构**，循环是「barrel re-export 了哪些符号」的缺陷，不是「用 facade」的缺陷；blanket 规则会逼 harness 绕过 facade 反而更糟。boot-smoke test 才是正确的系统守护（任何 active 循环都拦）。

**本 session 4 个 PR 收尾（2026-06-03）**：#220(hotfix,已合) · #221(3 active landmine + boot-smoke 守护,已合 a2d249ccc) · #222(6 latent barrel value-import 改 source) · #224(删死 LlmTracingService,440 删 1 增——纯 debug log wrapper,0 注入 0 调用,真观测在 AiObservabilityService/AIMetricsService)。#222/#224 本地全验(tsc/eslint/arch 32 套/boot dist BOOT_OK)+CI boot-smoke 绿,设了后台 watcher 绿即合。**仓库禁用 auto-merge**(gh `--auto` 报 enablePullRequestAutoMerge not allowed),只能手动/脚本 watch 后合。

**用户拍板「到此为止」**：剩余 roadmap（P0-2 熔断器≥4合一 / P0-3 可观测三写合一→计费看板 / P1-2 删 TI citation 重复→改报告输出 = 运行时敏感需 Railway 验；P1-3 evaluation→quality-checks/reflection、P1-4 guardrails→resource-limits、P2-4 TokenBudgetService 命名 = 架构改名须确认）**均非紧急 tech-debt，暂停，后续单独排期**。事故崩溃类已 100% 解决。承接 [[project_ai_layer_mece_audit_2026_06_02]]。
