---
name: project-onprem-deployment-2026-05-12
description: 客户离线部署（on-prem）作为第三个 deployment target，落在 infra/onprem/，与 infra/railway/ + infra/edgeone/ 并列
metadata:
  node_type: memory
  type: project
  originSessionId: 9c6101c0-e9ad-4a74-b4b2-36f58f20fc15
---

2026-05-12 起 Genesis 支持客户离线部署（源码不公开）形态：

**位置约定**：`infra/onprem/`（不是根目录），与 `infra/railway/` `infra/edgeone/` 并列形成三种 deployment target

**已落地文件**：

- `infra/onprem/docker-compose.yml` — 5+1 服务（postgres/redis/flaresolverr 不外露 ports + backend/frontend/ai-service，frontend:3000 唯一对外端口）
- `infra/onprem/.env.production.example` — 客户填写模板（强制 ENV 校验 `${X:?msg}` 写法）
- `infra/onprem/README.md` — 开发侧打包 + 客户部署 quick start
- `backend/.dockerignore` + `ai-service/.dockerignore` — 新建，原本没有
- 根 `.dockerignore` — 兜底防御（实际 build context 在子目录，几乎用不到）

**Why**: 客户能 SSH 进交付的本地服务器物理接触代码；技术防护只是辅助（Docker 镜像 + minified bundle），主防护靠法律协议 SLA/NDA

**How to apply**:

- 新增 deployment target 一律 `infra/<target>/`，不堆根目录
- on-prem 修改不要动 `backend/Dockerfile` `frontend/Dockerfile`（Railway 共用），只动 `infra/onprem/docker-compose.yml`
- LLM key 走 BYOK，永远不能进 `.env.production`（参考 [[feedback_strict_byok_model_and_key]]）
- 现有根 `docker-compose.yml` 是开发用，保持不动

**脚本三件套（2026-05-12 后续落地，commit 待 push）**：

- `infra/onprem/scripts/build-bundle.sh`（开发侧）— build 3 镜像 + docker save + tar.gz；版本号优先级链：CLI arg → git tag (HEAD exact) → package.json version + git short SHA → 纯 git SHA
- `infra/onprem/scripts/install.sh`（客户侧首次）— docker load + 自动 openssl 生成 6 个 random key + 交互问 admin/domain + up -d + 轮询 healthy；支持 SKIP_PROMPTS=1 全自动
- `infra/onprem/scripts/upgrade.sh`（客户侧升级）— 版本对比（同版本警告、降级要求输入版本号二次确认）+ 备份 .env.production + docker load + 替换 compose/install/upgrade 但保留 .env + force-recreate + 等 healthy；支持 FORCE=1

**关键设计**：

- ai-service Python 走 NDA 不编译（用户决定，IP 评估见 [[project_onprem_deployment_2026_05_12]] 内 4748 LOC 拆解：无独家算法，IP 主要在 prompt 模板 250 行 + report.py inline prompt）
- bundle tar.gz 含 VERSION 文件，upgrade.sh 据此做版本对比
- 三脚本都兼容 docker compose v2 / docker-compose v1，颜色仅在 TTY 启用，无 sudo

**Smoke test 通过（2026-05-12 e2e 验证，4 次迭代修 install.sh）**：

- bundle 实际 tar.gz 大小 824MB（docker save layer dedup + gzip 后），不是预估的 3.4GB（那是镜像 logical size 总和）
- 完整链路全绿：build-bundle → 解包 → docker load → openssl 填密钥 → compose up → prisma migrate 全量 → NestJS 启动 → /health 200 → frontend HTTP 200 → backend via Next.js rewrites HTTP 200
- 暴露并修了 3 个 install.sh bug：
  1. `sed s|^X=.*|X=v|` 找不到行时静默跳过 → 改用 `ensure_kv` helper（grep 存在则 awk 替换，不存在则 echo append）
  2. SKIP_PROMPTS=1 没给 ADMIN_INITIAL_PASSWORD 等必填默认值，触发 compose `${X:?}` 强校验拒启动 → 自动随机生成 + 用 userEmail 作为 admin
  3. wait 10 分钟不够 Win Docker（WSL2 跨 fs IO 慢，prisma migrate 100+ 个首次跑 ~12s/migration） → 改 1800s + healthy 后再 `up -d` 一次拉起 frontend（因为 frontend depends_on backend healthy，wait 失败时 compose 已退出未启 frontend）
- Win Docker Desktop 实测 ~7-8 分钟从 install 到完整 healthy；Linux server 应该 5-10x 快

**发布渠道升级到 ghcr.io 私有镜像（2026-05-12 commit a89bc3077）**：

- 镜像 push 到 `ghcr.io/junjie-duan/genesis-{backend,frontend,ai-service}:<version>`，私有可见性（个人 packages 默认继承 repo visibility）
- bundle 从 ~824MB tar（含 images.tar）缩到 ~12KB（仅 config + scripts + IMAGES 元数据）
- 客户流程：`docker login ghcr.io` (PAT, read:packages) + `bash install.sh`，脚本自动 `docker pull`
- build-bundle.sh `--skip-build` 模式下自动 tag 本地 `genesis/*:VERSION` → `ghcr.io/<owner>/genesis-*:VERSION` 再 push
- GHCR_OWNER 自动从 `git remote get-url origin` 解析并转小写（JUNJIE-DUAN → junjie-duan）
- Verified e2e：smoketest 三镜像 push 成功，GitHub Packages 页面三个 container 全 Private
- npm scripts: `onprem:bundle` / `onprem:release`（后者串 standard-version bump + push to ghcr）

**Docker Hub vs ghcr.io 区别（用户踩过坑）**：裸 `docker login` 走 Docker Hub (`docker.io`)，浏览器跳到 `login.docker.com/activate`；必须显式 `docker login ghcr.io` 才走 GitHub Container Registry。PAT 也是从 GitHub Settings → Tokens (classic) 拿，不是 fine-grained（fine-grained 不支持个人级 packages scope）。

**实测发现的必填 env（2026-05-12 e2e 验证）**：除常见 DATABASE_URL / JWT_SECRET 外，backend bootstrap 时还会硬 throw 以下变量：

- `SETTINGS_ENCRYPTION_KEY`（NODE_ENV=production 强校验，BYOK key 入库加密）— `EncryptionService` constructor
- `STORAGE_ADMIN_KEY`（无 prod/dev 区别全局强校验）— `StorageGovernanceController` constructor
- `ADMIN_EMAILS` `FRONTEND_URL`（仅 warn，可省）— `main.ts:validateEnvConfig`
  排查方法：`grep -E "environment variable.*required|required.*environment" backend/src` 找所有 constructor-level throw 点。Railway 部署没踩这坑是因为这些 var 早已在 Railway 配置好。
