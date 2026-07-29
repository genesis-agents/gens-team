---
name: project-trace-loss-event-archive-2026-07-25
description: 'AI Insight/Playground trace "丢失" 根因=EventArchiveService 把旧 trace 归档 R2 后从 Postgres 删除，读路径无 R2 回读；非 rebrand'
metadata:
  node_type: memory
  type: project
  originSessionId: 6837e5d4-59cf-47df-bb7e-0fc3d6df6af8
  modified: 2026-07-25T08:37:27.685Z
---

2026-07-25 诊断："AI Insight（Playground）所有 trace 记录丢失"。**根因 = 数据生命周期归档 + 读路径无冷存回读**，不是 rebrand、不是读过滤器、不是 schema drift、不是连错库。

机制：`EventArchiveService`（backend/src/modules/platform/storage/governance/event-archive.service.ts）

- 生产 `ENABLE_EVENT_ARCHIVE=true` + `EVENT_ARCHIVE_DRY_RUN=false`，@Cron 每天 03:40 UTC + 启动冷跑。
- 把 `createdAt < now-retentionDays` 的行序列化 NDJSON+gzip 上传 R2（`event-archive/{table}/...`）**然后从 Postgres deleteMany**。无损归档，但……
- 读路径只查 Postgres：`MissionEventBuffer.fetchPersisted`→`prisma.agentPlaygroundMissionEvent.findMany({where:{missionId}})`（mission-event-buffer.service.ts:39-55）。**全项目无任何 R2 回读**（grep event-archive/readArchive/ndjson 在 playground/business-team 读路径=0）。→ 一旦归档，UI 永久看不到。

retentionDays（prod env）：ARCHIVE_MISSION_EVENTS_DAYS 未设=默认 **30d**；ARCHIVE_RESEARCH_ACTIVITY_DAYS 未设=默认 **30d**；spans/traces/checkpoints/harness_events 被设为 **7d**。
数据实证（连 prod DB 直查）：agent_playground_mission_events 21846 行、MIN createdAt=**06-26**（≈今天-30d，归档下沿）、MAX=07-09；`research_agent_activities`=**0 行**（Insight 最后活动 research_topics max=06-09，>30d 全归档删空）→ "AI Insight trace 全丢"。归档数据在 R2 可恢复。

方法论教训：静态分析（含 5-agent workflow）都锚定在 playground 读/写/schema，**查不到 platform/storage 的归档删除**——是 `railway logs`（30s bounded 抓取）里的 `[EventArchiveService] sweep done: ...research_agent_activities=0row...` 日志实锤。workflow 的对抗验证者曾质疑 db-forensics "nothing deleted"（MIN=06-26=29d 前是滚动删除签名），方向对但服务名猜错（DataRetentionScheduler vs EventArchiveService）。**运行时日志是决定性证据**。

**修复=选 A 已实施（commit ea6afc162（已部署验证），2026-07-25）**：读路径加 R2 回读，保留归档省成本。

- 新增 `EventArchiveReaderService`（platform/storage/governance）：list-by-prefix + 按 key 里 {YYYYMMDD}\_{YYYYMMDD} 与 mission 日期窗口重叠挑对象 + gunzip + NDJSON + rowFilter，进程内对象缓存（归档不可变）。
- 端口加 `prefix` 直传（object-storage-backend.interface + object-r2/backend 的 ListObjectsV2 Prefix + ObjectStorageService.listObjects）+ 新增 `getObjectBytes`（二进制读，gz 不能走 downloadText）。经 facade 导出。
- 接入 2 个 trace 展示读（用户确认只接展示读）：Playground `MissionEventBuffer.fetchPersisted`（日期窗口锚 agent_playground_missions.startedAt/completedAt，该表**不在归档目标**故 mission 行永存可锚）；Insight `AgentActivityService.getActivitiesByDimension/getLeaderThinkingHistory`（经 findActivitiesWithArchiveFallback 共享助手，日期窗口锚 research_missions，reviveActivity 复活 Date 列）。均 @Optional 注入、StorageModule 已在两 module import。
- 定位方式=按日期前缀扫描（非索引表；archived 存量也覆盖）。retention 窗口**不调大**（A 让归档可读，无需弃省本）。
- 归档行 JSON 里 ts=string、createdAt/phaseStartedAt/phaseEndedAt=ISO string，回读要 Number(ts)/new Date(...)。
  未做：C 恢复存量到 PG（A 已让其可读，非必要）；其余 6 处 research_agent_activities 聚合读未接（信誉/去重对近期热数据，不需冷数据）。
  db 直查法：`railway variables --service Postgres --kv` 取 DATABASE_PUBLIC_URL；node + createRequire(backend/package.json) 借 @prisma/client。`railway logs` 用 `timeout 30 railway logs --service backend > f` bounded 抓取（否则流式挂起）。

相关：[[project-citation-docs-gate-2026-07-25]] [[project-rebrand-gens-team-2026-07-24]]
