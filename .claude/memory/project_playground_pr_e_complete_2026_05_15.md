---
name: project_playground_pr_e_complete_2026_05_15
description: 2026-05-15 PR-E 落地 — playground prompt 单源化 SKILL.md + 砍 steward/verifier 死代码，2 commit / 净删 2520 行
metadata:
  node_type: memory
  type: project
  originSessionId: b2a1b3e2-dcf6-4709-b034-22dd0f9570ab
---

2026-05-15 完成 PR-E（playground 整改 5 件套最后一件）。

**Why**：

- playground 历史预留 schema（steward 4 scope / verifier 4 mode）只有 1 个真接入 orchestrator，其余 6 个死代码但 SKILL.md description 仍然承诺 → 假面 contract
- duty-loader 内部走双轨（SKILL.md + soul.md/duties 散落文件）+ byte-equal spec 守门 → 双源必漂移已踩坑（4 路评审 round 2 在 2026-05-09）
- 用户验证 "这些方法确实都没有使用么？？？" 后让我 grep 全仓证据再删

**Commit chain**：

1. `af452be48` Step 1：砍 steward/verifier 死代码 schema/方法/spec（12 文件 -1022 / +106）
2. `367b0c128` Step 2+3：duty-loader 单源化 + 物理删除 8 soul.md + 10 duties/\*.md + byte-equal spec（28 文件 -1756 / +152）

**净删 2520 行死代码**。playground agent-playground 全测 71 suites / 1545 tests 全绿。

**How to apply**：

- 砍废 scope/mode/方法时必须 grep 三层证据：
  1. 生产 caller（service method / agent scope mapping）
  2. SKILL.md duty body anchor 是否存在（无 anchor → caller 即使有也跑空）
  3. engine / 其他模块同名异义（false positive，命中命名相似但 namespace 不同）
- 删除时 SKILL.md description / soul body 同步删除"承诺"段，避免对外 contract 与 schema 不一致
- prompt 数据源现已单源 SKILL.md，配合 [[feedback_skill_md_byte_equal_contract]]（已更新为"单源"版本）
- "PR 整改不做 NOOP" 配合 [[feedback_verify_main_before_pr_work]] — PR-E 前先 git diff HEAD 看 baseline，避免重写 main 已落代码

**特殊提醒**：
本次 commit 用 pathspec 严格列文件（multi-session 安全），lint-staged stash 风险已规避。`prettier --write` 已分两次跑（10 文件 → 8 文件）。
