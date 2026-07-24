# GenesisPod 开发实践复盘 — CTO 汇报（五视角版）

> **日期**: 2026-07-23（v2：按产品 / 架构 / 工程 / 演进 / AI 协作五个视角重组）
> **性质**: 基于项目全量实践证据的开发心得复盘（非架构审计，架构合规见 2026-06-02/03 系列评审）
> **调查方式**: 三路并行只读调研（治理规范与事故教训 / 架构演进史 / 自动化看护机制）+ 仓库量化统计
> **证据原则**: 每条结论标注来源文件路径；无法追溯的数字如实标注（见 §7）
> **维护者**: Claude Code

---

## 0. 执行摘要（一页版）

GenesisPod 是一个后端约 157 万行、前端约 50 万行 TypeScript 的 AI 深度研究平台，20 个 AI App 模块跑在五层单向依赖架构上，迭代量已超 400 个 PR，绝大部分代码由 AI Agent 编写、人负责决策与验收。本报告把实践心得按五个视角展开，每个视角一句话结论：

| 视角 | 一句话结论 |
| --- | --- |
| **产品经理** | 模糊需求是最大的浪费源头；需求必须转成可验证目标，功能定义必须自带资源边界（成本/时长上限是产品参数，不是工程细节） |
| **架构设计** | 架构的价值不在图，在可执行边界；做减法（删层、删库、拒绝新实体）是最高杠杆的架构决策 |
| **工程实现** | 写在文档里的规范一定失守，只有机器门禁算数；测试最大的敌人是"假绿" |
| **持续演进** | 大重构拆小波次 + 双读过渡 + 每波全绿收口；决策错误公开留档比掩盖便宜 |
| **AI 协作组织** | AI 规模化写代码需要新治理学：物理约束（白名单/隔离）、对抗性复核、经验固化为可执行工具 |

贯穿全部视角的一个反面教材：**2026-06-21 Mission 失控事故**（一个任务空烧 33 小时 / $18.16 / 605 万 token，四层防护同时失守），五个视角各能从中读出自己的教训，详见各节。

**需要 CTO 层面知晓/决策的三项风险**：数据库迁移链已不是 schema 真相源（squash runbook 待批）；playground 与 deep-insight 双克隆持续漂移（去留待拍板）；跨 pod 任务中止依赖进程内 Map（多实例部署前必须解决）。完整台账见 §6。

---

## 1. 项目底盘：我们在治理一个什么规模的系统

| 指标 | 数值 | 来源 |
| --- | --- | --- |
| 后端 TypeScript | 4,617 文件 / 约 157 万行 | 仓库实测（2026-07-23） |
| 前端 TypeScript | 1,555 文件 / 约 50 万行 | 仓库实测 |
| 测试文件 | 2,016 个 | 仓库实测 |
| AI App 模块（L3） | 20 个 | `backend/src/modules/ai-app/` |
| Harness 聚合（L2.5）/ Engine 聚合（L2） | 11 / 12 个 | `layered-architecture.md` |
| 累计 PR | 400+（本地为浅克隆，仅见 74 提交） | PR #401（2026-07-21 合并） |
| canonical 能力索引 | 1,950 条（AST 自动生成，CI 防漂移） | `docs/architecture/capabilities.json` |
| 架构 spec 测试 | 34 个套件（7 类） | `backend/src/__tests__/architecture/` |
| 编号规范 / ADR / skill / agent | 26 / 5 / 44 / 13 | `.claude/standards|adrs|skills|agents/` |

技术栈：Next.js 14 + NestJS 10 + Prisma + PostgreSQL 16 + Redis 7，LLM 经 LiteLLM 多供应商接入。

---

## 2. 产品经理视角：需求与范围的纪律

### 2.1 模糊需求是最大的浪费源头，必须转成可验证目标

