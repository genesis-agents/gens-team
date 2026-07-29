---
name: project_byok_agnes_endpoint_and_crash_recovery_2026_06_01
description: Agnes BYOK 端点真因(api.子域)+前一 agent 崩溃后的工具链恢复/CLA 改写作者套路
metadata:
  node_type: memory
  type: project
  originSessionId: 5d5a8932-a233-4533-8956-6e907c4bbe45
---

前一个 agent 崩溃中断后接手 BYOK 收尾（2026-06-01）。三件事，均已合 origin/main：

**1. Agnes 端点真因（PR#195=4ce07edbd）**：连接测试恒报 `404 返回 HTML`。根因=catalog endpoint `https://agnes-ai.com/api/v1` 是**营销站（Next.js）**，不是 API 网关——根域仅公开 `GET /api/v1/models` 返 200 JSON（误导），`POST /api/v1/chat/completions` 是 404 HTML。**真鉴权网关在 `api.` 子域**：`https://api.agnes-ai.com/api/v1`（实测假 key 返 JSON 401 `{"code":"000501","invalid or expired token"}`=路由在+做鉴权）。教训：**别从 routing 元数据推断端点，直接 curl 探测**（前一 agent 靠推断在"删/留 Agnes"反复横跳）。修=改 catalog + 手写 SQL 迁移（`AiProvidersSeeder` 是 **create-only 永不更新存量行**，光改 catalog 不生效，必须迁移 UPDATE 已 seed 的 system 行）。注：剩余 `invalid or expired token` 是用户 key 无效，非代码问题。autofill endpoint 修复另见 PR#192=dbde82fad。

**2. 崩溃后工具链恢复**：node*modules 残缺导致 pre-push 钩子跑不起来。症状链=`.husky/*/husky.sh`缺失 →`node node_modules/husky/lib/bin.js install`；`node_modules/.bin/` 空（jest/tsc/husky shim 全无，`npx husky`/`jest`不识别）→`npm install` + **`npm rebuild`**（重建 399 个 .bin shim）；tsc 报 `Property 'sql' does not exist on typeof Prisma`→`npx prisma generate`（reinstall 后 Prisma client 类型丢失）。

**3. CLA 改写作者**：commit 作者 `Developer <developer@deepdive-engine.com>` 未绑 GitHub → CLA Assistant fail。改写为 GitHub 绑定且已签 CLA 的 `gens.teams <hello.junjie.duan@gmail.com>`：`git config user.*` 设新身份 + `git rebase origin/main --exec "git commit --amend --reset-author --no-edit"`（线性化丢 merge commit）→ force-push → CLA 自动 pass。**收尾后把本地 git 身份还原** `genesis-agents <hello@gens.team>`。commit 用 `-F 消息文件`（bash 工具里别用 PowerShell `@'...'@` here-string，会被 commitlint 判 subject 空）。

承接 [[project_byok_multikey_and_refactor_2026_05_29]] / [[project_byok_tool_key_redesign_2026_05_28]]
