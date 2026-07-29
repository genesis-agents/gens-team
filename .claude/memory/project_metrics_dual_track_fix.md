---
name: project_metrics_dual_track_fix
description: 容器验证抓到的 /metrics 双轨+信封 bug，已修推 main 30b8c15da
metadata:
  node_type: memory
  type: project
  originSessionId: 26d8b890-fe23-4119-b8e7-bd49da7063a7
---

平台分层审计整改的 Wave-4 给 `ai-infra/monitoring` 新增了一个 `MetricsController`(用 prom-client),
但项目早有 `common/observability/MetricsController`，两者都 `@Get` → `/api/v1/metrics`。

**两个真问题(只有起容器 curl 才暴露,tsc+jest 全绿)**:

1. 路由撞车 → 既有的 shadow 掉新增的(双轨死代码,新增那个永不被命中)
2. 两者都走 `response-transform.interceptor` 被信封包成 `{"success":...,"data":...}` → `/metrics` 不是合法 Prometheus 文本,scrape 失败

**修(commit 30b8c15da on main)**:删掉 Wave-4 的重复 controller+service+对应 prom-client 依赖(只它用过),
给 canonical `common/observability/metrics.controller.ts` 的 `getMetrics()` 加 `@SkipTransform()` → 吐裸 `text/plain; version=0.0.4`。

**教训**:

- 新增任何基建端点(/metrics /healthz 等)**先 grep 既有同路径 controller**,别另起双轨
- response 信封拦截器对机器端点(Prometheus/SSE/下载)必须 `@SkipTransform`
- **tsc+单测过 ≠ 对**;真起容器 curl 才是运行时真相(本 bug 即如此)

验证手法/隔离配方:[[project_container_validation_worktree_recipe]]
同次容器验证还端到端确认了 P0 IDOR(非owner mission→404 / PUBLIC 跨用户→200)+ 审计日志(mission.delete 真写 audit_logs)生效。
