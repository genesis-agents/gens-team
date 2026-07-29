---
name: project_mece_w1_execution_2026_06_03
description: 能力 MECE 整改 W1 波次执行落地 + adversarially-verified 三波蓝图（承接 ai-layer-mece-audit）
metadata:
  node_type: memory
  type: project
  originSessionId: 5bc373e3-e2e9-499d-9c89-b0b5f95b3469
---

承接 [[project_ai_layer_mece_audit_2026_06_02]]。用户要求"自驱全部完成 + workflow 执行"六层（ai-app/harness/engine/platform/plugins/open-api）能力 MECE 整改。

**方法**：先出两份文档（`docs/architecture/platform-review/2026-06-03-capability-mece-sandbox.md` 分层原则+决策树；`...-migration-blueprint.md` 三波蓝图）。跑 28-agent workflow（深核现状→目标设计→对抗校验 MECE→排期）。**对抗校验是关键价值**：9 域全 needs-fix，4 处读源码实证硬错纠正了初版设计——若盲改会回归生产。

**W1 已合 main（PR #230 = merge `f1d10ec89`）**，4 个改码 PR 均 type-check 0 / verify:arch 364/364 / scoped specs 绿：

- W1-2 token-bucket→`platform/resilience`+L1 `ITokenBucketStore` 端口（修 `reliability/index.ts:11`+`rate-limit/index.ts` 两 barrel 断裂）
- W1-4 `ai-app/planning`→`ai-app/ai-planning`（消目录 token 同名；类名/HTTP前缀/teamId 不变）
- W1-B.1 span-exporter 端口→`plugins/core/abstractions/observability`（镜像 storage 端口；`SpanData`→`TelemetrySpanData`）
- W1-B.2 `common/observability`→`platform/monitoring`（合 ObservabilityModule 进 @Global MonitoringModule）；**user-event.{types,listener} 留 common**——含业务词表 TOPIC_INSIGHTS，arch spec "platform 不得提业务名" 实际拦截了，据此修正归属

**蓝图被对抗校验纠正的关键点（执行前必读）**：

- **D evaluation 非"删死副本"**：实读 import 证实 TI `services/quality/*` 与 harness `evaluation/critique/*` 是**两份 diverged 同名实现且均 live**（TI 自用本地、harness 被 agent-playground+内部用）→ 重定为 reconcile-or-rename（W2/W3），不可删
- 端口随被实现方下沉（凭证端口落 L1、span-exporter 落 L0），对齐 AI_CHAT_TOKEN/storage 范式
- 凭证 A：73 文件非 72（漏 ai-harness 5 消费者：facade re-export 1375-1379+model-resolver+chat.facade+2 guardrails）
- H ingestion 5 处反向依赖、移动+反转须同 PR 原子；F teams MissionContext/Input 实为无状态应落 engine、TaskDecomposition 已撞名 writing

**第二批已合 main（PR #233 = merge `9a2134b41`，分支 refactor/w2-routing-dedup）**：

- **W3-A 凭证已落**：`git mv ai-engine/credentials → platform/credentials`（整聚合）+ 72 importer 重写（sed `ai-engine/credentials`→`platform/credentials`，因两者同 modules/ 父目录 sibling，相对/绝对路径都靠 substring 替换生效）；ai-engine/facade 770-819 credential 段 sed `../credentials/`→`@/modules/platform/credentials/` 作 @deprecated 转发（间接消费方零改）；**platform/credentials 零上行 import→verify:arch 364 绿**；279 specs 绿。secrets/encryption/key-health 仍未并（记债）。
- **W2-E**：health/priority/diversity 公式抽 `routing/scoring-formulas.ts` 共享（election golden 字节不变；cost 因 election 用 tierToCost 回退 vs routing 用 standard 已 diverge，**不共享**；泛型 rankBySignals 全量 swap 仍 defer）。
- **W1-I**：`.eslintrc` 加 `platform/**` plugins-storage 守护（ai-engine/harness 已有 685-726 规则，勿重复）；storage README ai-infra→platform。
- **W1-D 定案：维持双份**（无代码）。harness 源码头注释已记"TI 商用基线保留本地副本"；TI services/quality/_ 与 harness evaluation/critique/_ 是两份 diverged 同名且**均 live**（实读 import 证实 TI 全走本地 `../quality/`、harness 经 facade 供 agent-playground），diff 仅 13 行近等价，**不可删任一**。

**合并踩坑（多 session 漂移）**：他 session 同期把 llm/services 重构成 llm/chat + llm/byok 并合 main（PR#228/#232）。merge origin/main 时 6 文件冲突全是 credentials 路径（ours=platform / theirs=ai-engine 死路径）→`git checkout --theirs`+sed 归一 platform 解决。**capability 基线 line-drift**：credentials import 改动使 2 文件 +3 行，25 个既有 capability hit 的 line:col 漂移→`npm run audit:capability:update`(--write) re-anchor，**185→185 确认零新增**（坑见 [[project_lintstaged_windows_arglimit]]：130 文件提交超 Windows cmd 长度，已永久修 .lintstagedrc 分块 50/批）。

