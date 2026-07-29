---
name: 写完代码立即跑 prettier
description: 每次 Write/Edit .ts/.tsx 文件后立即运行项目 prettier，避免 lint-staged 在 commit 时改格式造成 INDEX/HEAD/工作区三态分裂
type: feedback
originSessionId: 6b5e5edc-9fec-4da6-a18a-afe7f61e93b4
---

# 写完代码立即跑 prettier

每次 Write/Edit `.ts/.tsx/.json/.md` 文件后，**在同一轮工作里立即运行**：

```bash
cd frontend && npx prettier --write <我刚改的文件相对路径>
# 或后端
cd backend && npx prettier --write <我刚改的文件相对路径>
```

或一条更通用的（自动找 .prettierrc）：

```bash
cd D:/projects/codes/genesis-agent-teams && npx prettier --write <repo相对路径>
```

跑完再继续下一步（git add / commit / 让用户看）。

**Why**：

2026-05-10 用户截图反馈"为什么大量文件没有提交，或者文件内容本身没有差异，有大量的格式差异"。事故链：

1. 我手写代码不严格符合项目 prettier 配置（`printWidth:80 + tailwindcss plugin`）
2. `git add` + `git commit -- pathspec` 触发 lint-staged
3. lint-staged stash → prettier 改格式 → `git add` 改后版 → stash-pop **覆盖回我手写版**
4. `git commit -- pathspec` 语义是"从工作区取"，于是 HEAD 拿到 stash-pop 后的我手写版
5. INDEX 被孤儿化在 prettier 版（lint-staged staged 的，但 commit 没用）
6. `git status` 显示 `MM`（INDEX≠HEAD + 工作区≠INDEX），看起来有"格式差异"

`git commit -- pathspec` 在多 session 下是必须的（避免吸入别 session 工作），但和 lint-staged 的 stash-pop 工作流根本互冲，无法只靠 git 配置消除。

**根治**：让 prettier 在 commit **之前**就找不到东西可改 → 我写完就跑 prettier → lint-staged 检测无变化 → 不 stash 不 staged → 三态永远一致。

**How to apply**：

- 只要本轮 Write/Edit 改了 `.ts/.tsx/.json/.md`，git add 之前必跑 prettier
- 多文件一次跑：`npx prettier --write <file1> <file2> ...`
- 跑完看一眼 stdout：标 `(unchanged)` 说明已经合规，标具体修改秒数说明 prettier 改过了 —— 都没关系，反正现在工作区已经是最终版
- 别忘了：从 frontend/backend 子目录跑或从 repo root 跑都行（prettier 自动找 frontend/.prettierrc）
- 极端简化：`npx -w frontend prettier --write <files>` 一键搞定 workspace 路径

**例外**：临时 fix 或纯文本（没 .ts/.tsx 改动）可以跳。但只要碰了 .tsx 就跑。

**和现有 memory 的关系**：

- `feedback_lint_staged_stash_safety.md`：commit-msg retry 让 stash 错位 —— 这条加上"pathspec + lint-staged 互冲"的具体新成因
- `feedback_multi_session_must_use_pathspec_commit.md`：必须 pathspec —— 不变
- 本条是这两条的"零成本根治补丁"
