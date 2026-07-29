---
name: R5 + R-LIVE 收尾批量修复
description: 2026-04-30 一轮完成 R5 全部 (15) + R-LIVE 5 + Observability + 76 暂滞，落 6 commits
type: project
originSessionId: 1eeec69c-2d84-4aa2-bd93-d546b59ca998
---

R5 全 P0/P1/P2 收尾 + R-LIVE 观测降级 + Observability — 2026-04-30

**Why**: 用户"全部解决"指令；此前 P0/P1/P2 共 16 项 R5 + 5 项 R-LIVE 长尾积压。

**How to apply**:

- citation-formatter 三处合改一文件 (#45 #50 #53): authors 多人拆分 / news 域名精确匹配 / firstName 缺失孤独 dot
- checkpoint 全终态化清 `__checkpoint` JSONB key (#40): markFailed/markCancelled/markCompleted/recoverOrphanedRunning 都加 clearCheckpointJsonbKey + cancel/quality-failed 路径不漏
- checkpoint save 改 `jsonb_set $executeRaw` 原子写 (#46): read-modify-write 互覆盖治本
- rerun 闭环 cloneCheckpoint(from→to) (#41): 新 mission 跳过已完成 stage
- listResumable 用 savedAt 应用层过滤 (#42): 不再漏长 mission
- save 失败计数 + DEGRADED_THRESHOLD=3 (#43): 不再静默
- savedAt isNaN 守护 (#47): load + listResumable 都校验
- s4 DAG isCancelled OR abortRegistry.isAborted (#48): 治取消后烧 credits
- s12 fire-and-forget vs S2 召回竞态 (#49): 检测最近 5min 完成 mission 等 S12 写完最长 3s
- mission-health markFailed 后 emit mission:failed (#51): WS 实时同步
- s12 each await 前 isAborted 检查 (#52): 治 wallTimer 后烧 credits
- mission-context s10RevisionRound 死字段删除 (#54)
- quality-gate failed 计数 undefined 也 +1 (#44)
- quality-gate requireAcademic 但无 academicSourceTypes 显式 gap (P2-3)
- mission-health BigInt MAX_SAFE_INTEGER 守护 (P2-1) + take=200 警告 (P2-2) + STARTUP_DELAY 60s (P2-5)
- resource-health 429/503/网络超时 fail-open transient 不批量误标 BROKEN (#58)
- figure-relevance Stage2 阈值 0.35→0.28 治中文 dim 0 命中 (#59)
- GET /missions/:id 5s 内未持久化降级返回 starting 占位 (#60)
- ai-observability 高延迟 reasoning vs chat 双阈值 (#61, #63)
- stage:completed 公共字段 helper startStageTimer (#65)
- BYOK cron (#76) 路径 read 权限被拒，需另立 PR / 手动操作

**剩余未关**:

- #56 INFRA-DEPS dependabot 10 PR (待人工 review)
- #73 P0-LIVE-REPORT-FORMAT (frontend 已 TI 对齐，需 live mission 验证)
- #74 P1-UI-OVERLAY (Screenshot 不可访问, defer)
- #75 P0-CONFIG-MODEL (per-user 配置)
- #76 P1-CTX-BYOK topic-insights cron (perm-denied 路径)

Commits: f955b9ae1 / 93133a9c3 / bc02da197 / 2e49509a5 / 7a8a66f2c / 32a92cdb7