**W3-A 全部完成（PR #234=`d212d259d`）**：platform/{secrets,encryption,key-health} 也并入 platform/credentials/{secrets,encryption,key-health}（~93 importer 重写，纯 L1→L1，verify:arch 364，515 specs 绿）。**凭证 6 处收敛目标达成**，BYOK 全栈单一聚合 platform/credentials。坑：移动子树相对 import 逃逸到 common/平台兄弟，`(\.\./)+` 多深度都要转绝对 @/（单 `../X` sed 漏 `../../X`，jest 比 tsc 更早抓到 spec 里的 `../../monitoring`）。

**W2-F 已迁（PR #236=`e9330b769`，用户要求严格 MECE 推翻"不迁"）**：3 服务全依赖 harness（StateManager→AgentFacade、Input→ConstraintEnforcement/TokenBudgetService、Context→MissionContextPackage 类型）→ 是 mission 协作基础设施 L2.5，迁 `harness/teams/collaboration/context`。**避坑关键**：被迁服务一律 import **source 文件**（agent.facade source、guardrails/constraints source、engine planning source、teams/abstractions、runner/executor types）**非 facade barrel**，故 facade re-export 它们不构成值循环（[[project_facade_barrel_boot_crash_class]]）。新 `@Global MissionContextModule`(import AiEnginePlanningModule 拿 ContextBudgetCalculator) 加进 HarnessModule imports；从 ai-teams.module providers/exports 删 3 服务；app 消费方+~20 spec import 改 facade。**boot-smoke-test PASSED**（全 DI 图解析无循环，必跑：`npm run build` 后 `DATABASE_URL=.. JWT_SECRET=.. STORAGE_ADMIN_KEY=.. npm run test:boot`，Redis ECONNREFUSED 是预期因 create 非 init）。type-check 0/arch 364/teams 3129 绿。spec DI 坑：服务改 source import 后，spec 的 `jest.mock("facade")` + facade-token provider 失效（token 不匹配 source class）→ 改成 source-token useValue mock。

(原"不迁"决定已被用户推翻；保留记录：曾因 marginal 收益 vs boot-crash 风险判不迁，但正确做法=source import 规避循环+boot-smoke 兜底，风险可控。)
~~**W2-F teams 决定：不迁（keep in app）**~~。实读三服务：MissionStateManager 注入 AgentFacade、MissionInputService 注入 ConstraintEnforcement/TokenBudgetService、MissionContextService 用 MissionContextPackage 类型——**全部依赖 harness**（经 facade）。故 MECE 裁决"Context/Input 落 engine"**错**（engine→harness 上行违规）；三者只能 harness 或留 app。但迁入 harness 触两个陷阱：①MissionStateManager 注入 AgentFacade（facade 类），迁入后 facade 再 re-export 它=**facade→context→facade value-import 环=启动崩溃类**（见 [[project_facade_barrel_boot_crash_class]] #220 生产崩）；②TokenBudgetService 是 facade 对 engine ContextBudgetCalculator 的**别名**，解耦会引入 engine 耦合。三服务现状 = L3 app 经 facade 消费 L2.5（合法干净模式）。**marginal 收益 vs boot-crash 风险 → 判定不迁**（同 W1-D keep）。若要强推须 import 改 source（非 facade）+ 跑 boot-smoke-test 兜底。

**W3-H 已迁（PR #237=`275ef5393`，用户要求严格 MECE）**：蓝图原定 ingestion→L1 platform，但实测 ingestion↔explore **双向耦合**（ingestion→explore 5 文件 + explore→ingestion 2 文件 IngestionConfig/SourceWhitelist）=同一内容发现域两半 → ingestion 是 explore 业务域(决策树 Q2=app)**非 L1 基元**；迁 L1 需 7 处端口反转纯为掩盖域耦合反 MECE。**正解=co-locate `ai-app/explore/ingestion`**（app→app 域内，无 L1 违规无端口体操）。关键技法：`management/ingestion` 与 `explore/ingestion` **同深度**(ai-app/<top>/ingestion)，git mv 后全部相对路径 `../../../explore/resources` 仍有效，只需 sed `management/ingestion`→`explore/ingestion`（修 explore→ingestion 2 引用 + app.module 4 import）。type-check 0/arch 364/1456 specs 绿。management/ 仅剩 workspace（未动）。

**MECE 整改全部收口（本会话 7 PR 合 main）**：#230 W1(token-bucket/planning/observability) · #233 W3-A凭证+W2-E+W1-I+lint-staged修复 · #234 凭证收口 · #236 W2-F mission服务→harness · #237 W3-H ingestion→explore。W1-D 定案维持双份。**方法论沉淀**：蓝图/MECE 裁决是起点非终点——实读依赖耦合常推翻蓝图（D harness 非死副本/F 须 source import 避循环/H 是 explore 域非 L1）；"严格 MECE"=对真实依赖跑决策树，不是机械执行蓝图。

**环境坑**：① type-check 红多半是 Prisma client 过期→`npx prisma generate`（W1 期间全红其实是这个，gen 后 0 error）。② 提交大文件 husky type-aware ESLint OOM→`NODE_OPTIONS=--max-old-space-size=8192 git commit`。③ 工作树有他 session 的 `frontend/.../Sidebar.tsx` 未跟踪改动，勿提交/勿 stash。④ Bash cwd 持久（cd backend 后用 src/… 相对路径，git 操作 cd 回根）。
