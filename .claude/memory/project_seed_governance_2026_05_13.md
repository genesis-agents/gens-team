---
name: project-seed-governance-2026-05-13
description: Genesis 系统数据 seed 治理三层架构 + SeedSyncService 引入；客户首次安装哪些自动有 / 哪些得 admin 自己加
metadata:
  node_type: memory
  type: project
  originSessionId: 3097db18-6f89-4ac8-b70c-512ac02fe78a
---

2026-05-13 客户 onprem 首次安装 + 升级链路完整后，发现 backend 启动后部分功能（Simulation 外部 provider / YouTube 默认订阅）空表导致 UI 选择器空白。审计 + 设计 seed 治理。

## 客户首装数据从哪里来（三层来源）

**Layer 1: Prisma SQL migrations 内嵌 INSERT —— 自动跑（`prisma migrate deploy`）**

- `ai_models`（4 默认：grok/gpt-4/claude/gemini）：`20251125_add_ai_models_table`
- `ai_providers`（18 system provider）：`20260505b_ai_provider_catalog` + `20260510b_seed_extra_providers`
- `data_sources`（5+ 内置 arxiv/hackernews/...）：`20251123_seed_predefined_data_sources_v2`
- 其他 system_settings 默认值散落各 migration

**Layer 2: 代码注册 —— backend onModuleInit 自动**

- 所有 Tools（Tavily/Serper/arxiv 搜索...）：`ToolRegistry.register()` in tool 类 `onModuleInit`
- 所有 Skills（48 SKILL.md）：文件烤进 backend 镜像（COPY in Dockerfile + copy-build-assets.js asset copier）

**Layer 3 (NEW): `SeedSyncService` —— backend `onModuleInit` 幂等同步**（commit `3658cb249`）

- `backend/src/common/seed/`
- 触发：backend 启动时 `SeedSyncService.onModuleInit()` 跑所有 `ISeeder.sync()`
- 当前 seeders：
  - `SimulationProvidersSeeder`：4 entries → `SystemSetting.value` JSON (external.providers)
  - `YouTubeSourcesSeeder`：5 entries → `DataSource` 表（findFirst skip + create）
- 数据源单源：`backend/src/common/seed/data/*.json`
- env gate：`SEED_SYNC_ENABLED=false` 可禁
- 失败不阻塞 boot（每 seeder try/catch + warn log）
- 升级时已有数据**保留**：simulation 用 merge（保留 admin 配的 API key），youtube 用 skip-if-exists

## 完全 admin 创建（无默认值）

- `ai_team_templates`、`writing_style_templates`、`prompt_templates`、`report_templates`（report-templates 是半成品功能，连 JSON 文件都没）

## Decision: 何时用 migration / 何时用 SeedSyncService

| 数据特点                                   | 选                           | 原因                                   |
| ------------------------------------------ | ---------------------------- | -------------------------------------- |
| 简单行 + 不需要复杂逻辑 + 永远 system 一份 | SQL migration INSERT         | 原子，跟 schema 同步                   |
| 复杂 JSON / 需要 merge 已有 admin 配置     | SeedSyncService              | TS 写起来干净；客户 admin 编辑不被覆盖 |
| 文件即数据（如 SKILL.md / template.json）  | 代码注册 + copy-build-assets | 跟代码版本绑定                         |
| 客户必须 BYOK 才能用                       | 不 seed                      | 留空逼客户配                           |

## 反模式

- 在 `npm run prisma:seed` 里加业务逻辑（旧 seed.ts 的做法）：客户的 entrypoint.sh 跑 `npm run deploy` 触发它，但开发分支跑 seed 容易污染本地 dev DB
- 写一个独立 `scripts/seed/*.ts` 不串进任何自动链路：3 个旧脚本（report-templates / simulation / youtube）都是这种"摆设"，客户根本不会跑
- migration 里写 `INSERT ... ON CONFLICT UPDATE` 想做"每次都同步"：migration 设计为只跑一次，重复同步用 SeedSyncService

## 新增内置数据流程（标准化）

1. 改 `backend/src/common/seed/data/<name>.json`（增/减条目）
2. 现有 seeder 已经按 JSON 跑，不需要改 TS
3. 重 build backend 镜像 → push v 新版本
4. 客户 `bash genesis.sh upgrade vX.Y.Z` 后下次 boot 自动同步

如果是**全新一类数据**（如新增 `agent-personas` 表的默认 5 个 persona）：

1. 加 Prisma model + migration（schema only，不 seed）
2. 加 `data/agent-personas.json` + `seeders/agent-personas.seeder.ts` impl ISeeder
3. 在 `SeedModule.providers` 加进去
4. 在 `SeedSyncService` constructor 注入并 push 到 seeders 数组

## 客户 admin 后台必做的事（前端要清晰提示）

1. **录至少一个 LLM BYOK API key**（OpenAI / Claude / Gemini）—— 否则所有 LLM 调用 401
2. 默认 admin 邮箱 / 密码改一遍
3. 看 `bash genesis.sh status` 确认 5 容器都 healthy

相关：[[project_onprem_ghcr_org_namespace_2026_05_13]]（onprem 发布 + 升级机制）
