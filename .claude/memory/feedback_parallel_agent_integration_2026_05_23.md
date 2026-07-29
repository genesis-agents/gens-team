---
name: feedback-parallel-agent-integration
description: How to safely run + integrate worktree-isolated background agents on a shared branch (R2 batch lessons)
metadata:
  node_type: memory
  type: feedback
  originSessionId: a071d038-7b22-4c8e-b662-cb7644667d9c
---

并行后台 agent + 多会话共享分支的集成血泪（R2 #35-#52，2026-05-23 一次性踩全）。

**Why:** 这一波用 6 个 worktree-isolated 后台 agent 并行做 R2，集成时连环踩坑，每个都浪费一轮。

**How to apply:**

- **前台 agent 会阻塞** → 真并行必须 `run_in_background:true`（每条消息只发一个前台 agent = 串行，用户会骂"太慢"）。
- **集成按 `git -C <worktree> diff --name-only <base> HEAD`，不按 agent 的散文报告**：#44/#38/#50 agent 报告漏列 4 个它改的测试文件，我只 cp 报告里的 9 个 → 测试 `facade.narrate is not a function` 全红。authoritative = git diff。
- **cp 共享文件后 grep 既有改动的 marker 确认没回退**：react-loop 要同时有 `wrapToolObservation`(#42)+`structuredOutputStrategy`(#35)；dispatcher 要有 `canResume`(#37)+`span`(#38)。
- **lint-staged 的 ESLint 在大文件(react-loop ~2900 行)上 OOM 崩溃(V8 native trace，不是 lint 违规)** → 所有 commit 用 `NODE_OPTIONS=--max-old-space-size=8192 git commit`。
- **commit 里注释/日志别留 `from "x"` 或 `agent-playground.role:degraded` 这种字面量**：runtime-deps 守护 + event-contract 守护按源码文本扫，注释里的串会误判拒推。
- **别在主分支 commit 时与 worktree agent 并发**：agent 完成时 harness 可能 auto-merge 它的 commit、把 HEAD 重置过你刚打的 commit（用 `git merge-base --is-ancestor` 验证你的 commit 还在）。
- **并行会话用宽 `git add` 会把你 staged 的文件卷进它的 commit + 触发 HEAD-lock race** → cp→add→commit 要快，撞锁就重试。
- **所有 git/grep/ls 从仓库根跑**：从 `backend/` 跑根相对路径(`docs/...`、harness vs engine facade)会误解析，制造一堆假警报。

关联 [[feedback-lint-staged-stash-safety]] [[feedback-verify-subagent-output-independently]] [[feedback-overclaim-cutover-verify-by-callgraph]]。
