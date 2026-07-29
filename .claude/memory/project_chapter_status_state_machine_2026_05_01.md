---
name: chapter-status-state-machine-traps
description: Playground chapter 5 终态映射 + retry todo lifecycle 双 bug — 任何新 status 加进 derive.ts 都要在 4 处 UI mapper 同步加分支
type: project
originSessionId: 8a597039-012b-4808-b6e7-ad19724f374c
---

## 2026-05-01 用户实证：评审通过后跳到"待启动"+ retry 卡已完成

### 真因 1：chapter:done 终态在 4 处 UI mapper fall-through

derive.ts 把 chapter status 跑成 8 态：`pending / writing / reviewing / revising / passed / done / failed-finalized / failed`。
但 UI 侧 4 处 mapper 都只覆盖了前 5 态，新加的 `done`/`failed-finalized` 全部 fall-through：

1. `TodoDetailDrawer.tsx` 章节进度面板 statusLabel + cls
2. `MissionTodoBoard.tsx` `labelDimensionStatus` 的 `passed` 计数
3. `todo-ledger.ts` 兜底循环 `passed`/`failed` 统计 → dim 卡 `in_progress`
4. `ChapterReader.tsx` stats 已完成计数

**Why:** chapter:writing → review:completed (passed) → chapter:done 三事件链贴近同一毫秒触发，
status 跳到 'done' 的瞬间所有这些 mapper 退到 default `'待启动'`，用户看到"评审通过后跳待启动"。

**How to apply:** 任何时候在 `derive.ts` 的 chapter / dim 状态机加新 status，必须 grep 这 4 处显式补分支。
建议把 chapter status 抽成共用 `chapterStatusLabel(status)` helper，避免散点漏。

### 真因 2：leader-assess-retry 子 todo 在 researcher:completed 即 done

todo-ledger.ts retry 分支历史背景（task #37）：
原本所有 dim-scope todo 都被 grade 驱动，导致 retry 子 todo 借用第一次的 grade 显示假完成。
当时的修法是：retry 子 todo 在 researcher:completed (with retryLabel) 时直接 `status='done'`，
不进 dimensionPipelines 兜底循环。

但这一刀切错了 —— researcher 完成只是数据采集 done，下游 chapter 重写 pipeline 还在跑（task #61
fresh-collect 给 retry 单独 pipelineKey 隔离了）。结果 row 主状态显示"已完成"但章节 badge 仍 评审中，
用户看到的状态自相矛盾。

**Why:** researcher 完成 ≠ dim 完成。chapter:writing/reviewing/revising/done 才是真正的 dim 终态闸。

**How to apply:** retry 子 todo 走和原 dim todo 同一兜底循环，但用 `td.pipelineKey ?? td.dimensionRef`
索引 dimensionPipelines（task #61 fresh-collect 已用 pipelineKey 隔离避免借用原 dim grade）。
仅 `leader-assess-abort` 跳过此循环（abort 直接终结，无 chapter pipeline）。

### 修复 commits

- `1dc467736` — 4 处 UI mapper 补 `done` / `failed-finalized` 分支
- `d490e6cde` — retry todo 走 chapter pipeline 兜底，按 pipelineKey 索引

### 旁观察：runDagConcurrency 拓扑分批 → 滑动窗口

同一轮顺手把 `agent-invoker.runDagConcurrency` 从"拓扑层 await 整层完成才下一层"
改成"任一节点完成立即扫子节点入 ready 队列，并发槽 < concurrency 立即 dispatch"。
非 DAG 路径本来就是 pLimit 滑动窗口，DAG 路径以前是 batch-of-N。
