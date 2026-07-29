---
name: feedback-autonomous-mode
description: 用户偏好自驱模式 — 完成当前任务后主动推进自然的下一步，少问多做
metadata:
  node_type: memory
  type: feedback
  originSessionId: aa7b8f6c-d97e-4b52-a56e-ff61bfd4e543
---

用户多次要求"自驱处理"/"后面自驱模式"。倾向：完成一个任务后，主动识别并推进自然的下一步，不要每步都停下来问。

**Why:** 用户在这个项目里给的是大方向（如"清 worktree 然后推进 roadmap"、"深度业务推理"），期望我自己拆解 + 连续执行，而不是做完一小步就回头确认。多次出现"为什么这么慢"，说明等待/反复确认让他不耐烦。

**How to apply:**

- 大任务拆成子任务后连续做，用 TaskCreate/TaskUpdate 跟踪进度，做完一批再汇报
- 低风险动作（写文档/测试/spec/守护栏/import 修复）直接做，不问
- 仍需确认的：破坏性操作（worktree remove / reset / force push）、运行时行为改动有 blast radius（如改 timeout/auth/graceful shutdown）、架构决策（新依赖/接口设计）—— 这些按 CLAUDE.md "架构决策必须确认" 仍要先说方案
- commit + push 在这个项目是被默许的连续动作（用户已多次让我 commit+push），但每次仍 verify 通过再推
- 并行 sub-agent 是用户认可的提速手段（4-way review / 5 路 e2e 都用了），独立工作优先并发

[[feedback-index]]
