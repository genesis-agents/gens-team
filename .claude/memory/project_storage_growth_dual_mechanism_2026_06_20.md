---
name: project_storage_growth_dual_mechanism_2026_06_20
description: Railway DB 膨胀/卸不到 R2 的真相——offload 与 retention 两套独立机制各管不同表，均 env 门控
metadata:
  node_type: memory
  type: project
  originSessionId: c22ebf52-3f0c-4ed1-b7d9-293785dc537b
  modified: 2026-07-21T10:42:50.713Z
---

**Railway DB 膨胀 / "卸不到 R2" 排障真相（2026-06-20，全程自驱已交付）**

用户截图：DB 1.3GB、月增 ~1GB，admin「数据管理」大量 offload 规则停 Pending、R2 仅转存 105MB。

**根因=认知误判+两套机制都被 env 关着**，二者各管不同表，别混为一谈：

- **StorageOffload**（`storage-offload.service.ts` + `.registry.ts`）：只搬**大字段**（JSON/长文本列）到 R2，列清空行保留；覆盖 topic*reports.full_report / dimension_analyses.data_points / research_tasks.result / agent_playground_missions 报告列 / wiki*\* / kb_documents。R2 三件套（`R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY`，bucket 默认 genesis-reports）缺一→`onModuleInit` 直接 return 静默禁用（日志 `object storage not configured`，UI 看不出）。
- **DataRetention**（`data-retention.scheduler.ts`）：按龄**删行**；覆盖吃 DB 的真凶大表 harness_agent_events / harness_checkpoints（仅删终态）/ agent_playground_mission_events / ai_engine_metrics / secret_access_logs。**`ENABLE_DATA_RETENTION!=="true"` 整体禁用**（@Cron disabled），03:10 UTC。`DATA_RETENTION_DRY_RUN=true` 只统计不删。

**关键事实**：高行数事件表没有大 blob 列→R2 offload 对它们无能为力（设计如此），只能靠 retention 删行。offload/retention 都**不做 VACUUM FULL**→删完磁盘不收缩，autovacuum 只标记可复用；真要回收磁盘手动 `pg_repack`/`VACUUM FULL`（低峰逐表）。

**用户最终明确要"卸载(无损)"不是"删"**——遂建第 3 套机制 **EventArchive**（`event-archive.service.ts`）：事件大表老行导 gzip NDJSON 上 R2(`event-archive/<表>/<起>_<止>_<hash>.ndjson.gz`)→**确认上传成功才删 DB**(上传失败绝不删)→DB 释放且数据不丢。覆盖 harness_agent_events/checkpoints(仅终态)/mission_events/ai_engine_metrics/harness_run_metrics/research_agent_activities/agent_spans/agent_traces 8 表。env `ENABLE_EVENT_ARCHIVE` 门控、`EVENT_ARCHIVE_DRY_RUN` 预演、pg_try_advisory_lock 防并发、03:40 UTC。admin `GET/POST /storage-inventory/archive|run-archive`。前端 `StorageArchivePanel`(首选,展示)+retention 收进 details 折叠(有损备选,二选一)。spec 4/4。

**关键设计判据**：①事件大表无大 blob 列→不能列级 offload→只能整行归档(R2 当冷备不可查)②先落 R2 再删=崩溃只重传同 key 覆盖,零数据丢失③用 Prisma 访问器(非裸 SQL)做 select/delete=类型安全无物理列名风险④无内置 rehydrate 回库,取回靠手工 gunzip。**坑**：扫描器(E)按表名 `_events` 误判 `timeline_events`=故事圣经剧情内容(业务数据!),`user_events`/`social_publish_logs` 偏运营→都不能自动删,每表须人确认。

