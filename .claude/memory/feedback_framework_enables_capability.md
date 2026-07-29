---
name: feedback-framework-enables-capability
description: framework 抽取是"赋能未实现能力",不是只"消除已有重复代码"
metadata:
  type: feedback
---

2026-05-24 翻车二次:P5 rerun framework 评估时,sub-agent 跑出"只 playground 有 rerun,social/radar 没有,1 处使用未达 3 处抽象阈值"的结论,我同意了。用户怒驳:**"必须下沉,现在是因为没有实现,实际是需要 rerun 的!!!"**

**Why**:我对 framework 抽取的理解狭隘成"消除已有重复代码"(防过度抽象),但用户视角:

- mission-pipeline 范式 → 必备 rerun 能力(checkpoint 恢复 / 重跑 stage)是核心能力,不是可选
- social/radar 没 rerun 不是因为不需要,**是因为还没做**(技术欠账)
- 下沉 framework 后,social/radar **继承一行就能获得能力**;不下沉的话每家都要从 0 重写 ~2700 行
- 这是 framework 真正的价值:**赋能多个 app 共享同一类能力**,不是只清理重复代码

**判错根因**(与 `feedback_grep_before_yagni_judgment` 互补):

- 那条说"grep 先于 YAGNI 判断,有 ≥3 处使用就该抽"
- 这条补:**即使只 1 处现有使用,如果该能力是范式必备(且其他 N 家计划用),也该下沉**
- 错误启发式"3 处再抽"用于"无关重复代码";**对必备能力不适用**

**How to apply**:

- 评估 framework 抽取时,要问两类问题:
  1. **现有问题**:有多少处 copy-paste?(已有 grep 路径)
  2. **未来问题**:其他规划中的同类 app 是否都需要这个能力?(mission-pipeline = 必备 rerun/lifecycle/orchestrator/dispatcher/invoker;非 mission-pipeline 不需要)
- 任一答案是 yes 就该抽,不能只看(1)
- 业务专属部分(SQL 表名 / stage handler 字典 / patch rules)可留 app 作为 implementation,**但 framework 必须存在以承接其他 app 的 implementation 注入**
- spec 验证标准:写一个 dummy mock 子类(模拟 social/radar)证明 framework 真可被复用
- agent 跑出"不下沉"结论时,我必须先问"这是必备能力吗?"——如果是,**坚持下沉**

**反指模式**:

- agent 说"social/radar 没有"→ 我接受"那就跳过" → ❌ 错
- agent 说"PR-E3 留言'等第二个 app 真需要再做'"→ 我接受 → ❌ 错(那条留言可能本身就是同样的判错)
- 正确反应:**先问用户"这能力是不是必备?"**;如果是,framework 必须存在

[[feedback-grep-before-yagni-judgment]]
[[feedback-dont-double-down-on-theory-when-user-pushes-back]]
