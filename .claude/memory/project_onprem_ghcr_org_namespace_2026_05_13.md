---
name: project-onprem-ghcr-org-namespace-2026-05-13
description: Genesis on-prem ghcr namespace 从 junjie-duan 个人迁到 genesis-release org；客户 docker pull URL 不再暴露个人 GitHub 用户名
metadata:
  node_type: memory
  type: project
  originSessionId: 3097db18-6f89-4ac8-b70c-512ac02fe78a
---

2026-05-13 onprem 首次正式发布 + 立刻迁 namespace。

**事实**：

- `ghcr.io/junjie-duan/genesis-{backend,frontend,ai-service}:v40.2.28` 已下线（手动删 package）
- 当前正式 URL：`ghcr.io/genesis-release/genesis-{backend,frontend,ai-service,installer}:<version>`（4 个 package）
- 推送方式：开发者用 junjie-duan 个人 PAT (`write:packages`) docker login，push 到 org namespace（junjie-duan 是 genesis-release org owner，所以有权限）
- build-bundle.sh 默认 `GHCR_OWNER=genesis-release`；docker-compose.yml fallback URL 也已切
- **第 4 个 installer 镜像（commit `4c7857aa9`）**：~6MB alpine 烤进 7 个客户配置文件 + entrypoint.sh，客户 `docker run --rm -v "$(pwd):/out" ghcr.io/genesis-release/genesis-installer:vX` 就能把配置"倒"到本地 `genesis-config-vX/` 目录，不需要邮件发 tar.gz

**Why**：客户 `docker pull ghcr.io/junjie-duan/...` URL 里直接暴露个人 GitHub 用户名。即使重置密码也藏不掉 owner（URL 写死的）。org namespace 让 owner 显示为 `genesis-release`（产品身份），不是开发者真名。

**How to apply**：

1. **任何 onprem 相关脚本 / 文档 / docker-compose 不能再出现 `ghcr.io/<personal-username>/...`**，必须用 `ghcr.io/genesis-release/`。grep 自检。
2. **新加 image 推到 org**：retag + push 即可，layer 会从 junjie-duan namespace 跨 mount，几秒切完
3. **客户接入方式**：org package 设置 → Manage access → Add user → 输入客户的 GitHub 用户名 → Read 权限。**不发自己的 PAT**，客户用自己账号 + 自己 PAT (`read:packages`) 登录
4. **如果要加新仓 / 新镜像**：先想清楚客户看到的 URL，凡是客户接触的 namespace 走 genesis-release；纯内部测试镜像可以保留在 junjie-duan 或其他位置
5. **客户交付首选 installer 镜像而非 tar**：客户最终只需 3 行（docker login + docker run installer + bash genesis.sh install），同一个 ghcr PAT 覆盖 4 个 package pull；tar.gz 只作离线 / 不能连外网的客户的备用渠道
6. **installer 镜像 build context 是预生成 staging 目录**：`build-bundle.sh` 在 push 业务 3 镜像后，把已生成的 `dist/onprem/genesis-config-vX/` 拷成 `.installer-build-vX/bundle/`，再 `docker build` —— Dockerfile 不依赖 build-arg，可重现性强
7. **Windows git bash docker mount 路径坑**：`$(pwd)` 会被 git bash 转义成 POSIX 路径但 Docker for Windows 不认；smoke test 用 Windows 绝对路径 `D:/...` + `MSYS_NO_PATHCONV=1` 才能挂载成功。客户端 Linux 服务器无此问题
8. **传 `/path` 给 docker run 当 args 也会路径翻译**：例如 `docker run img cat /bundle/VERSION` 在 git bash 下会被改成 `cat C:/Program Files/Git/bundle/VERSION`。修法是双斜杠 `//bundle/VERSION`（Linux 视为单 `/`），脚本里默认这样写
9. **client-side `bash genesis.sh upgrade vX.Y.Z` 一键升级 + `check-update`**：commit `055d71088` 落地；upgrade 接受两种参数（vX.Y.Z 自动 pull installer / .tar.gz 路径离线模式）；check-update 拉 `installer:latest` 读 `/bundle/VERSION` 对比
10. **`:latest` tag**：build-bundle.sh 每次 push 业务 vX.Y.Z 后追加 push `installer:latest`，让客户 check-update 不需要事先知道任何特定版本号
11. **`--skip-build` 模式要求本地有同 VERSION 镜像**：v40.2.29/v40.2.30 等"代码无变化只换打包"的发布要先 `docker tag <old>:vOLD <new>:vNEW` 三次（业务镜像），再跑 build-bundle.sh
12. **CUSTOMER-GUIDE.md 双轨**：每个 op (install/upgrade/backup/restore) 都给「一键命令」+ 「脚本失败时的手动 fallback」；客户脚本崩了不会卡死
13. **客户文档单源 = 公开仓 `genesis-release/docs`**：https://github.com/genesis-release/docs（public 仓 in private org 是允许的）。客户拿到部署邮件就能点进去看完整流程，不用先跑 docker。install/help 输出都显式打这个 URL。bundle 里 CUSTOMER-GUIDE.md 是镜像副本（按 installer 镜像 tag 对应版本，offline 用）。源代码仓 `infra/onprem/CUSTOMER-GUIDE.md` 仍是 dev 编辑入口；发布到 `genesis-release/docs` 走手动 clone+push（如果改动频繁可后续上 GitHub Actions sync）
14. **CUSTOMER-GUIDE.md 在 dev/public/bundle 三处镜像**：编辑时单源在 dev 仓 `infra/onprem/`；build-bundle.sh 自动复制进 staging → bake 进 installer 镜像；公开仓需手动同步。三处不一致会让客户困惑，每次更新要 push 公开仓 + bump installer 版本

**反模式**：

- 给客户发 `junjie-duan` 账号的 PAT —— 不仅暴露真名，PAT 还能看到这个账号下所有 packages（包括内部测试）
- 在 docker-compose.yml 写死 `ghcr.io/junjie-duan/...` 作为 default —— 已被 ESLint 之类的不能拦，靠 grep + review
- 用 `genesis-release` 注册 user 账号（不是 org）—— 个人账号没有 package collaborator 机制，仍要发共享 PAT

相关：[[feedback_dont_lock_users_choice_with_provider]]（onprem 客户配置不要硬绑定开发者凭据）
