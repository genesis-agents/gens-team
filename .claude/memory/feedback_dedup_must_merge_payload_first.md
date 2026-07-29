---
name: feedback-dedup-must-merge-payload-first
description: dedup/隐藏 1:1 alias DB 行前必须先把 alias 的 config/payload 合并到 canonical，否则 alias 行数据消失
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6f88d14d-3d90-467a-b940-ff29c27662ce
---

DB 双行（alias toolId + canonical registry toolId）做 dedup（admin list 隐藏 alias）时，不能假设 canonical 行已经持有所有数据。历史 migration 可能直接 INSERT 到 alias 行（如 `industry-report` 带 `config.sources[]`），而 canonical 行（`industry-report-search`）由 registry 注册创建时可能 config 为空。dedup 隐藏 alias 后，前端读 canonical 就丢数据。

**Why:** PR-S0a syncToolConfigs Case A/B 只在"一边存在另一边不存在"才迁移，**两边都存在但 config 不同**不触发 sync；migration 历史顺序 + registry 注册顺序决定数据落在哪一行，dedup 无法静态推断。第三方信源 2026-05-12 真实事故。

**How to apply:** dedup/合并任何"双行兼容补丁"前先做 reverse-lookup 合并：

1. canonical 行 config 空 / 关键字段缺失 → fallback 到 alias 行的非空字段
2. 合并发生在 `getXxxConfigs()` 返回前（read 时回填），不要靠 startup-only sync
3. 前端读 canonical，但保留 legacy alias 兜底（双 find）
4. 单纯 `.filter(c => !isRedundant(c))` 是错的——必须先 `mergeFromAlias()` 再 filter

适用范围：所有"前后端历史代码各用各 id 都能 patch"的双行补丁（tools / models / providers / agents）。
