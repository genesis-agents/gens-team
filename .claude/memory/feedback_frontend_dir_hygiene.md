---
name: feedback-frontend-dir-hygiene
description: '用户对前端目录结构有强洁癖，会逐个目录追问归属；按 02-directory-structure.md 的"消费方数量"规则归位，分 Tier 独立 commit'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 494c61c5-c748-4a7c-a8fd-f4d7cda538da
---

用户对 `frontend/` 目录结构有很强的洁癖，会**逐个目录连续追问**该放哪（一次 session 内连问了 byok/layout/profile/settings/agent-playground/custom-agents/hooks/lib）。处理这类问题的有效模式：

**判定规则（来自 `.claude/standards/02-directory-structure.md`，要主动套用）：**

- 组件：单一消费方 feature → `components/{feature}/`；跨 feature → `components/common/{concern}/`；纯 UI primitive → `components/ui/`；全局骨架 → `components/layout/`。
- hooks：只允许 `core/domain/swr/features/utils`，**根目录不得有散落 hook**。
- lib：`api/utils/constants/types/{feature}`，根目录不得散落。
- feature 目录名应**镜像路由段**（如 `components/custom-agents` ↔ `/custom-agents`）——名字违和多属"产品命名"问题，重命名 churn 大、价值低，**不要为美观重命名**。

**Why:** 用户把目录整洁度当作交付质量的一部分；legacy 命名（profile/settings 这种 god-page 遗留）残留会被反复点名。死代码（如 0 引用的 `lib/api.ts`）发现后应直接删而非搬运。

**How to apply:** 回答归属问题时给**决断性表格**（目录→去向→理由），按风险分 Tier，**多文件移动属架构变更需先确认**（用 AskUserQuestion 给执行范围选项）。执行时：`git mv` 保历史 → 逐文件 grep 改源 → tsc 验证 → **每 Tier 独立 commit** 便于回退。验证完整性靠全局 grep 残留旧路径 + `tsc` 0 error。相关：[[feedback-verify-field-names-both-ends]]。
