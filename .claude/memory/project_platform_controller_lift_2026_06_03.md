---
name: project_platform_controller_lift_2026_06_03
description: standards/16 System-HTTP 规则——platform controller 上提 open-api 的分批 roadmap + 第一批落地
metadata:
  node_type: memory
  type: project
  originSessionId: 34cc9f3a-3a11-418a-b534-b390c2a4d2ca
---

**原则（standards/16 §一·补 + §三·补，已正式落档）**：App vs System 复用/重建测试——"每个产品都得自己重建它吗?"否(auth/计费/通知/设置/密钥/存储)→System。System 逻辑留 L1 platform；**System HTTP 进 L4 open-api**；engine/harness/platform **永不开 HTTP**（platform 应=0 controller）。Agent-OS 心智模型：harness=OS 内核、engine=驱动的引擎族、platform=固件。

**✅ 2026-06-03 全部完成：platform/engine/harness 三层 = 0 controller**（main `c02cc49a4`）。最终批次：#238 admin×4→open-api/admin · #241 unsubscribe→public-api · #242 notification→**新建 open-api/system** · #245 storage-governance→open-api/admin · #246 credits→system · #248 **auth+metrics→system**（末批为加速把 #250 metrics 折进 #248 一次 CI/合并）。另一 session 同期加 #251 守护 + #254 把规则"绝对化"（metrics 也搬、无永久例外、allowlist 清空），与本轮收敛一致。**多 PR 撞同一 system.module + allowlist 反复 rebase**：谁后合谁 rebase，allowlist 随每个上提删行、最终清空（offenders 断言兜底硬焊 0）。

**controller 上提 roadmap（platform 10 controller 文件全上提，service 留 platform）**：

- ✅ **第一批合 main PR#238（d8ebe9d6a）**：4 个 `admin/*` → `open-api/admin/<域>/`——secrets(`admin/secrets`)、secret-keys、db-ops(`admin/tables`)、settings(`admin/settings`)。
- ✅ **第三批·公开 合 main PR#241**：`notifications/unsubscribe`（token-only 公开 RateLimit）→ `open-api/public-api/notifications/`；UnsubscribeTokenService 留 platform 经 NotificationDispatcherModule 导出，PublicApiModule import 它。
- ✅ **第二批·起步 PR#242（本 session 末，CI 中/绿即合）**：**新建 `open-api/system`（OpenApiSystemModule）= L4 系统服务面**（区别 admin 管理面 / public-api 对外面），首个进驻 `notification.controller`（`notifications`，jwt 一方）。NotificationGateway(WS)留 platform。
- ⏳ **第二批剩余 auth + credits → open-api/system**：**生产关键（登录/扣费），各自独立 PR，合并前必须用户 Railway 实测**。credits 文件含两个 @Controller（`credits` 用户面 + `admin/credits` → 可拆去 open-api/admin）。
- ⏳ **storage-governance**（`@Controller("storage")` 无 AdminGuard，用 STORAGE_ADMIN_KEY header；~20 个生产删数据端点 DELETE images/all 等）：目的地待定（admin vs system），高风险，**待用户拍板**。
- ⏳ **metrics**（`@Controller("metrics")` Prometheus 抓取，须 bypass envelope，有 dual-track 前科）：可能定性为 ops 基础设施**豁免**不搬，待用户定。
- **ai-app/byok 11 个 user/\* controller = 已评估，决定不搬（保持 ai-app）**。审计原"推论该归 system"被否：byok 的**共享基元 service 已正确落在 `platform/credentials/*`(L1)**，ai-app/byok 只是调用它们的**一方 BYOK 设置页 HTTP 面**（全 `user/*` 路由）；open-api 定位是对外 ABI/协议/管理面，byok user 端点是前端 feature API，不属之。且"每个产品都得自己重建吗"测试已被满足（共享部分在 platform 复用、产品 HTTP 面留各自 app = 健康分层）。非强制（L3 允许 HTTP）、11 个生产关键密钥端点、收益可争议 → 用户拍板维持现状（2026-06-03）。**勿再当遗留项重试搬迁**。
- **std16 http-guard 已硬化（PR#257）**：platform 上提清零后，删除 `no-http-in-lower-layers.spec.ts` 的收缩 ALLOWLIST + 软告警测试，改成硬断言 `controllersIn("platform")===[]`，三层（engine/harness/platform）同等硬焊 0 controller。

**第一批的关键工程决策 + 坑（复用到后续批次）**：

1. **只搬 controller（+controller spec），service/DTO/pipe 留 platform**。standards/16 原写"controller+DTO+guard 一起搬"，但**实测 service 自己 import 这些 DTO**（secrets.service→create/update-secret.dto、db-ops.service→table-info.dto），搬 DTO 会造成 **L1 service→L4 DTO 反向依赖**。故 DTO 留 platform，上提的 controller 改从 `@/modules/platform/...` 引（L4→L1，方向对）。
2. **route + guard 逐字保留**（@Controller 串不动、JwtAuthGuard+AdminGuard 不动）→ 对外 API 零变化。guard 用 `@/common/guards/*` 绝对路径（免 depth 漂移）。
3. **module 重接线**：platform module 从 `controllers[]` 摘掉（providers/exports 不动）；AdminModule 注册这些 controller + import 缺的 service module（DbOpsModule）。SecretsService 经已 import 的 SecretsModule；Settings/Email service 是 @Global。
4. **别漏 barrel**：`platform/db-ops/index.ts` 有 `export * from "./db-ops.controller"` → tsc 报错，要同步删。
5. **验证铁律**：tsc + eslint(NODE_OPTIONS=8192，全项目 eslint 会 OOM 退 134，对显式文件列表跑) + verify:arch(32 套) + 移动后的 controller 测试 + **真·编译 dist `npm run test:boot`**（确认 controller 注册 + service 注入，BOOT_OK）。
6. worktree 共享主仓：在隔离 `gat-wt-hotfix` 做、基于 origin/main 开分支；主仓常被别的 session 占在 W1/W2 分支（`git worktree list` 先看，别切别人分支）。仓库**禁用 auto-merge**，后台 `gh pr checks --watch && gh pr merge` 脚本合。

承接 [[project_ai_layer_mece_audit_2026_06_02]] · [[project_facade_barrel_boot_crash_class_2026_06_03]]。
