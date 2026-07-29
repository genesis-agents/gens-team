---
name: feedback_reviewer_grep_origin_main_before_p0
description: 'security-auditor 类评审报 P0（如"AdminGuard 错配 controller"）前必须 git show origin/main:path 验证是不是 PR 引入的，预存设计意图不该算本 PR P0'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7c275681-3745-4c0b-b722-fbe6b75dc9e0
---

评审 agent 报 P0 前 grep `git log --oneline -- {file}` 或 `git show origin/main:{file}` 验证字段/守卫/装饰器是不是本 PR 引入的。

**Why**：REV-γ round-4 报 P0-1「AdminGuard 错配所有 social 路由」实际是 origin/main 上预存设计（social 是 admin-only 功能因 BYOK cookie 敏感），本 PR 没改 guard 设置。误报 P0 浪费一轮 round-5 复审且差点动用户的设计意图。同 round 报的 P0-2 BrowserContextTool fnSource 才是真 PR 引入。

**How to apply**：评审 prompt 强制添加：

> "报 P0 前必须 `git log --oneline -- <suspect file>` + `git show origin/main:<path>` 验证是否本 PR 引入。预存设计 ≠ 本 PR 缺陷，必降级或驳回"

参考 [[feedback_5_reviewer_parallel_audit]]：reviewer 报 P0 必须人工核实前提条件；[[feedback_audit_must_verify_dual_source_layer]] 类似规则适用于"双源 / 应上提"判定。
