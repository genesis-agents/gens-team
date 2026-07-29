---
name: project_platform_review_wave1_2026_05_31
description: 分层评审 wave1 整改已合 main(7 commit) + 3 个架构决策 + 待办
metadata:
  node_type: memory
  type: project
  originSessionId: 26d8b890-fe23-4119-b8e7-bd49da7063a7
---

平台分层评审(报告见 docs/architecture/platform-review/2026-05-30-layered-review-v2.md)后的 **wave1 整改已全部合入 origin/main**(2026-05-31,末 commit fb1fc1534,7 个 commit 过完整 pre-push 门):

**已落地**：

- **OpenAPI agents-api IDOR(P0,真实可达越权)**：getTask/cancelTask/getArtifacts/getArtifactDownload/SSE stream 全部 owner-scoped(findFirst where {id,userId} / 父 task.userId),非owner→404;controller `requireUserId` 兜底 !userId→401(防 Prisma 丢 undefined 谓词越权)。58 单测。
- **SsrfGuard(rank2)**：`ai-engine/safety/security/ssrf/ssrf-guard.ts` —— `isBlockedIp`(v4+v6 私网/回环/链路本地/唯一本地/元数据/保留)+ `assertUrlSafe`(DNS 解析后对**所有** A/AAAA 复核,堵 rebinding,fail-closed)+ `safeFetch`(redirect:manual 逐跳复核)。经 ai-engine facade 导出。接线 content-fetch.fetchFromUrl(替掉字面-only validateUrl)+ webhook sendWebhook(dispatch 时校验 + redirect:manual)。29 单测。
- **PG-04**：`GET agent-playground/missions/:id/cost`(assertReadAccess gated)暴露既有 CostLedger 明细+汇总(此前只内部 SUM 无端点)。需同步 playground-frontend-contract.spec 的 ENDPOINT_BASELINE。
- **PG-08**：agent-invoker 用 canonical `estimateUsdFromTokens` 替 0.000003 魔数。
- **DX-2**：根 package.json `verify:changed` 路径修为 `scripts/utils/verify-changed.js`(原指向不存在文件)。
- **附带修**：topic-insights `calculateNextRefreshTime` MONTHLY 月末溢出(5/31 setMonth+1→7/1),setDate(0) 回退月末。预存 bug,被 facade 改动拉进变更测试集才暴露(31 号)。

**3 个架构决策(用户拍板)**：

- Harness checkpoint/event-store owner 列 = **暂缓**：resume 仅 admin-kernel 端点可达、replay 仅内部,非普通用户可达越权;加无消费方的 owner 列违反"零空转"铁律。等真实用户读路径/计费归属再做(穿透 requester 身份强制)。
- PG-01 workspaceId = **标 future-reserved**(schema `///` 注释 + ADR-0005 补节);保留 user 级隔离,workspace 共享读无产品需求。
- SSRF = 全量 SsrfGuard(已做)。

**残留 TOCTOU**:SsrfGuard 复核与真实连接间 DNS 再翻转的窄窗口未闭合,需 custom undici dispatcher。

**评审路线图剩余未做**(见报告):rank3 分布式状态收敛 Redis、rank4 统一审计扩面、rank5 成本前置熔断、rank6 honor-only 护栏固化 spec、rank8 durable execution。相关 [[project_metrics_dual_track_fix]] [[project_container_validation_worktree_recipe]]
