---
name: feedback_workflow_subagent_cwd_worktree
description: Workflow 子 agent 的 cwd 默认解析到主仓而非当前 worktree session，文件改动会泄漏到 main
metadata:
  node_type: memory
  type: feedback
  originSessionId: 26d8b890-fe23-4119-b8e7-bd49da7063a7
---

在 worktree session 里启动 Workflow 时，workflow 的子 agent **不会**自动继承 session 的 worktree 工作目录——它们的相对路径/cwd 解析到**主仓根**（`D:/projects/codes/genesis-agent-teams`），导致 Edit/Write 落到 main 仓，污染 main 分支工作树。

**事故（2026-05-30 P0 整改）**：7 条工作流里 6 条的改动写进了主仓，只有 1 条（用相对路径恰好命中）落在 worktree。VerifyFix gate 抓出"worktree 里只有 1 条改动存在"才发现。

**How to apply**：

1. workflow 子 agent prompt 里必须给**绝对 worktree 路径**（`<wt>/backend/src/...`），并明令"严禁触碰主仓路径 `D:/projects/codes/genesis-agent-teams/backend/...`"。第二次这样做就没再泄漏。
2. 永远加一个 **VerifyFix barrier agent**，在共享 worktree 里实跑 `git status` + tsc + verify:arch，核对声称改的文件是否真存在——子 agent 会如实但乐观地报告"已改/测试通过"，实际可能写错了树。
3. 收拾泄漏：先 `git -C <main> rev-parse HEAD` 确认 main==origin==worktree base，再逐文件 `git diff` 分类（我的 P0 vs 并发 session 的工作，看 memory frontmatter 的 originSessionId / diff 内容判断归属），patch apply 到 worktree + 逐文件 `git checkout --`/`rm` 还原 main。**绝不**全局 `checkout -- .`（会误删并发 session 工作，本仓有多 session）。

worktree commit 配套坑（2026-05-30 同次踩到）：

- pre-commit eslint OOM → 先 `export NODE_OPTIONS=--max-old-space-size=8192`（详见 [[feedback_parallel_agent_integration_2026_05_23]]）。
- commitlint（config-conventional）**body/footer 每行 ≤100 字符**：多行说明用多个 `-m`（每段单行 ≤100），别塞一个长 `-m`。
- worktree 免 npm install：`New-Item -ItemType Junction` 链主仓 `node_modules`+`backend/node_modules`，再 `npx prisma generate --schema=prisma/schema`，tsc 才不报类型错。

**升级教训（2026-05-30 运营看板 epic，一天内反复踩 junction 反噬）**：node_modules junction 是双刃剑，会**反向污染主仓**——

- agent 在 worktree 跑 `prisma generate` / `npm install` → 经 junction 把主仓 `@prisma/client`/`node_modules` 改坏（主仓 type-check 突报一堆无关 model/包"不存在"：agentPlaygroundMissionCostLedger / auditLog / prom-client 等，全是 client 损坏的级联噪音）。
- `git worktree remove --force` 删 worktree → 顺 junction 删掉主仓 node_modules 内容（`lint-staged`/.bin 消失，pre-commit 直接 `not recognized`）。修复：root `npm install --ignore-scripts`（husky postinstall 会失败，必须 --ignore-scripts），再 `prisma generate`。
- kill 正在跑 prisma generate 的 workflow → 主仓 client 半生成损坏。
- 并行 worktree agent + 主仓并发，可能把**主仓 HEAD 重置到 main**（commit 安全在 feature 分支，但工作区被切走、types/schema 消失）。恢复：`git checkout <feature-branch>`，未提交改动会 carry over（同名文件无冲突时）。
  **最稳范式（W5 实测顺畅）**：workflow/sub-agent 子任务**纯代码产出、零环境操作**（prompt 明令禁 mklink/npm/npx/prisma generate/tsc），返回每文件完整内容；主 agent 从 worktree cp 集成 + 在主仓**统一**跑 type-check/verify:arch/测试 + commit。worktree 隔离只为防并发写冲突，绝不让 agent 碰环境。**小改动（加几行 emit）根本别上 worktree workflow**——环境开销（npm/prisma/verify 几十分钟 + 反噬风险）远超收益，主 agent 直改 + 主仓验证最快。配合 [[feedback_autonomous_mode]]：少停少问，攒批验证 commit。
