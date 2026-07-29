---
name: project_playground_dimension_pipeline_freeze_2026_05_29
description: 'Playground 维度任务"永远停在采集完成、UI 再也不刷新"根因=前端 dimensionPipelines 漏了 events 派生兜底（thinning 回归）'
metadata:
  node_type: memory
  type: project
  originSessionId: 04499ded-3669-4244-9274-3298bf9f3384
---

Playground mission 数据采集后维度任务列表**永远停在「采集完成」、UI 再也不刷新**、到不了「初稿撰写 N/M」「已完成·87」。用户因以为卡死而频繁取消、浪费钱。

**根因（DB 实证：054a3dff 后台早全跑完——outline×3/chapter:done×12/dimension:graded×12/postlude:completed，事件 625 条全在 DB、维度键与 row.dimensions 完全一致；后端无辜）**：
冻结链在前端——`frontend/hooks/features/useMissionLegacyView.ts` 的 `dvProjectDimensionPipelines` 是整个文件**唯一没有 events 派生兜底**的字段，100% 依赖 canonical view（`useMissionDetailView`）。canonical 只在 `applyRefreshHints` 时 refetch；refreshHints **只由 live WS dispatcher 注入**（后端投影 `refreshHints:[]`，replay/polling 持久化事件不带）。WS 一断进 polling（Railway 每次 push 重启杀 WS / 长 mission / 自定义域名代理 socket.io 难）→ canonical 永不 refetch → dimensionPipelines 冻结在采集快照(chapters:[]) → `deriveDimSubStatus` 见 chapters.length===0 → 永远「采集完成」。
**"近期引入"=thinning 重构（2026-05）砍掉所有 legacy-view 字段的 events 派生，2026-05-27 逐个"回归恢复"（cost/verdicts/memory/agents/trace），唯独漏了 dimensionPipelines。**

**修复（4 项，类型+lint 0 error）**：

1. `dvProjectDimensionPipelines(view, events)` 补 events 派生（移植 backend `mission-view.projector.ts` extractDimensionPipelines 完整章节状态机）+ per-chapter 按状态推进度合并 canonical（`dvMergeChapters`/`DV_CH_STATUS_RANK`，谁状态靠后用谁，绝不回退任一侧）；grade 读 `overall ?? overallScore` 与后端 todo-board.projector 对齐。
2. `useMissionDetailView` 加 polling 兜底：`shouldPoll`（page 在 connState polling/disconnected 时置 true）定时 refetch，hook 内 `terminalRef` 终态自停 + coalescing 去重。根治所有 canonical-only 字段（references/reportVersions/finalScore）在 polling 下冻结。
3. quality-failed 一致性：MissionTodoBoard 新增 `missionQualityFailed` prop，`missionCompleted` 排除 quality-failed（维度卡片不再顶层显示「已完成」，与页头 pill「质量未达标」一致）。语义定调=quality-failed 工作做完(stages/agents/chapters→done 保留)但结果拒签。
4. page.tsx `totalWords` 既有 bug：`view.dimensionPipelines` 是 Map，原 `Object.values(map)` 永远空→totalWords 恒 0，改 `pipelines.values()`。

**待验证**：让一个 mission 不取消跑过采集完成，确认列表推进 + WS 断后 polling 兜底生效。教训：events 派生兜底是该文件既定模式，canonical-only 字段在 WS 退化场景必冻结。相关 [[project_playground_fail_closed_gates_2026_05_23]]。
