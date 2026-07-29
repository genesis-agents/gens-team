---
name: playground-version-drawer-2026-05-07
description: 2026-05-07 playground 版本历史抽屉对齐 TI（commit e12acc6e0）— 顶部按钮 + 时间线卡片 + radio 切换
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

## 2026-05-07 playground 版本化 UI 对齐 TI

**commit**：`e12acc6e0` (push 已落 main)
**用户痛点**：截图反馈"playground 版本化还不支持，看看 TI" — 实际是 v1 commit 774a71d13 端到端落地了，但 UI 形态藏在"元信息"tab 里小 select dropdown 里，与 TI 的「顶部 History 按钮 + 右侧抽屉」体感差距大。

## 修复（仅 UI，不改后端 / DB / API）

1. **新建** `frontend/components/agent-playground/artifact/ReportVersionDrawer.tsx`
   - 学 TI `frontend/components/ai-insights/reports/ReportRevisionHistory.tsx` 卡片样式
   - 时间线 + dot + 版本徽章 + triggerType 标签（首版 / 全量重跑 / 增量重跑 / TODO 重跑）
   - 评分 / Leader 签字 / 时间 / radio 单选切换
2. **改** `frontend/components/agent-playground/artifact/ArtifactReader.tsx`
   - 顶部工具栏新增「版本历史」按钮（History icon + 当前 vN 徽章 + N/total 计数）
   - 抽屉 state（versionPanelOpen），学 TI `TopicContentPanel.tsx:1544-1564` 的 sidePanelType
   - **删除** MetaTabBody 里的 select 下拉（双源治理）

## TI vs Playground 版本语义差异

| 能力           | TI                         | Playground                       |
| -------------- | -------------------------- | -------------------------------- |
| 切换查看       | ✅                         | ✅（本次新增 UI 形态对齐）       |
| Compare diff   | ✅                         | ❌（follow-up）                  |
| Rollback 回滚  | ✅                         | ❌（数据不可变快照，语义无意义） |
| Edit / AI Edit | ✅                         | ❌（mission 报告非协作编辑模型） |
| 版本来源       | 用户编辑 + AI 编辑 + rerun | 仅 mission 完成 / rerun          |

**关键洞察**：playground 的 "版本" 语义是 "mission 报告快照"，每次 rerun 写新版本（不可变）；TI 是 "协作编辑历史"，所以 rollback / edit 都有语义。盲目搬 TI 全部能力是错的，只该对齐 UI 形态 + 切换查看。

## How to apply

- 用户对标外部模块时（"看看 X"），先调研双方能力清单 + 标识**语义差异**，避免照抄不适配的能力
- UI 抽屉对齐时复用现有 props/API（reportVersions / currentVersion / onSelectVersion / versionSwitching），不需要后端改动
- 替换旧入口（select）时同步删除避免双源（feedback_no_dual_sources）

## Follow-up（不阻塞）

- Compare diff（学 TI L216-222 onCompare）
- 抽屉 i18n（当前中文硬编码）
- 抽屉打开时 Esc 关闭支持