**内容列 offload 扩展配方（加一列动 7 处,漏一处读空）**：①schema 加 `{f}Uri/{f}Size` ②手写迁移 ALTER ③`common/storage/offload-key-allowlist.ts` 加 R2 前缀(hydrate downloadText 白名单,不加回读被拒) ④`offload-prefixes.ts` 加同名前缀+extractId/listLiveIds(启动自检强制两白名单一致) ⑤`storage-offload.registry.ts` 加 target ⑥`common/prisma/prisma.service.ts` 加 `hydrate{Model}Row`+`$extends.query.{model}`+shadow 循环 model key ⑦prisma generate。**read-path 红线**：被 offload 列的所有 `findX({select})` 必须带 `{f}Uri`,否则 hydrate 读空(会 warning);只有全字段读(无 select)自动安全→加表前必 grep 所有 read 站点。hydration 是 PrismaService `$extends` 查询扩展(已覆盖 11 model)。2KB 阈值=小内容不搬,故 schema 扩展即便不知体积也安全。**⚠️ 内容列 offload 已整批回退(多 agent 检视后)**:致命陷阱=透明 hydrate 的 `$extends` 钩子**只对顶层 `prisma.{model}.findX` 触发**,而 research 域子表大量经**父表 include 读**(`researchProject.findUnique({include:{sources,notes,outputs}})`)→绕过 hydrate→offload 清列后在 项目详情/AI聊天/生成/导出/RAG **静默读空**。我最初只 grep `prisma.<model>.find` 的审计漏掉 include 旁路 + partial-select(chat 的 select 含 content 漏 contentUri)→结论被证伪。**教训**:列级 offload 前置=审计全部读路径(顶层 select 漏 uri / 父表 include / raw SQL / 0 直接 find 走 include)+ 改造不安全读 + 加架构 spec 断言"offload 列的 findX select 必含 Uri"。人工审计证明会漏。回退法=这 5 文件(models.prisma/prisma.service/registry/两白名单)只含我的内容列改动→`git checkout -- <file>` 单文件回退最干净。**EventArchive 同轮修**:删 pg advisory lock(连接池无 pinning,acquire/release 跨连接→释放失败泄漏锁→静默停摆;归档幂等故跨 Pod 并发本就安全,只留 this.running)、this.running 同步提前置位杜绝 await 竞态、dry-run 走只读不受重入护栏、去 setInterval 只留 @Cron、双开 retention+archive 告警。

**(以下为已回退,留作再做参考)已纳入 6 列**(读路径全审计):research_project_outputs.content / research_project_notes.content / resource_translations.content / workspace_tasks.result(JSON) / topic_summaries.content / research_project_sources.content。**审计排除(会读空非偷懒)**:resources.content(81 读/17 partial/5 raw)、topic_messages.content(热读+10 partial+4 raw)、team_missions.finalResult(3 raw SQL 绕 hydration)、debate_messages.content(0 直接 find=走 include 不触发扩展)、collected_reports(非 Prisma 读)、notes.content(4+ partial)、comments(极少>2KB)。**审计法**:`grep prisma.<m>.find` 数 partial-select(select 漏 uri=读空)+ raw SQL(绕 hydration)+ 0 直接 find(走 include)。验证 governance+hydration 175 + arch 473 全绿。用户多次催"直接搞定"→应一次审完所有候选批量接,而非分批问。

**我交付**：① retention 加 `runSweep({dryRun})`+`getStatus()`+lastRun（spec 7/7）② EventArchive 全套(见上)③ 全库扫描器 `scripts/utils/audit-storage-candidates.ts`(DMMF 分类+pg 体积+解析已覆盖集,RETENTION/OFFLOAD/REVIEW/compliance 分桶,**OFFLOAD 候选须连 DB 拿列体积否则噪音**)④ admin 端点 retention+archive ⑤ 前端 ArchivePanel+RetentionPanel ⑥ runbook：`docs/operations/storage-growth-runbook.md`。

**待用户在 Railway 做**（我无线上 env 权限）：设 `ENABLE_DATA_RETENTION=true`（首轮配 DRY_RUN 观察）、补齐 R2 三件套、删行后手动 VACUUM。相关 [[project_capability_datafication_deferred_2026_06_09]]（同表多 pod 进程内 Map 问题）。

**2026-07-21 落地核实+一次性清理（有 railway CLI 就能自己干,不用等用户）**：R2 三件套已配、`ENABLE_EVENT_ARCHIVE=true` 归档在正常跑（mission_events 只剩 30 天内、metrics 14 天内）；retention 按互斥设计保持关闭。**新坑实锤：archive 对 checkpoints 只收终态,5-6 月 mission 失控事故留下 942 个 `agent_state='running'` 僵尸断点（5/19 起）永远不会被归档**。清理法=SQL 把 `running`+超14天 UPDATE 成 `cancelled` → `railway redeploy -s backend -y` 触发冷跑（启动+7min）无损归档 R2 后删 → `VACUUM FULL` 收缩。战果：checkpoints 118MB→1.9MB、mission_events 124MB→40MB、metrics 39MB→1.3MB、research_agent_activities 11MB→32KB；DB 650MB→401MB、盘上 783MB→550MB。**操作要点**：railway ssh 不转发 stdin（psql 会掉交互模式挂死）,SQL 用 `base64 -w0` 打包后 `sh -c "'echo <b64>|base64 -d|psql -U postgres -d railway'"` 双层引号执行；Railway 面板 volume 数字比 du 大 ~300MB（文件系统/统计口径）。同类僵尸 running 断点以后每次 mission 失控事故后都该顺手查。
