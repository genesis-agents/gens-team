---
name: feedback_design_doc_before_big_feature
description: 大型新功能/产品级设计先落正式方案文档(docs/features/)并用 AskUserQuestion 锁命名与信息架构再写代码
metadata:
  node_type: memory
  type: feedback
  originSessionId: ddcd77c4-e70e-46b7-960b-48ea2314f65d
---

大型/产品级新功能（新模块、新 UI 架构、跨前后端的能力）开工前，用户要的是**一份落成文件的方案文档**，不是边聊边改代码。

**Why**：2026-06-07 做「一人公司操作系统」(智能体市场 + 我的团队)，我探索完代码就直接动手写组件，被连续打断 4 次：「你要先出方案啊！！！」「形成方案文档，不要一上来就代码」「先落文本方案，不要着急改代码」。用户在命名(智能体市场/我的团队/我的密钥)、信息架构(/me 分组重构)、布局(组织图+内部Tab)上反复迭代，每次都先要看清楚再确认。

**How to apply**：

- 大型功能：先写 `docs/features/<feature>/design.md`（愿景/组织模型/命名/信息架构/后端复用映射/分期里程碑 M0-Mn/各自验证标准），随聊随更新到文档里。
- 用 AskUserQuestion 锁定**命名**和**信息架构**等高杠杆决策；布局类用 `preview`(ASCII mockup) 让用户选。开放问题列进文档「决策记录」节，逐条闭合再进代码。
- 闭合所有开放问题后再写代码；M0 通常是「纯前端可点击原型 + mock，不接后端」。
- **与 [[feedback_autonomous_mode]] 不冲突**：autonomous「少问多做」针对增量低风险动作(文档/测试/fix/commit+push)；本条针对大型新功能的方向性设计——那里少问多做=抢跑返工。判据：改动是否引入新命名/新模块/新信息架构/不可逆方向选择。