项目把"需求转化"写成了强制流程（`.claude/CLAUDE.md`）：任何任务开工前必须转成可独立验证的成功标准——"修这个 bug"→"写复现测试并让它通过"；"性能优化"→"明确指标 + 基线 + 目标值"。弱标准（"让它跑起来"）意味着无尽的澄清轮次，强标准（"`npm run test:integration` 全绿"）让 AI/人都能独立闭环。配套的是**暴露多义性原则**：需求有多种合理解读时列出所有解读（含义/工作量/影响面）请需求方选，禁止执行方替用户选——"加个缓存"不问就选 Redis、"优化性能"不问就同时上索引+缓存+异步，都是被明令禁止的反模式。

**给 CTO 的含义**：在 AI 写代码的模式下，生成成本趋近于零,需求含糊的代价反而被放大（AI 会毫不犹豫地把错误理解实现完）。需求纪律是新的第一瓶颈。

### 2.2 功能定义必须自带资源边界

6-21 事故的产品侧读法：deep 档洞察的产品定义只写了质量目标（Leader 自动定下"≥12000 字 / ≥50 来源 / ≥10 图表"的巨标），资源边界却宽到形同虚设（24 小时 wall-time / $40 预算 / 2000 万 token，且用户 override 还能撑大）。结果一个用户功能烧了 $18.16 还给出次优产物。修复动作里有一条纯产品决策：deep 档上限收紧 24h→6h、并堵住 override 的洞。

**教训**：任何"深度/无限/自动继续"类的 AI 功能，成本上限、时长上限、失败即快停,都是产品参数,必须在 PRD 层面显式定义,而不是留给工程"合理默认"。

### 2.3 克制是产品能力：不为想象中的需求建实体

- **ADR-0005**：面对多租户需求，没有对标 OpenAI/WorkOS 新建 Organization/RBAC 实体，判断依据是"真缺的是执行一致性而非新实体"，复用既有 `User+ContentVisibility+Topic/TopicMember+workspaceId` 收口 IDOR。
- **intent-gateway 整层删除**：架构图上是"智能编排层"，实际 0 消费方的 Placeholder——先建层再等需求，等来的是维护成本。
- **反例（正在偿还）**：playground 与 deep-insight 两条近乎重复的产品线并存,一次 revert 把它们冻成永久分叉的双克隆，还成了 6-21 事故的放大器。**保留两条相似产品线是产品决策，其代价以工程债形式复利计息**（去留仍待拍板，见 §6）。

---

## 3. 架构设计视角：可执行的边界 + 做减法

### 3.1 分层架构必须"可执行"，否则只是一张图

五层单向依赖（L4 open-api → L3 ai-app → L2.5 ai-harness → L2 ai-engine → L1 platform），每条规则都有对应拦截物：

- 单向依赖：`layer-boundaries.spec.ts`（engine 不得 import harness、harness 不得 import ai-app）
- facade 唯一入口：ESLint overrides（error 级）+ `agent-team-facade-contract.spec.ts`，禁穿透聚合内部路径
- 词汇纯净：`vocab-purity.spec.ts`——harness/engine 生产代码不得出现业务词；顶层目录必须是业界标准词，禁自造词（kernel/execution/runtime 类）
- 单一真相源：同名概念全项目唯一（tools 只在 engine、SkillRegistry 只 1 个、定价单源 `ModelPricingRegistry`、模型选择单一漏斗）
- 最精细的一类是**基线契约**：用 TS Compiler API 锁某函数的真实调用方清单、某字段的读者清单,新增消费方必须显式过基线更新流程（`CONTRACT_README.md`）——架构漂移从 review 负担变成编译期事实。

### 3.2 删层史：两个"图上很美"的层被整层移除

| 被删对象 | 图上角色 | 实际情况 | 固化出的规则 |
| --- | --- | --- | --- |
| ai-kernel | L2 内核层（Mission 进程/IPC/调度） | 自造 OS 概念撑不起一层，能力并入 L2.5 harness | 架构 spec 禁自造词目录 |
| intent-gateway | L6 智能编排层 | 0 消费方 Placeholder 空壳 | `harness-uplift-gate.spec.ts`：上提公共层必须 ≥2 个真实消费方 import,空壳推不上去 |

（证据：`docs/_archive/2026-q2/architecture-old-*`、`layered-architecture.md`）

### 3.3 做减法是最高杠杆的架构决策

