---
name: project-wiki-auto-ingest-no-off-switch-2026-05-25
description: wiki 自动 ingest cron 烧 LLM 配额两大暗雷：①无 UI/API 关闭入口（autoIngestEnabled 不在 PATCH 白名单）②消费者计费=手动 ingest 别人 KB 一次就永久替它付自动 ingest 费
metadata:
  node_type: memory
  type: project
  originSessionId: 7b39507d-5599-4d2a-99cd-64ba4152fa15
---

## wiki 自动 ingest 烧配额：两大暗雷 + 修复（2026-05-25 Railway prod 实证）

用户报"所有 LLM wiki 都关了自动获取，配额还在烧"。Railway 日志 + 生产库
（`DATABASE_URL` @ tramway.proxy.rlwy.net）实证根因不是用户关的开关，而是
`WikiAutoIngestScheduler`（`backend/src/modules/ai-app/library/wiki/wiki-auto-ingest.scheduler.ts`）
每 5 分钟一跑、与任何用户可见开关解耦。

### 暗雷 1：自动 ingest 没有关闭入口

- scheduler 选 KB 的唯一条件：`wikiEnabled=true` 且 `wikiConfig.autoIngestEnabled !== false`
  （**config 行缺失或 null → 默认 true**）。`autoIngestEnabled` schema `@default(true)`。
- `autoIngestEnabled` 修复前**全后端只被读/展示，从无任何写路径**：PATCH `/library/wiki/:kbId/config`
  的 `updateConfig` 是手维护类型白名单（注释"ignores unknown keys"），白名单里没有它 →
  前端就算发 `autoIngestEnabled:false` 也被静默丢弃。前端 `WikiSettingsModal` 也根本没这个开关
  （它的 "Automation" 区只有 `cronLintEnabled`=每日自动 Lint，是另一条 cron，与 ingest 无关）。
- 结论：用户**无法用任何 UI/API 关掉 wiki 自动 ingest**，对每个 wikiEnabled KB 永远默认开。

### 暗雷 2：消费者计费模型（谁手动 ingest 谁永久付费）

- `pickConsumerUserId(kbId)`：取该 KB 最近一条**非哨兵** `wikiDiff.createdByUserId`
  （= 最近一位手动 ingest 的人）且其当前有可用 BYOK，作为自动 ingest 的付费人。
  与 `KB.userId`(creator) 完全解耦。哨兵 = `AUTO_INGEST_SYSTEM_USER_ID = "__system_auto_ingest__"`。
- 暗雷：**你手动 ingest 过别人的 KB 一次，就永久成了它自动 ingest 的付费人**。本案 16 次/天烧的是
  emma 的 KB「政策分析文章」(`70dfe34e`)，记在 Junjie(`18780216…`) BYOK 上，因为他手动 ingest 过它一次。
- 每次自动 ingest = 1 次 deepseek-v4-flash 调用，140–160 秒（[[feedback]] 关注高延迟告警）。

### 处理（2026-05-25）

1. **止血**：直接改生产库，3 个 wikiEnabled KB 的 `wiki_knowledge_base_configs.auto_ingest_enabled=false`
   （70dfe34e/ff7e2b75/e1012717，用户批准"三个全关"）。scheduler 每 tick 现查 DB 无缓存 → 立即生效，无需重启。
2. **补能力（开关 UI）**：6 文件改动——
   - `wiki.controller.ts` PATCH 白名单加 `autoIngestEnabled`(boolean)
   - `wiki-page.service.ts` `updateConfig` patch 类型+写 update/create；`getConfig` 兜底对象补 `autoIngestEnabled:true`
   - 前端 `lib/api/wiki.ts`(类型+patch Pick)、`WikiSettingsModal.tsx`(Automation 区加 checkbox + save 载荷)、zh/en.json
   - 回归测试 `__tests__/wiki.controller.config.spec.ts`（4 项，守护白名单透传，防再漏）
   - **需前后端重新部署**开关 UI 才可用；止血的改库不依赖发版。

教训同源：手维护 DTO/白名单漏字段 = 静默丢数据，与 [[project_unregistered_injectable_optional_undefined]]
（optional 注入静默 undefined）同类"静默哑火"。consumer/BYOK 计费 + Railway 生产库调试见
[[project_playground_budget_root_cause_2026_05_22]]。wiki 架构见 [[project_wiki_bilingual_arch_2026_05_14]]。
