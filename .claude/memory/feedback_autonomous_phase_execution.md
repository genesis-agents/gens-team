---
name: Phase 任务连续执行，中途不提交
description: 大阶段（如 Phase 0 包含多个 PR）要一次性完成所有子任务后再统一 commit，不中途确认、不逐 PR 提交
type: feedback
originSessionId: 274389ce-def6-482c-bba4-733e8d5c6def
---

# Phase 任务连续执行，中途不提交

**规则**：当用户给出一个 Phase 级任务（包含多个子 PR），Claude 必须自主连续执行到 Phase 全部完成，中途不问"是否继续"、不做 `git commit`。

**Why**：2026-04-22 session 用户明确说"后面不需要确认，你要把所有剩下的任务持续执行下去，直到达成目标，整体完成前，不要做任何提交"。用户更在意**一次性交付 + 统一 review 整个 Phase 的改动**，而不是碎片化逐 PR commit。

**How to apply**：

- 用户给出一个多步任务（如 Phase 0 = PR-0.1 + PR-0.2 + PR-0.3），一次性写完所有代码 + 测试 + 文档 + HANDOFF 更新，最后让用户 review
- 期间仍然要跑 type-check / lint / jest 保证每步绿灯，但**不要 `git add` / `git commit`**
- 如果遇到真正阻塞（如需要用户决策的架构分叉），才停下来问；否则默认自己拍板
- Phase 结束时一次性总结全部交付，让用户一次 review 所有 diff 后再统一提交

**不适用场景**：

- 单个独立任务（如"修这个 bug"）按项目默认 bug fix 原则走
- 用户明确说"做完这步先提交"时按用户指令走
