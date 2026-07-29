---
name: feedback-look-at-history-before-redesign
description: '用户说"功能搞丢了/不全"时先翻历史 commit 看上一版怎么做的，不要凭猜空气重写'
metadata:
  node_type: memory
  type: feedback
  originSessionId: ce962b97-346a-4c98-ae26-9cff763089b3
---

用户反馈"政策研究的工具呢搞丢了？？？" / "大量不全" / 类似 "之前有 X 现在没了" 时，第一动作是 `git log -S "关键词"` + `git show <hash>~1:<file>` 看上一版完整结构，**不要**从零凭印象重写分类/UI。

**Why:** 2026-05-11 admin/tools 分类 W3r3 改版时我没去翻 ddaeb49e7~1 的 capability-mapping.ts（13 类 + Chinese label + colors + toolId 全集），自己重写 USE_CASE_GROUPS 但 toolId 名字写错 / 颜色不对 / 漏 google-tts/政策研究 / industry-report 进错 tab。用户被迫 4 轮反馈"政策研究的工具呢搞丢了"+"按照历史版本这个重新设计表格"+"你到底看过历史版本没有"。最终把昨天的 capability-mapping 重抽成共享真源 `lib/admin/tool-categories.ts` 才修对。

**How to apply:**

1. 用户讲"上一版" / "昨天" / "之前有" → `git log --oneline -S "feature-name"` 锁定改动 commit，`git show <hash>~1:<file>` 看上一版完整代码
2. 上一版有 "data shape / 数据真源"（如 capability-mapping）时 → 直接抽出来做共享真源，不要重新罗列；保留昨天的 toolId 全集、label 全集、颜色全集
3. 重写 UI 渲染层是可以的，但不要把"已经踩过坑测过的数据映射"丢掉重新猜（toolId 形态、provider 别名都易错）
4. 多 tab 共享同概念分类时 → 统一抽 `lib/admin/<thing>-categories.ts`，避免 BuiltinToolsTable / APIServicesTable 双源漂移

**反模式**：

- ❌ 看 user 截图 + backend 代码，自己列 USE_CASE_GROUPS 全集，赌 toolId 名字是 'arxiv' 还是 'arxiv-search'
- ❌ 只改一个 tab 不改另一个，假设两 tab 数据"互不交叉"
- ✅ 第一动作 `git log --diff-filter=D -- <file-or-dir>` 看被删的同概念组件，恢复其真源
