---
name: 杂志风格 hero 条不能塞进窄 sidebar
description: ReportHeroStrip / 类似多列 stat grid 是给主阅读区全宽（≥768px）设计的，被塞进 sidebar / slide-over 必然挤成 3 列 × 多行，标签数字一坨；窄面板必须用单列 icon-label-value 布局
type: feedback
originSessionId: b563b5ca-9b52-4741-90db-57cabe79a67c
---

杂志风格 hero 条（ReportHeroStrip 6-cell stat grid + 4 tag + 渐变背景）只能用在主阅读区全宽。
塞进 ≤480px 的 sidebar / slide-over / drawer 时，`grid-cols-3 md:grid-cols-6` 会退化成 3 列 2 行，
配合渐变 tag + 圆角徽章在窄面板里更显廉价（用户原话"极其难看"）。

**Why**：grid-cols-N 的 stat 卡是横向信息密度优化，每个 cell 至少 100px 才不挤。
窄面板纵向滚动友好，应该用 row-based stat list（单列 icon + label + value）。

**How to apply**：

- sidebar / slide-over / drawer / modal-side ≤ 600px 宽时，**禁止**塞 multi-col stat grid
- 用 `<StatGroup>` + `<StatRow>`（详见 ArtifactReader.tsx 末尾两个组件）：
  - 每行：`px-3 py-2`，`flex justify-between`，`Icon (h-3 w-3 in 5x5 violet box) + label-灰色 ←→ value-黑加粗`
  - 多组合并：在 StatGroup 之间留 `space-y-4` + 上方小标题（`text-[10px] uppercase tracking-wider text-gray-400`）
- hero 卡如果要复用就放主阅读区（ContinuousReader / ChapterReader 顶部），不放 ArtifactReader 的 slide-over
- 截图 30 当天 commit `95284b8ed` 直接把 ReportHeroStrip 整个删了 —— 没有跨场景复用，无人消费就别留

**踩坑次数**：1（2026-05-06 截图反馈）
