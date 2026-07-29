---
name: feedback-contract-fix-must-touch-both-sides
description: '前端发现"非法值" / "类型不覆盖"时根因常在后端发送侧；修 contract 必须双侧验证'
metadata:
  node_type: memory
  type: feedback
  originSessionId: eb9df724-2242-4336-8d27-58151c093da9
---

前端发现"后端可能返回的值不在合法集合"（如 status 缺 cancelled、补 aborted 非法），第一反应是改前端类型把它放进去——这只补壳，根因还在后端 service / dispatcher 发送侧。

**Why**：2026-05-16 ai-radar Round 2 contract 评审发现 `TriggerRefreshResponse.status` 写 `'aborted'` 错位 + 缺 `'cancelled'/'rejected'`。我把前端类型改成 `RadarRunStatus`（5 态超集）就以为修了。Round 3 contract 复审发现后端 `RadarMissionSummary.status` 还写 `"completed" | "failed" | "aborted"` 且 abort 分支真返回 `"aborted"`——只改前端壳让前端类型能 typecheck，但 wire 上仍然会塞一个前端值域不包含的非法值进来（前端 runtime 接到 `'aborted'` 时 UI 分支会静默失效）。

**How to apply**：

- 修 API 契约（DTO / Response shape / event payload）时必须同时 grep 前端类型 + 后端 controller 返回 shape + 后端 service 发送源
- 任何 enum / union 字面量值的修改：grep 字面量 `"<value>"` 跨前后端全仓，确认所有源都同步改
- 前端发现"非法值"时不要先想"补到我的类型里"，先 grep 后端是不是该输出端写错了
- contract reviewer 出 NO 时，整改不能只看前端 commit 就算完，必须确认后端 wire 同步改了

适用于：[[feedback_no_dual_sources]]、[[feedback_unitrack_audit_must_check_consumer]]、[[feedback_required_field_must_scan_all_callers]]、[[feedback_cjs_import_must_grep_all_sites]]
