---
name: feedback_refactor_must_preserve_function
description: 重构期间已工作功能（如 PR
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

用户红线（AI Social 重构期 2026-05-16）："功能上务必确保可用！！！！"

**Why:** PR #97-110 撞墙 14 轮后 PR #111 终于把 WeChat 草稿封面+正文图修好。任何重构波次（god class 拆分 / pipeline 改造 / agent team 引入）破坏这个已修好的功能链路 = 用户体验回到 14 轮撞墙前。重构带来的架构收益远小于破坏已工作功能的代价。

**How to apply:** 重构 PR 每波次合并前必须：

1. 真发一次 WeChat 长图文（>2000 字 + 多正文图 + 外部 cover URL），对照截图验证：
   - 草稿箱列表卡缩略图显示
   - 草稿编辑器正文图渲染
   - saveDraft 响应 cover_check_info.err_format 为空
2. spec 全量过（≥85% coverage 维持）
3. pre-push 5 项全过（god-class / arch / type-check / build / changed-tests）
4. **禁止**用"未来修复"TODO 占位 / 临时关闭旧测试 / 跳过真发声称"代码层验证够了"

W1 前台 stepper 不涉及 publish 链路可豁免真发；W2+ 一律真发。

相关：[[feedback_e2e_must_visit_ui]]、[[feedback_no_lying_assertion]]、[[feedback_consensus_must_iterate_to_all_yes]]、[[feedback_wechat_new_editor_schema_overhaul]]。