**三库合一**（ADR-0003→0004）：移除 MongoDB/Neo4j/Qdrant，统一 PostgreSQL 16——JSONB+GIN 替代文档库、递归 CTE 替代图库、向量能力入 PG（`docs/architecture/ai-infra/database-postgresql.md`）。运维面、依赖面、认知负担同步缩减。Karpathy 反过度抽象原则被列为红线："只用一次的代码不要抽 Strategy/Factory，3 处使用再考虑抽象"。1,950 条 canonical 能力索引 + "写代码前先查复用"的强制前置动作,把"不重复造轮子"从口号变成机器检查。

---

## 4. 工程实现视角：机器门禁 + 防"假绿"

### 4.1 honor-only 必然失守（6-21 事故的工程侧读法）

CLAUDE.md 的"反向洞察"第 5 条早就写明"必须有断路器,否则日烧 250K API calls 级事故"——**规范写了，但 honor-only，无自动化拦截**，于是四层防护同时失守：revert 只验编译不验真跑；换模型不做端到端回归；1913 个 mock 测试给假信心；断路器只防"冻死"不防"空转"。同类案例：全栈诊断发现 CI 实际跑 `test:quick` 静默跳过 53 个 spec（含 JWT/guardrails 安全测试），覆盖率门槛形同虚设（`diagnosis-2026-06-14.md` Top#4，已修 `ce9dd6d34`）。

### 4.2 把规范变成门禁：三处执行点互补

| 执行点 | 时机 | 内容 |
| --- | --- | --- |
| ESLint 分层护栏 | 写代码时 / pre-commit | facade 穿透、逆向依赖、TaskProfile 绕过、密钥直返、能力字符串匹配等，error 级 |
| jest 架构 spec | `verify:arch` / pre-push 第 0 步 | 34 套件：依赖方向、词汇纯净、契约基线、投影纯度、0-consumer 拦截等 |
| CI 合并门 | PR 合并 | 9 个 job 全 success 才放行；`always()` + 显式逐 job result 检查，防 skip/cancel 被误判为通过 |

pre-push 是 10 步全量门：god-class 尺寸守护（>2500 行文件净增 >50 行拒推）、UI 纪律 hard-zero、硬编码中文棘轮、运行时依赖审计、能力索引漂移检查等（`.husky/pre-push`）。

### 4.3 "假绿"的四种形态与对策

| 假绿形态 | 真实案例 | 对策 |
| --- | --- | --- |
| mock 给假信心 | 1913 个测试全 mock LLM,真模型 finalize 根本不吐合法 JSON | boot-smoke（CI 真实 `NestFactory.create` 实例化全 DI 图，抓 mock 抓不到的循环依赖）；真模型集成测试列入 P2 |
| CI 静默跳测 | `test:quick` 跳过 53 个 spec | 全量 `test:ci --coverage`，per-module 覆盖率棘轮真实强制 |
| 守护自身失效 | 断言写了但从不 fire | protection-net 反向证据测试：故意投喂 broken payload 断言守护真的拦截；audit 脚本在反模式样本上 EXITCODE 必须 ≠0 |
| 存量违规淹没新增 | UI 违规、硬编码中文存量大 | 棘轮基线：存量冻结进 baseline JSON,只减不增,超基线 exit 1 |

---

## 5. 持续演进视角：小波次、双读、把教训变成资产

### 5.1 大重构的正确姿势：波次 + 风险梯度 + 每波全绿

MECE 整改不是大爆炸重构：engine/safety 拆成 W0–W7 八波、跨层能力迁移 W1–W3 九域，按风险梯度（low→high）排序，每波以 `verify:arch` 全绿收口（engine-safety 计划 §9.3 有执行回执：4 波已执行、32 套件 362 测试全通过）。近期 L3 治理（PR #399/#401）沿用同一模式，配置迁移用 **dual-read（新旧双读）** 实现不停机切换。

### 5.2 决策错误公开留档，比掩盖便宜

ADR-0003（双库策略）被明确标记为废弃并由 0004（单库 PG）取代——**反向决策连同原始理由一起留档**，后来者能看到"为什么当初这么想、后来为什么改"。同理,全栈诊断报告显式维护"已证伪/勿追误报"清单，防止后续排查重复踩已排除的假线索。

