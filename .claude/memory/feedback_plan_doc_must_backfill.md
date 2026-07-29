---
name: Plan 文档必须随每个子 PR 回填状态
description: 设计文档 (如 v5.1 plan) 是 single source of truth，每子 PR 落地必须立刻回填 commit hash + 状态；不得让 30+ commit 之后才被用户发现 plan 仍是初版
type: feedback
originSessionId: 94c0899f-9d18-492b-abde-5c553623a0bd
---

每个 R/PR 子项落地后必须立刻把状态写回对应的 plan / design 文档（如
`docs/architecture/ai-app/agent-playground/anthropic-sdk-revamp-plan-v5.1.md`）。

**Why:** 2026-05-04 用户在 R2-A.4 落地后发现：30+ R0.5/R1/R3-A/R2-A0/R2-A.0~A.4
commit 全部落了主干，但 v5.1 plan 文档里所有任务还标"待办"，没有任何 commit
hash 回填。这违反项目铁律 "plan 文档是协作 single source of truth"，让用户
无法从 plan 判断"哪些已落 / 哪些仍待办 / 主干现在是什么状态"。

**How to apply:**

1. 每完成一个子 PR（如 R2-A.4），commit 业务代码后**立刻**追加一个 `docs(plan)`
   commit 把对应行从 ⏳ pending 改 ✅ + 填 commit hash
2. plan 文档增加固定 §4.0（或类似）"实施进度回填"章节，所有状态变化集中在此
   表里更新；plan 其余章节保留原始设计上下文不动
3. 多个细化子项（如 R2-A 拆 A.0~A.13）必须把每个细子项也单独列行
4. 关键里程碑（如 "R2-A.13 = pipeline-v1 首次完整可跑"）单独表
5. 主干安全状态注解（"默认 env 不设 → 100% 走 legacy，零影响"）必须在 plan
   里给出，让用户/团队判断是否能 push

不能等用户来问"为什么状态不回填"才补；这是基础的执行纪律。
