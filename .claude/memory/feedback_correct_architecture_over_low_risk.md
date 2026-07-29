---
name: feedback_correct_architecture_over_low_risk
description: '别用"低风险/安全小切片"驱动决策，要按正确架构、正确实现来'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 04499ded-3669-4244-9274-3298bf9f3384
---

收尾重构/技术债时，不要老是提"先做安全的小切片、把难的/缠绕的部分往后推"。用户明确反对这种用风险回避代替架构正确性的做法。

**Why**：半拉子状态（dual-path 读、保留 legacy crypto/CBC、`donated` 这种语义混淆别名）恰恰是重构本要消灭的债。"dual-read 还能读 v1 所以不急"、"留着 @deprecated 别删"这类话术是在拿"安全"当借口停在错误中间态。

**How to apply**：

- 先决定**正确终态**（结构性分离而非过滤分流、全量迁到 v2 后删掉 legacy 解密、混淆别名改成正确 taxonomy），再按依赖顺序把每个 PR 做**完整**，不挑软柿子。
- 迁移/backfill 要做（幂等、可验证、可回滚是"正确实现"的一部分），而不是因为"动生产数据有风险"就跳过、留半套。
- 架构决策仍要先和用户确认方案（[[feedback...]] 架构红线），但确认的是"哪个是对的"，不是"哪个最稳别动"。
- 关联本项目实例 [[project_byok_tool_key_redesign_2026_05_28]]：BYOK 加固收尾要推到正确终态（secrets 回系统专用+删 legacy 读、v1→v2 全量 backfill+删 CBC、退役捐赠池并修 apiKeySource taxonomy），不是只挑 PR-4.4 安全清理。