### 5.3 经验固化三段链：事故 → 规范（挂看护）→ 工具

```
事故/诊断发现 ──→ 编号规范（26 份，多数绑定机器看护 spec）──→ skill/agent 固化（44 skill + 13 agent）
   例: 迁移红线 honor-only → no-alter-type-in-exception.spec（18 个历史违规冻结 allowlist,新增零容忍）
   例: "先查复用"经验 → capability-map skill + capabilities:check CI 门
   例: 审计能力本身 → arch-auditor / arch-guardian / security-auditor 常驻 agent
```

两个值得注意的机制设计：

- **honor-only 被当作显式债务管理**：CLAUDE.md 为暂未自动化的 10 条规范逐条标注 `honor` 状态,升级为 spec/lint 有明确排期（事故复盘 P2-2）——"还没自动化"不可耻,不承认才可耻。
- **向头部同行的事故学习**：对照还原的 Claude Code v2.1.88 源码提炼 10 条 agent-runtime"反向洞察"（断路器、prompt cache 保护、fallback 配对占位等），作为 harness/runner 类改动的强约束（`docs/architecture/claude-code-borrow/agent-execution-guide.md`）——**读别人源码注释里的血泪,比自己再烧一遍便宜**。

---

## 6. AI 协作组织视角：当 AI 写 90% 的代码

这是本项目最具外部参考价值的部分——多数团队还没到这个阶段,这里的坑都是先趟过的。

### 6.1 物理约束优先于流程约束

2026-02-10 事故（sub-agent 越权创建模块、主 agent 用 `git checkout -- .` 回退时误删其他会话的工作）之后形成铁律：sub-agent prompt 必须含**文件白名单**与必要上下文（Prisma model、DTO 定义,禁凭猜测写表名）；并行会话/子 agent 必须 **worktree 隔离**；**永久禁止**全局回退命令（`git checkout -- .` / `git reset --hard` / `git clean -fd`）；sub-agent 禁创建新模块、禁触碰全局入口文件。对 AI 执行者,写进 prompt 的"物理约束"远比写进 wiki 的"流程规范"有效。

### 6.2 AI 产出必须被 AI 攻击一遍：对抗性复核

- 2026-06-14 全栈诊断动用 26 个子 agent、8 维度独立审计,并对全部 high/critical 发现做对抗性复核——**证伪了 1 条 critical**（"150 controller 零测试"实为方法论错误）、多条 high 降级（`diagnosis-2026-06-14.md`）。
- MECE 迁移蓝图由 28 agent / 2.07M token 的 workflow 产出,9 个能力域先全部被判 needs-fix、修正后才定稿。
- 结论：**单路 AI 产出的置信度不够用于架构决策，"生成 + 对抗验证"的双层结构是必需品**,且成本完全可接受。

### 6.3 治理本身也是代码

AI 协作治理的三个投入点都以代码形态存在：执行环境的物理约束（prompt 白名单/worktree/禁令）、产出的对抗验证（审计 agent + 复核 workflow）、经验的可执行化（skill/spec/棘轮）。传统"培训 + review 文化"在 AI 执行者身上不起作用,**能被 grep 到、能让 CI 变红的规则才存在**。

---

## 7. 风险台账（需 CTO 知晓或拍板）

