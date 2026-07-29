---
name: mission-textarea
description: 'AI Apps 的"新建 Mission/Topic/任务"对话框默认提供 topic 短输入 + description 长输入两件套，让用户能精准表达意图，而不是逼用户把所有上下文塞进一个短 topic'
metadata:
  node_type: memory
  type: feedback
  originSessionId: a67ed222-b220-4885-9230-033fd6d1e8ea
---

AI Apps 的"创建 Mission / 新建 Topic / 启动任务"入口默认必须是**两个输入框**：

- **主题 / 标题**（topic）：短 ≤200 字，用于命名 / 列表渲染 / mission 检索
- **描述**（description）：长 ≤2000 字，用于详细背景 / 关注角度 / 约束 / 排除项

两个字段都必须通过 zod DTO + interface + LLM prompt 端到端透传到 LLM（不要只持久化不喂模型）。

**Why：** 2026-05-12 截图反馈（Screenshot_65）+ 用户原话"主题比较简短的，但是描述可以大，以便于LLM更好地理解用户意图"+"是两个输入框啊"。之前 PlaygroundMissionDialog 只给了一个 200 字 topic textarea，逼用户把所有意图压缩进一个标题，Leader plan 阶段拆维度只能凭短句猜——这是 [[feedback_no_hero_in_create_mission.md]] 反极端化（modal 不要花哨）后没补的另一面：克制 ≠ 砍掉用户表达能力。

**How to apply：**

- 任何 mission/topic/task 创建对话框默认结构 = topic 短框 + description 长框；不要只给一个框
- description 字段必须沿 DTO → LeaderTask/Input 接口 → 所有 LLM phase（plan / assess / foreword / signoff）prompt 全链路透传，不要"只存数据库不进 prompt"
- LLM prompt 模板里用 `{{#if description}} ... {{/if}}` 软渲染，不强制必填（用户没写就不出现引用块）
- description 字段不需要单独 DB 列：现有 mission 表通常有 `userProfile: Json?` 快照整份 RunMissionInput，加 zod 字段就自动持久化；rerun-runtime-builder 重建 input 时 description 也自动跟着回来
- 工作量参考：~10 文件 / ~74 行新增（DTO zod / LeaderTask interface / LeaderAgent 4 phase Input schema / SupervisedMission 4 个 runFn input / dispatcher → leader task forward / 4 个 duty .md prompt 模板 / 前端 RunMissionInput 类型 / 前端 dialog state + textarea + 提交 trim）；无 DB 迁移、无 spec 改动
