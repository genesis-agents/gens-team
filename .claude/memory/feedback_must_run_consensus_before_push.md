---
name: ""
metadata:
  node_type: memory
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

任何标"完成后做多路集中审视共识"或类似指令的任务，**必须 push 前真跑
4-5 路评审 sub-agent + 达到 4/4 或 5/5 YES 共识才推**，不能 verify:full 绿
就当达成共识。

**Why:** 2026-05-17 ai-radar source-curator drop X 推荐 commit 3cfbcbddd，
我 verify+commit+push 完才被用户问"有没有五路共识"。补做 5 路评审一跑
出来 3 NO（arch / tester / security）+ 2 YES with conditions（pm / reviewer）—
P0×4 + P1×5：VALID_SOURCE_TYPES 双源 / RadarSourceType 假分离 / KOL→公司
公关稿 价值偷换 / filter 大小写漏 / spec 漏 X-drop test。R2 整改一波才到
5/5 YES（commit 54b96fb99）。用户原话："你好好看看到底现在是什么样的一
个情况，有没有五路集体评审共识"——push 前没做 = 用户必抓。

**How to apply:**

- 用户说"完成后多路集中审视共识"/"持续迭代直到共识"/"5 路评审"等字眼，
  立即把"R-N 5 路评审"作为 push 前的强制任务，TaskCreate 标 in_progress
- 5 路常用分工：arch-guardian + reviewer + tester + pm + security-auditor
  （正交，避免重叠让 P0 漏；feedback-multi-reviewer-must-separate-concerns）
- 共识标准：所有路 YES 或 YES with conditions（非 NO）；任意路 NO 必须修
  到该路再 review 通过；R3/R4 也可能
- 我的 verify:full 绿 ≠ 共识达成；类型 + 测试 + 构建只能证明代码自洽，
  不能证明业务策略 / 契约边界 / 用户视角对齐
- 如有 sub-agent 报"建议加但不阻塞"，要么当场加要么明确记入 follow-up
  task，不能含糊带过

相关：[[feedback-consensus-must-iterate-to-all-yes]] [[feedback-implementation-rounds-need-review-too]]
[[feedback-review-must-audit-module-contracts-not-only-diff]]