| # | 风险 | 现状 | 建议 |
| --- | --- | --- | --- |
| 1 | **迁移链不是 schema 真相源**：338 个迁移，部署靠 `db push --accept-data-loss` + 失败迁移静默标 applied 兜底,空库与存量库路径发散 | squash runbook 已写好，**待审批未执行**（`.claude/diagnosis/migration-squash-runbook.md`） | 数据层最深的系统性债务，建议尽快批准执行窗口 |
| 2 | **playground / deep-insight 双克隆漂移**：2026-06-10 revert 冻成永久分叉,且抹掉 fast-fail 修复（事故放大器） | 事故复盘 P1-2，标注"唯一不可逆决策，待拍板" | 二选一：forward-port 修复或退役 playground 自有 pipeline |
| 3 | **MissionAbortRegistry 为进程内 Map**：多 pod 部署时 cancel 落错 pod 静默失效 | 已登记设计风险（P0-5），单 pod 暂缓 | 横向扩容前必须先做（Redis pub/sub 或亲和路由） |
| 4 | **"70-75% 成本优化"缺测算依据**：该数字仅在 `layered-architecture.md` 作为结论出现,无配套量化文档 | 技术可行性有据（PostgreSQL-First 三条替代路径），成本数字不可追溯 | 对外引用前补一页测算，或降级表述为"显著降低" |
| 5 | **10 条反向洞察多为 honor-only** | CLAUDE.md 已逐条标注看护方式 | 按事故复盘 P2-2，把高频项（断路器、运行时验证）升级为 spec/lint |
| 6 | **真模型集成测试缺位**：至少一条 deep mission 用真模型跑通并断言成本上限 | 事故复盘 P2-1，未落地 | 纳入 CI 定期任务（非每 PR），成本可控 |

**诚实性说明**：本仓库为浅克隆（本地仅 74 个提交，2026-06-15 起），早期演进依据 `docs/` 归档文档与文中引用的 commit hash 重建；"PR-X 系列"清理在本地无留档，未采信。规范体系存在小瑕疵（标准编号 10 撞号、01/25/26 缺号），不影响结论,如实记录。

---

## 8. 可复制的方法论清单（带走页，按视角归类）

**产品**：
1. 需求进场必须转成可验证目标（测试命令/指标+基线+目标值）；答不出验收标准的需求退回澄清。
2. AI 功能的成本/时长上限是 PRD 参数,不是工程默认值；"自动继续"类功能必须定义快停条件。

**架构**：
3. 每条架构规则必须回答"谁在机器上拦截它"；ESLint（写时）+ jest spec（推前）+ CI 合并门（合并时）三层执行点缺一不可。
4. 上提公共层设消费方门槛（≥2 个真实 import），用测试拦住空壳抽象；顶层目录只用业界标准词。
5. 敢做减法：合并数据库、删除 0 消费方的层,并把反向决策连理由一起留档。

**工程**：
6. 合并门用 `always()` + 显式逐 job result 检查,防 skip/cancel 被误判为通过。
7. 用反向证据测试验证守护本身会 fire；审计脚本要能在反模式样本上自证非假绿。
8. 断路器同时覆盖"冻死"（无心跳）与"空转"（高频事件但无进展 + 成本速率），单任务设成本上限。

**演进**：
9. 大重构拆小波次、按风险梯度排序、每波以架构 spec 全绿收口；配置迁移用 dual-read 过渡。
10. 存量违规用棘轮基线冻结（只减不增），让新增零容忍与历史债务解耦；honor-only 规范进显式债务清单并排期升级。

**AI 协作**：
11. Sub-agent 一律文件白名单 + worktree 隔离；全局回退命令永久禁用。
12. AI 产出的架构结论必须过对抗性复核；显式维护"已证伪/勿追误报"清单。

---

## 附：本报告引用的关键证据文件

- 事故复盘：`docs/operations/incident-2026-06-21-mission-runaway-postmortem.md`
- 全栈诊断：`.claude/diagnosis/diagnosis-2026-06-14.md`（+ `migration-squash-runbook.md`）
- 分层架构：`docs/architecture/layered-architecture.md`；MECE 系列：`docs/architecture/platform-review/2026-06-02/03-*`
- 数据库决策：`.claude/adrs/0003/0004/0005` + `docs/architecture/ai-infra/database-postgresql.md`
- 看护机制：`backend/src/__tests__/architecture/`（34 spec）、`backend/.eslintrc.js`、`.husky/pre-push`、`.github/workflows/ci.yml`、`scripts/utils/audit-*.ts`、`docs/architecture/capabilities.json`
- 反向洞察：`docs/architecture/claude-code-borrow/agent-execution-guide.md`
- 治理红线与固化体系：`.claude/CLAUDE.md`、`.claude/standards/`（26 份）、`.claude/skills/`（44）、`.claude/agents/`（13）
