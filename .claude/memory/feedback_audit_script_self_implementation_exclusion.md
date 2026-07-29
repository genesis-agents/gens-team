---
name: feedback-audit-script-self-implementation-exclusion
description: 公共组件强制复用类 audit 脚本必须 exclude 该公共组件自身实现路径，否则 Modal.tsx/LoadingState.tsx 自身就被规则误报
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4ba200e5-9b40-4309-a19e-0e62967e8e36
---

写"强制使用公共组件 X"类 audit 脚本时（如 R6 弹层必须用 MissionDialogShell/SideDrawer/Modal），EXCLUDE_PATTERNS **必须** 包含这些公共组件**自身实现路径**，否则 Modal.tsx 自身就被 R6 误报。

**Why**：2026-05-18 实施 scripts/audit-ui-discipline.ts 时首次跑出 93 处 R6 违规，sample 里第一个就是 `components/ui/dialogs/Modal.tsx:161` —— Modal 自己当然要写 `fixed inset-0 + z-50 + backdrop`，它**就是 Dialog 的实现**。同理 LoadingState.tsx 自己要写 `animate-pulse`、SideDrawer.tsx 要写 `fixed inset-y-0`。加 `components/ui/` 和 `components/common/` 到 exclude 后 R6 从 93 降到 76、TOTAL 从 607 降到 562，更接近真实"页面级违规"信号。

**How to apply**：

- 写"X 必须 import Y 公共组件"类 audit 规则时，至少 exclude：
  - `components/ui/`（公共 UI primitives 实现地）
  - `components/common/`（公共业务组件实现地）
  - 项目内"已知自实现"的特定文件（用 `components/profile/UserApiKeyDrawer.tsx` 这种全路径加入）
- 报告里写明排除范围，方便 reviewer 验证是否 over-exclude
- 规则是"页面级治理"工具，不是"全代码风格"工具——目标是 app/ 和 page-related components，不是 leaf utilities

**反例**：首版扫描误报 17 处合法的"公共组件自身实现"，让基线数字虚高 8%。

相关：[[feedback_check_reuse_before_building]] [[project_frontend_ui_baseline_2026_05_18]]
