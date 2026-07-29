---
name: subagent-ui-add-must-grep-existing
description: Sub-agent 加 UI toggle / 按钮前 prompt 必须命令它 grep 同字段已有控件，否则盲目加导致双源
metadata:
  node_type: memory
  type: feedback
  originSessionId: f4887b10-a190-477c-87ef-92a946e335e1
---

Sub-agent 在大文件里加 UI 控件（toggle / 按钮）时**不会自动发现既有同字段控件**，
prompt 若只说"加 instantPushForTier3 toggle"，sub-agent 找一处空白塞进去就交差，
结果同字段两处 toggle 视图 = `feedback_no_dual_sources` 反模式。

**实例**：DR2 X3 sub-agent 在 settings/notifications page 矩阵下方加了
`instantPushForTier3` toggle，没发现 page 顶部全局开关 section 已有同字段 toggle。
两处都绑 `draft.instantPushForTier3`，用户体验混乱。

**Why**：sub-agent 上下文只看局部 prompt + 它读到的文件区段，缺全局视野。

**How to apply**：

- Sub-agent prompt 加 grep 命令显式列举既有同字段引用：
  `grep -n "instantPushForTier3" frontend/app/.../page.tsx`
- prompt 要求 "若已有同字段控件则不重复加，复用既有或迁移；否则报告决策"
- 主 agent cherry-pick 后必须 grep 字段引用计数；>1 视为双源 must 修
- Reviewer 子代理 review 时显式检查 "同字段是否多处 toggle / 同概念是否多处入口"
