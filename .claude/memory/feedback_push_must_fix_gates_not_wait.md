---
name: feedback_push_must_fix_gates_not_wait
description: 硬规则——提交/推送前所有闸门必须整改达标后才算完成；连带的别人提交跑红也要修到合规，不许「等别人修」或 --no-verify
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32473119-d351-4009-b64e-8168d01ed5b8
---

**硬性规则（用户 2026-05-20 拍板，连发感叹号）**：提交/推送一件事，必须**整改到所有闸门全绿**才算完成——`commit-msg`(commitlint)、`lint-staged`(eslint+prettier)、`pre-push`(verify:arch + type-check + 变更测试 + UI audit + i18n + runtime-deps)。任一红 = 没完成，必须修。

**Why**：2026-05-20 推送被 `pre-push` 拦——`playground-frontend-contract.spec.ts` 跑红（`ba4b0572c` 可见性会话给 agent-playground 加了 `PATCH missions/:id/visibility` 端点、同步了前端 api client，却漏更新这个契约 baseline）。我的提交完全没碰 playground，但因为我的 commit 叠在它上面、推 main 会连它一起推，所以被这道闸拦下。我提议「等可见性会话修 / 或 --no-verify」——用户当场否决：「不行，必须整改符合要求后提交！！！后面变成硬性规则」。补齐 baseline 那一行 → 8/8 绿 → 推送成功（`be501dd9c`）。

**How to apply**：

1. 推送前提条件 = 本地把整条 `pre-push` 跑绿，红了就**修**，不把「等别人」「等会话」当最终答复。
2. 闸门红源自**我携带的别人的 commit**（共享 main 上别人未推的提交）→ 也要修到合规：做最小、正当的整改（如补契约 baseline 缺的端点、补迁移、补 export），单独 commit 一个 `fix/test(...)`，再推。
3. **禁止** `--no-verify` 绕闸（除非用户明确要求）；**禁止** rebase 丢掉别人的 commit。
4. 整改必须**正当**，不是糊弄：baseline 要反映真实意图的端点（且前端已同步）、不是把测试改松/注释掉。canonical 真不适配才 allowlist+留痕（见 [[feedback_ui_governance_no_fake_exceptions]]）。
5. commitlint：subject 不能以 PascalCase/英文大写词开头（`AIOrganizePanel ...` 被拒）→ 用中文或小写起头。

相关：[[feedback_commit_only_own_changes]]（只暂存自己的文件）、[[feedback_lint_staged_stash_safety]]（lint-staged stash 安全）、[[feedback_execution_style]]。
