---
name: project_unregistered_injectable_optional_undefined
description: 反复踩的坑——@Injectable 类没在任何 module providers 注册，被 optional 注入时静默 undefined，功能哑火不报错
metadata:
  node_type: memory
  type: project
  originSessionId: 1adb6dfb-5cce-46fa-966f-91512c3454a9
---

**Bug 类**：一个 `@Injectable()` 类没在任何 module 的 `providers:` 注册，但被某处用 `{ token: X, optional: true }` 或 `@Optional()` 注入 → DI 静默给 `undefined` → 功能走 fallback / 报"X not available"，**启动不报错**（optional 不抛），极难发现。

**已发生两次（同一 toolFeatureProvider 的 inject 列表）**：

1. `AICapabilityResolver`（2026-05-14，commit 2f418ac01）：没注册 → `ToolFacade.capabilityResolveTools` 永远空 list。修：加进 `HarnessModule` providers。
2. `FunctionCallingExecutor`（2026-05-21，commit debf2aa89）：2026-04-30 C2-step2 清理误删 provider 行、planning.module 只剩注释"保留 FunctionCallingExecutor"，HarnessModule 也没补 → `tools.executor` 永远 undefined → `tool-exec.sub-facade` 报 `Tool execution not available` → 知识库「对话整理」+ teams 工具调用全挂。修：`HarnessModule` providers 补回（必需依赖 ToolRegistry 来自已 import 的 AiEngineToolsModule，其余 @Optional，无新依赖环）。

**排查手册**：遇到"X not available" / 功能静默走 fallback：

1. grep 该类名全仓，看它**是否真在某 module 的 providers 数组**（注释里写"保留 X"不算！C2 类清理常删代码留注释）。
2. `toolFeatureProvider` / 各 feature provider 的 `inject: [{ token, optional: true }]` 列表——逐个确认 token 类真有 provider。
3. 修法：注册在"消费它的 provider 所在 module 且其依赖可达"的 module（这里是 `backend/src/modules/ai-harness/harness.module.ts`）。

**根因诊断对了一次**：这次没重蹈 [[feedback_dont_double_down_on_theory_when_user_pushes_back]]——先 grep 精确错误串定位到 `tool-exec.sub-facade.ts:332`，再顺藤摸到 DI 注册缺失，没乱猜。
