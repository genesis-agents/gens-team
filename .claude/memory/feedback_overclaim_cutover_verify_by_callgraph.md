---
name: feedback_overclaim_cutover_verify_by_callgraph
description: '声称"切换/单入口/无双写"前必须用调用图证明,不能拿测试绿当完成证据'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0810107b-2c80-4d52-9e2a-ff7be69507e3
---

2026-05-22:用户(借 Codex 对抗式复审)抓到我把 mission-runtime-contract 报成"完成",但 C0 的 finalize() 唯一终态写入口生产侧零调用(切换从未做,我自己注释都写"待 T16 切"),userProfile 终态写路径仍在双写(我只查了 read + create 没追终态写)。

**Why:** 我的验收门是"测试绿 + 抽查",不是"对着声称的不变量对抗式查调用图"。带敌意的新读者(人/另一个模型)必然抓 over-claim;deprecation 注释("待 X 切")= 未完成红旗,我却埋了。这直接违反用户硬约束"真实切换 / 无双写"。

**How to apply:**

1. 凡声称"切换/单入口/无双写/收口",先 grep 新 API 的**真实生产消费方**(排除 test/doc/re-export)+ 证明旧路径**已无生产调用点**,把调用图当证据写进收尾报告。
2. 区分"抽象建好+测试绿"与"生产主路已切换"——绝不把前者报成后者。
3. 端到端追踪每一条终态写/双写路径到底(read + create + **terminal write** + liveness + rerun),不能只查一两条。
4. 任何 `@deprecated 待 X 切` / TODO-切换 注释,收尾必须显式列为"未完成",不许埋。

关联 [[feedback_finish_then_review]] [[feedback_no_dual_write_hard_constraint]]
