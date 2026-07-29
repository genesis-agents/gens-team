---
name: 创建 Mission 不要做花哨 hero
description: AI App 创建 Mission 入口走 modal + Topic Insight 风格（无渐变/无 stat 卡），不要做杂志风全页 hero
type: feedback
originSessionId: 6b5e5edc-9fec-4da6-a18a-afe7f61e93b4
---

# 创建 Mission 不要做花哨 hero

AI App 的「创建 Mission / 创建 Topic / 启动研究」入口必须走 **modal**（≤max-w-3xl），视觉对齐 Topic Insight CreateTopicDialog —— light-only / 无渐变 / 无 stat 卡 / 无 metric 卡。

**Why**：2026-05-10 用户截图反馈 Playground 的全页 launcher（DemoLauncher + /agent-playground/team/page.tsx，加起来 912 行）"非常花哨，一点也不商务并且很啰嗦"。具体被点名的反模式：

- 顶部全屏 `bg-[radial-gradient(...)]` + 14×14 渐变 logo + 大写斜体 `RESEARCH TEAM` 徽章
- 右上 3 张 stat 卡（真实搜索 / 结构化约束 / 实时进度）
- 右侧"配置摘要" 4 张 icon 卡
- 主区"运行预估" 4 张 metric 卡 + 3 行提示行
- "MISSION BRIEF" 二级徽章
  装饰把 5–8 个真实决策字段（话题/深度/语言/预算/时效/KB/审核/图）淹没了。

**How to apply**：

- 写新 AI App 的"创建/启动" UI 时直接用 `MissionDialogShell`（components/common/dialogs/MissionDialogShell.tsx）
- 必填区只放 ≤4 个核心字段（话题 + 深度 + 语言 + 预算），其余进 `advanced` 折叠
- 提交按钮文案直白（"启动 Mission"），不要"启动研究团队 + Sparkles 图标 + ArrowRight"三件套
- 如果 PM/PD 提议加 hero / stat 卡 / 配置摘要侧栏，举本条 + Topic Insight 截图反驳
- 例外：营销落地页 / 产品介绍页可以花哨，但**业务工具**的"创建表单"不是
