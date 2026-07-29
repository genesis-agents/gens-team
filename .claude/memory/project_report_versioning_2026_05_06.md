---
name: 报告版本化能力端到端（2026-05-06 commit 774a71d13）
description: mission_report_versions 全链路打通 DB / service / pipeline 写入 / controller endpoint / frontend 切换器；用户在元信息 tab 看到下拉切换历史版本
type: project
originSessionId: b563b5ca-9b52-4741-90db-57cabe79a67c
---

# 状态快照（已端到端）

| 层                  | 状态 | 位置                                                                                                                                                                  |
| ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB schema           | ✅   | `mission_report_versions` 表（migration `20260506c`），`@@unique([missionId, version])`                                                                               |
| Service 写入        | ✅   | `MissionStore.saveReportVersion` (mission-store.service.ts:909) — Serializable tx + MAX(version)+1                                                                    |
| Service 读取        | ✅   | `MissionStore.listReportVersions` (:960) / `getReportVersion` (:1018)                                                                                                 |
| Pipeline 写入       | ✅   | `playground-pipeline-dispatcher.service.ts:823 + 1920` —— mission 完成 / 失败都写一行                                                                                 |
| Controller endpoint | ✅   | `agent-playground.controller.ts` `GET /missions/:id/report-versions`（list）+ `GET /missions/:id/report-versions/:version`（详情）+ 8 spec 覆盖（commit 774a71d13）   |
| Frontend 服务       | ✅   | `services/agent-playground/api.ts` 加 `listReportVersions` / `getReportVersion`                                                                                       |
| Frontend 版本切换器 | ✅   | `ArtifactReader` 元信息 tab v{N} 徽章下方下拉（2+ 版本时显示）；切换时 page 层（`/agent-playground/team/[missionId]/page.tsx`）拉新版本 reportFull 替换 artifact prop |

# 字段语义

`MissionReportVersion`：

- `version` 单调递增（1=首次 initial run，2+=rerun）
- `triggerType`: `initial` / `rerun-fresh` / `rerun-incremental` / `todo-rerun`
- `versionLabel`: 人读标签，如 `initial-2026-05-06` / `rerun-fresh-2026-05-07`
- `changesFromPrev`: JSONB diff（首版本为 null，未来 diff UI 用）
- `leaderSigned`: true=completed / false=quality-failed / null=failed/cancelled
- `finalScore`: leader 总分

# 前后端契约

**`GET /missions/:id/report-versions`** 返回：

```ts
{ items: ReportVersionListItem[] }
// ReportVersionListItem = version / versionLabel / reportTitle / reportSummary
//   / finalScore / leaderSigned / triggerType / generatedAt(ISO)
```

鉴权：`store.getById(id, userId)` 拉不到 → 403。

**`GET /missions/:id/report-versions/:version`** 返回：

```ts
{
  (version,
    versionLabel,
    triggerType,
    generatedAt,
    reportFull,
    changesFromPrev);
}
```

- 非数字 / ≤ 0 version → 400
- 不存在的 version → 400 (`Report version vN not found`)
- 跨 user → 403

# 前端 state 模型（page 层）

```ts
const [reportVersions, setReportVersions] = useState<
  ReportVersionListItem[] | null
>(null);
const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
const [versionOverride, setVersionOverride] = useState<unknown | null>(null);
const [versionSwitching, setVersionSwitching] = useState(false);

// reportFullRef 优先级：versionOverride（用户切了历史版本） ?? persisted.reportFull ?? view.finalReport
const reportFullRef =
  versionOverride ?? persisted?.reportFull ?? view.finalReport;
```

终态（completed / failed / cancelled / quality-failed / rejected）触发 `listReportVersions` 拉一次；
切换时 `getReportVersion` 拉新版本，set 进 versionOverride。

# 已遗留 / 下一步

1. `changesFromPrev` 当前只有数量徽章；可加 diff 列表 UI（点击展开看变更项）
2. URL 同步：当前用户切版本不改 URL，刷新会丢；可加 `?reportVersion={N}` query（与 `#view=continuous` 共存）
3. 跨 mission 版本聚合（同 topic 多次 mission rerun 的版本树视图）—— 暂不需要

# How to apply

- 接同类版本化能力（其他 app 的报告 / 文档）时，可复用此前后端契约
- 兜底语义：旧 mission（DB 没 version 行）→ list 返回空数组 → 前端不显示下拉 → 仅展示 `mission.report_full` 当 v1
