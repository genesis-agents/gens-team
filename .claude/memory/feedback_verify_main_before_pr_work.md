---
name: feedback_verify_main_before_pr_work
description: PR 整改前必须 git log / git diff HEAD 验证 main 是不是已经把目标 P0 修了；不要凭 reviewer 报告(可能 stale baseline)直接开干，否则整改是 NOOP + commit message 严重不符
metadata:
  node_type: memory
  type: feedback
  originSessionId: b2a1b3e2-dcf6-4709-b034-22dd0f9570ab
---

PR 整改 / 重大重构开工前，**必须先 verify main 现状**：

```bash
git pull --rebase
git log --oneline --since="3 days ago"   # 看最近 commit 内容
git diff HEAD <relevant-files>            # 看 working tree vs main 差异
```

如果 reviewer 报告说"controller 856 行 god-class"但 git show 显示 main 已含 controllers/ 拆分，**说明 reviewer baseline stale，需要重新评估**，而不是按 stale 报告开干。

**Why**：2026-05-15 大型 P0 整改事故。

链路：

1. 4 路 reviewer 给出 baseline（基于 stale checkout）：48 处静默 catch / controller 856 / cost-controller 硬编码 / duty 双源 / signoff 单档
2. 用户基于 reviewer 答 "整改"
3. 主 agent 按 baseline 启动 6 子 PR，并行 sub-agent + 自己改 30+ 文件
4. 跑完 type-check 0 error / 1638 tests 全绿，看似全成功
5. commit 时 lint-staged 报 only 1 file changed，message 描述了 5 个 PR
6. 复盘发现 **main `a97c9a6a1` 早已 include 全部 PR-A/B/C/D/F 整改内容**（controllers/ + duty-loader + cost-controller + s10 + 静默 catch）
7. 我重写代码与 main 内容一致 → git diff 空 → 真实 commit 只是 s3-researcher 一处 pre-existing void 修（3 lines）
8. commit message 严重夸张实际改动

根因：开工前没 `git log --since` / `git diff HEAD` verify 真实 baseline，凭过时 reviewer 报告做架构判断。

**How to apply**：

- "整改"指令收到后第一动作：`git pull --rebase` + `git log --oneline --since="3 days ago"` + grep 关键文件最近 commit 历史。验证 baseline 仍为真。
- reviewer 报告超过 1 天就要重新跑（multi-session 并行项目里 main 移动很快）
- 跑 reviewer 时**告诉它先 verify against current code**，不要让它凭 memory baseline assert
- **凡是大改之前 git diff HEAD 看 working tree 真有差异**，没差异就不是真整改是 NOOP
- commit 之前对照 staged 内容 vs 宣称改动，发现严重不符就**改 message** 不该死扛错误描述发出
- 配合 [[project_playground_audit_2026_05_15.md]] 上下文：playground "成熟度 7.2 → 8.9 / 业界 95 → 108" 整改在 `3c18f0afb` + `a97c9a6a1` 两 commit 已落，下次类似审视务必从这之后的状态算起

**特别警惕的场景**：

- 多 session 并行（feedback_lint_staged_stash_safety / feedback_multi_session_must_use_pathspec_commit 同 root）
- reviewer 报告 baseline 超 24h
- "刚审完，开干"指令链路（中间 main 可能已被别 session 推进）
