---
name: topic-insight-zero-results-2026-05-05
description: 2026-05-05 调研 0 结果根因 — DataSourceRouter.isToolEnabled 用 capabilityResolveTools({}) 空 context 检查导致 web/academic 全部被错判 disabled
type: project
originSessionId: b0b3ce5b-be89-4060-98ad-14019c81da61
---

## 现象（2026-05-05 mission 4eb29b81）

UI 调研 todo "搜索次数 8 / 找到结果 0"，5 个维度中 2 个完全 0 结果（"公开量化现状与性能分布"、"TTLT定义与术语边界"）。

Railway 日志确诊：所有 web-search / arxiv-search 调用都被前置 skip：

```
[executeSearch] Tool web-search for data source web is disabled by Admin, skipping
[executeSearch] Tool arxiv-search for data source academic is disabled by Admin, skipping
```

但 DB `tool_configs` 表里 `web-search.enabled=true`、`arxiv-search.enabled=true`；启动日志 `[T4] Tools: 60 (expected: 60)`，工具注册正常。

## 真因

`backend/src/modules/ai-app/topic-insights/services/data/data-source-router.service.ts:951` 的 `isToolEnabled(toolId)` 通过 `toolFacade.capabilityResolveTools({})`（空 context）检查可用性。

`tool.facade.ts:128`：

```ts
async capabilityResolveTools(context) {
  return (await this.tools?.capabilityResolver?.resolveToolsForAgent(context)) ?? [];
}
```

`this.tools.capabilityResolver` 在某些注入路径下为 undefined（W17 ai-engine harness cleanup / PR-X14 facade 反向依赖清理后注入链改动），optional chain fallback 到 `[]` → `availableTools.includes('web-search') === false` → 全部 skip → 0 结果。

不是抛错（无 `[isToolEnabled] Failed` 日志），是静默返回空列表。

## 历史包袱

commit `86bcd4112 fix(topic-insights): bypass isToolEnabled check for industry-report adapter`（2026-03-15）已经诊断过同样的 bug，但只给 INDUSTRY_REPORT 做了硬编码 bypass，没修根因。

## 次级问题（一并发现）

`[T4] Found 14 orphaned ToolConfig entries`：BYOK PR-1 (`e7ef8a0d6 feat(byok): pr-1 provider catalog ddd — db driven + admin crud`) 把 provider catalog 改成 DB 驱动后，14 个 provider 在 DB 里有 enabled=true 配置但没在 ToolRegistry 注册（`tavily / arxiv / serper / firecrawl / jina / perplexity / duckduckgo / hackernews / industry-report / short-term-memory / long-term-memory / elevenlabs / googleTts / tavilyExtract`）。代码侧打 WARN 但不抛错，影响是 BYOK 配置无效。

## 修复方向

**P0**（让线上立刻能跑）：

- 移除 `executeSearch` 里 toolId-based 的 `isToolEnabled` gate，或
- 让 `capabilityResolveTools({})` 空 context 时 fallback 到 `getGlobalEnabledTools()`（registry - DB.disabled）

**P1**（架构）：

- 拉齐 BYOK provider catalog（DB）与 ToolRegistry（code）：要么生成代码侧 adapter，要么把 14 个 orphan 从 DB 删除
- `tool.facade.ts:128` 的 optional chain fallback 应该抛错或降级到 registry，而不是静默返 `[]`（静默 contract violation）

## How to apply

- 排查 topic-insight / research 的"0 结果"问题时，先 grep Railway 日志：`is disabled by Admin, skipping`，看是不是这个 gate 触发
- 改 `ai-harness/facade/domain/tool.facade.ts` 的 capability 链路时，必须验证空 context fallback 行为（兼容 industry-report 之外的所有 adapter）
- BYOK PR 后续要拉齐 DB 配置和 ToolRegistry 注册名（参考 `ai-engine.module.ts:241` T4 sync check）
