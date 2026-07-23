# GenesisPod 开发实践复盘 — CTO 汇报

> **日期**: 2026-07-23
> **性质**: 基于项目全量实践证据的开发心得复盘（非架构审计，架构合规见 2026-06-02/03 系列评审）
> **调查方式**: 三路并行只读调研（治理规范与事故教训 / 架构演进史 / 自动化看护机制）+ 仓库量化统计
> **证据原则**: 每条结论标注来源文件路径；无法追溯的数字如实标注（见 §6.4）
> **维护者**: Claude Code

---

## 0. 执行摘要（一页版）

GenesisPod 是一个后端约 157 万行、前端约 50 万行 TypeScript 的 AI 深度研究平台，20 个 AI App 模块跑在五层单向依赖架构（L4→L3→L2.5→L2→L1）上，迭代量已超 400 个 PR。项目以「人做决策 + AI Agent 执行」为主要开发模式，因此它的实践教训对「AI 辅助规模化开发」有直接参考价值。

**五条核心心得**：

1. **写在文档里的规范一定会失守，只有机器门禁算数**。断路器规范早已写入 CLAUDE.md，但 honor-only；2026-06-21 一个任务失控空烧 33 小时 / $18.16 / 605 万 token，四层防护同时失守。此后项目把看护体系升级为 34 个架构 spec 测试 + ESLint 分层护栏 + 10 步 pre-push + 9 个 CI job 合并门。
2. **分层架构的价值不在图，在可执行边界**。五层结构靠「ESLint（写时）→ jest 架构 spec（推前）→ CI 合并门」三层拦截焊死；历史上两个「架构图上很美」的层（ai-kernel、intent-gateway）因无真实消费方被整层删除。
3. **做减法是最高杠杆的架构决策**。三库合一（移除 MongoDB/Neo4j/Qdrant，PostgreSQL 16 单库）、拒绝 Organization/RBAC 过度设计（ADR-0005）、「framework/helper 必须 ≥2 个真实消费方才允许上提」的机器规则。
4. **AI Agent 规模化开发需要一套新的治理学**：文件白名单 + worktree 隔离 + 禁全局回退（源于真实数据丢失事故）、对抗性复核（全栈诊断中证伪了 1 条 critical 误报）、以及「事故 → 规范（挂机器看护）→ skill/agent 固化」的三段经验固化链（现有 26 份规范、44 个 skill、13 个 agent）。
5. **测试最大的敌人是「假绿」**。1900+ 测试几乎全 mock LLM 曾给出致命假信心；CI 曾静默跳过 53 个 spec；对策是 boot-smoke（真实实例化 DI 依赖图）、protection-net 反向证据测试（故意投喂坏数据确认守护会 fire）、审计脚本自检（在反模式样本上必须报错）与棘轮基线（存量冻结、只减不增）。

**需要 CTO 层面知晓/决策的三项风险**：数据库迁移链已不是 schema 真相源（squash runbook 待批）；playground 与 deep-insight 双克隆持续漂移（去留待拍板）；跨 pod 任务中止依赖进程内 Map（多实例部署前必须解决）。详见 §6。

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

技术栈：Next.js 14 + NestJS 10 + Prisma + PostgreSQL 16 + Redis 7，LLM 经 LiteLLM 多供应商接入。开发模式的特殊性在于：绝大部分代码由 Claude Code agent 编写、人负责决策与验收——下文多数心得正是这个模式踩坑后的产物。

---

## 2. 心得一：规范的生命周期——honor-only 必然失守，机器门禁才算数

### 2.1 反面教材：2026-06-21 Mission 失控事故

一个 deep 档洞察任务两轮累计运行约 33 小时，烧掉 **$18.16 / 6.05M token**，全程无任何断路器介入，最终「thrash 到自然 completed」。（完整复盘：`docs/operations/incident-2026-06-21-mission-runaway-postmortem.md`）

关键事实：

- 直接机制：BYOK 模型能力标志缺失 → 结构化输出兜底到最脆弱的「文本夹 JSON」路径 → 强模型把万字 markdown 塞进 string 槽 → schema 反复 reject → 无限重试。
- **四层防护同时失守**：revert 只验编译不验真跑；换模型不做端到端回归；1913 个 mock 测试给假信心；断路器只防「冻死」不防「高频出事件但不前进」的空转。
- 最刺痛的一条：CLAUDE.md 的「反向洞察」第 5 条早就写明「必须有断路器，否则日烧 250K API calls 级事故」——**规范写了，但 honor-only，没有任何自动化拦截**。事故复盘原文直接点名了这一点。

### 2.2 正面演进：把规范变成门禁的完整链条

事故前后，项目把看护体系系统性升级为「三处执行点互补」（详见 `.github/workflows/ci.yml`、`.husky/pre-push`、`backend/.eslintrc.js`）：

| 执行点 | 时机 | 内容 |
| --- | --- | --- |
| ESLint 分层护栏 | 写代码时 / pre-commit | facade 穿透、逆向依赖、TaskProfile 绕过、密钥直返、能力字符串匹配等，error 级 |
| jest 架构 spec | `verify:arch` / pre-push 第 0 步 | 34 套件：依赖方向、词汇纯净、契约基线、投影纯度、0-consumer 拦截等 |
| CI 合并门 | PR 合并 | 9 个 job（lint/test×2/build/quality/arch-boundary/ui-discipline/boot-smoke/capability-index）全 success 才放行，`always()` + 显式 result 检查防 skip 误判为通过 |

pre-push 本身是 10 步全量门，包括 god-class 尺寸守护（>2500 行文件净增 >50 行拒推）、UI 纪律 hard-zero、硬编码中文棘轮、运行时依赖审计、能力索引漂移检查等。

### 2.3 给 CTO 的含义

- 规范文档的唯一正确归宿是「挂上机器看护」。项目里多份标准明确绑定 spec 文件（如标准 24 挂 `verify:arch`），CLAUDE.md 甚至为暂未自动化的 10 条规范逐条标注 `honor` 状态作为债务清单——**「honor-only」本身被当作一种需要偿还的技术债来管理**。
- 事故复盘的 P2 项「把断路器、运行时验证从 honor-only 升级为 spec/lint 拦截」是这条心得的制度化表达。
- 相同教训的另一实例：全栈诊断发现 CI 实际跑 `test:quick` 静默跳过 53 个 spec（含 JWT/guardrails 安全测试），「绿灯」不等于「跑了」；已修复为全量 `test:ci` + 真实覆盖率棘轮（`diagnosis-2026-06-14.md` Top#4，fix `ce9dd6d34`）。

---

## 3. 心得二：分层架构必须「可执行」，否则只是一张图

### 3.1 演进时间线（证据重建）

| 时间 | 事件 | 证据 |
| --- | --- | --- |
| 2026-03-05 | 旧分层：L2 ai-kernel（内核层）+ L6 intent-gateway（编排层）存在 | `docs/_archive/2026-q2/architecture-old-*` |
| 2026-05-01 | credentials/BYOK 从 L2 下沉 L1（零 agent 状态 → 归通用基元） | commit `fee5d688b` |
| 2026-05-29 | 五层稳定态成图：L4→L3→L2.5(harness 11 聚合)→L2(engine 12 聚合)→L1 | `layered-architecture.md` |
| 2026-05-30 | 分层审计 + 复审 + 整改计划 | `platform-review/2026-05-30-*` |
| 2026-06-02/03 | MECE 波次整改：engine/safety W0–W7 八波、跨层能力迁移 W1–W3 九域 | `platform-review/2026-06-02/03-*` |

两个被整层删除的「历史包袱」值得单独说：

- **ai-kernel**：早期模仿 OS 内核概念的层（Mission 进程/IPC/内核记忆/调度），能力后被并入 L2.5 harness。教训：自造概念词（kernel/runtime/execution）撑不起一层；现在架构 spec 直接禁止自造词目录，顶层目录必须是业界标准词。
- **intent-gateway**：架构图上是「L6 智能编排层」，实际是 0 消费方的 Placeholder 空壳。教训被固化成机器规则：`harness-uplift-gate.spec.ts` 要求任何上提到 harness 的 framework/helper 必须有 ≥2 个真实 mission app import，**「空壳上提」现在推不上去**。

### 3.2 迁移方法论：波次 + 风险梯度 + 每波全绿

MECE 整改不是一次大爆炸重构，而是拆成 W0–W7 / W1–W3 等小波次，按风险梯度（low→high）排序，每波以 `verify:arch` 全绿为完成标准（engine-safety 计划 §9.3 有执行回执：4 波已执行、32 套件 362 测试全通过）。近期 L3 治理（PR #399/#401）沿用同一模式，并用 dual-read（新旧配置双读）实现不停机切换。

### 3.3 给 CTO 的含义

- 分层规则每一条都有对应拦截物：单向依赖（`layer-boundaries.spec.ts`）、facade 唯一入口（ESLint overrides + `agent-team-facade-contract.spec.ts`）、词汇纯净（`vocab-purity.spec.ts`：harness/engine 生产代码不得出现业务词）、前后端事件契约 byte-equal（`playground-frontend-contract.spec.ts`）。
- 架构护栏中最精细的一类是「基线契约」：用 TS Compiler API 锁住某函数的真实调用方清单、某字段的读者清单，任何新增消费方都要显式过基线更新流程（`CONTRACT_README.md`）——这把「架构漂移」从 review 负担变成编译期事实。

---

## 4. 心得三：做减法的勇气——三次典型的「少即是多」

1. **三库合一**（ADR-0003 → ADR-0004）：移除 MongoDB/Neo4j/Qdrant，统一 PostgreSQL 16——JSONB+GIN 替代文档库、递归 CTE 替代图库、向量能力入 PG（`docs/architecture/ai-infra/database-postgresql.md`）。这是一次公开的「反向决策」：ADR-0003（双库策略）被明确标记为废弃并由 0004 取代,决策错误被留档而非掩盖。
2. **拒绝过度抽象的租户模型**（ADR-0005）：面对多租户需求，没有对标 OpenAI/WorkOS 新建 Organization/RBAC 实体，而是复用既有 `User+ContentVisibility+Topic/TopicMember+workspaceId` 收口 IDOR——判断依据是「真缺的是执行一致性而非新实体」。
3. **删除胜于维护**：intent-gateway 整层删除；`git log` 近期仍可见同类动作（能力索引从 1947→1948→1950 逐条登记的同时，0 消费方代码被持续清理）。CLAUDE.md 将 Karpathy 反过度抽象原则列为红线（「只用一次的代码不要抽 Strategy/Factory；3 处使用再考虑抽象」）。

**给 CTO 的含义**：在 AI Agent 大量产出代码的模式下，「生成代码很便宜、维护代码很贵」被急剧放大，减法能力（删层、删库、拒绝新实体）比加法能力更稀缺，也更值得在 review 中被显式奖励。1,950 条 canonical 能力索引 + 「写代码前先查复用」的 capability-map skill，就是把「不要重复造轮子」从口号变成 agent 的强制前置动作。

---

## 5. 心得四：AI Agent 规模化开发的治理学

这是本项目最具外部参考价值的部分——多数团队还没到「AI 写 90% 代码」的阶段，这里的坑都是先趟过的。

### 5.1 权限收敛：白名单 + 隔离 + 禁全局操作

2026-02-10 事故（sub-agent 越权创建模块、主 agent 用 `git checkout -- .` 回退时误删其他会话的工作）之后形成的铁律，全部写入 CLAUDE.md：

- Sub-agent prompt 必须包含**文件白名单**与必要上下文（Prisma model、DTO 定义），禁止凭猜测写表名/接口；
- 并行会话/子 agent 必须 **worktree 隔离**；
- **永久禁止**全局回退命令（`git checkout -- .` / `git reset --hard` / `git clean -fd` / 未确认归属的 `rm -rf`），只允许逐文件回退；
- Sub-agent 禁止创建新模块、禁止触碰全局入口文件。

### 5.2 对抗性复核：AI 产出必须被 AI 攻击一遍

- 2026-06-14 全栈诊断动用 26 个子 agent、8 维度独立审计，并对全部 high/critical 发现做**对抗性复核**——结果证伪了 1 条 critical（「150 controller 零测试」实为方法论错误），多条 high 降级，报告显式列出「勿追误报」清单（`diagnosis-2026-06-14.md`）。
- MECE 迁移蓝图由 28 个 agent / 2.07M token 的 workflow 产出，9 个能力域先全部被判 needs-fix、修正后才定稿（`2026-06-03-capability-mece-migration-blueprint.md`）。
- 心得：**单路 AI 产出的置信度不够用于架构决策，「生成 + 对抗验证」的双层结构是必需品**，且成本完全可接受。

### 5.3 经验固化三段链：事故 → 规范（挂看护）→ 工具

项目的知识管理不是写 wiki，而是一条闭环流水线：

```
事故/诊断发现 ──→ 编号规范（26 份，多数绑定机器看护 spec）──→ skill/agent 固化（44 skill + 13 agent）
   例: 迁移红线 honor-only → no-alter-type-in-exception.spec（18 个历史违规冻结为 allowlist，新增零容忍）
   例: 「先查复用」经验 → capability-map skill + capabilities:check CI 门
   例: 审计能力本身 → arch-auditor / arch-guardian / security-auditor 常驻 agent
```

另有一个独特实践：对照还原的 Claude Code v2.1.88 源码提炼 10 条 agent-runtime「反向洞察」（断路器、prompt cache 保护、fallback 配对占位等），作为 harness/runner 类改动的强约束规范，并如实标注其中多数仍为 honor-only（`docs/architecture/claude-code-borrow/agent-execution-guide.md`）——**向头部同行的事故注释学习，比自己再烧一遍便宜**。

### 5.4 给 CTO 的含义

AI Agent 开发的治理投入产出比极高，但投入点与传统团队不同：不是流程文档，而是（1）执行环境的物理约束（白名单/隔离/禁令）、（2）产出的对抗验证、（3）经验的可执行化。三者都要求「治理本身也是代码」。

---

## 6. 心得五 + 风险台账：防「假绿」，以及还没还完的债

### 6.1 「假绿」的四种形态与对策（已落地）

| 假绿形态 | 真实案例 | 对策 |
| --- | --- | --- |
| mock 给假信心 | 1913 个测试全 mock LLM，真模型 finalize 根本不吐合法 JSON | boot-smoke（CI 中真实 `NestFactory.create` 实例化全 DI 图，抓 mock 抓不到的循环依赖）；真模型集成测试列入 P2 计划 |
| CI 静默跳测 | `test:quick` 跳过 53 个 spec，覆盖率门槛形同虚设 | 全量 `test:ci --coverage`，per-module 覆盖率棘轮真实强制 |
| 守护自身失效 | 断言写了但从不 fire | protection-net 反向证据测试：故意投喂 broken payload，断言 4 个守护真的拦截；audit 脚本自检（在反模式样本上 EXITCODE 必须 ≠0） |
| 存量违规淹没新增 | UI 违规、硬编码中文存量大 | 棘轮基线：存量冻结进 baseline JSON，只减不增，超基线 exit 1 |

### 6.2 风险台账（需 CTO 知晓或拍板）

| # | 风险 | 现状 | 建议 |
| --- | --- | --- | --- |
| 1 | **迁移链不是 schema 真相源**：338 个迁移，部署靠 `db push --accept-data-loss` + 失败迁移静默标 applied 兜底，空库与存量库路径发散 | squash runbook 已写好，**待审批未执行**（`.claude/diagnosis/migration-squash-runbook.md`） | 数据层最深的系统性债务，建议尽快批准执行窗口 |
| 2 | **playground / deep-insight 双克隆漂移**：2026-06-10 revert 把两套近乎重复的 pipeline 冻成永久分叉，且抹掉了 fast-fail 修复（本次事故放大器） | 事故复盘 P1-2，标注「唯一不可逆决策，待拍板」 | 二选一：forward-port 修复或退役 playground 自有 pipeline |
| 3 | **MissionAbortRegistry 为进程内 Map**：多 pod 部署时 cancel 落错 pod 静默失效 | 已登记设计风险（P0-5），单 pod 暂缓 | 横向扩容前必须先做（Redis pub/sub 或亲和路由） |
| 4 | **「70-75% 成本优化」缺测算依据**：该数字仅在 `layered-architecture.md` 作为结论出现，无配套量化文档 | 技术可行性有据（PostgreSQL-First 三条替代路径），成本数字不可追溯 | 对外引用前补一页测算，或降级表述为「显著降低」 |
| 5 | **10 条反向洞察多为 honor-only** | CLAUDE.md 已逐条标注看护方式 | 按事故复盘 P2-2，把高频项（断路器、运行时验证）升级为 spec/lint |
| 6 | **真模型集成测试缺位**：至少一条 deep mission 用真模型跑通并断言成本上限 | 事故复盘 P2-1，未落地 | 纳入 CI 定期任务（非每 PR），成本可控 |

### 6.3 诚实性说明

- 本仓库为浅克隆（本地仅 74 个提交，2026-06-15 起），早期演进依据 `docs/` 归档文档与文中引用的 commit hash 重建；「PR-X 系列」清理在本地无留档，未采信。
- 规范体系存在小瑕疵：标准编号 10 撞号（documentation-organization 与 security）、01/25/26 缺号——不影响结论，如实记录。

---

## 7. 可复制的方法论清单（带走页）

给其他团队/项目的十条可直接移植的做法：

1. 每条书面规范必须回答「谁在机器上拦截它」；答不出的进 honor-only 债务清单并排期升级。
2. 架构边界 = ESLint（写时）+ jest spec（推前）+ CI 合并门（合并时）三层执行点，缺一不可。
3. 合并门用 `always()` + 显式逐 job result 检查，防 skip/cancel 被误判为通过。
4. 存量违规用棘轮基线冻结（只减不增），让新增零容忍与历史债务解耦。
5. 大重构拆小波次、按风险梯度排序、每波以架构 spec 全绿收口；配置迁移用 dual-read 过渡。
6. 「上提公共层」设消费方门槛（≥2 个真实 import），用测试拦住空壳抽象。
7. AI 产出的架构结论必须过对抗性复核；显式维护「已证伪/勿追误报」清单。
8. Sub-agent 一律白名单 + worktree 隔离；全局回退命令永久禁用。
9. 用反向证据测试验证守护本身会 fire；审计脚本要能在反模式样本上自证非假绿。
10. 断路器要同时覆盖「冻死」（无心跳）和「空转」（高频事件但无进展 + 成本速率），并对单任务设成本上限。

---

## 附：本报告引用的关键证据文件

- 事故复盘：`docs/operations/incident-2026-06-21-mission-runaway-postmortem.md`
- 全栈诊断：`.claude/diagnosis/diagnosis-2026-06-14.md`（+ `migration-squash-runbook.md`）
- 分层架构：`docs/architecture/layered-architecture.md`；MECE 系列：`docs/architecture/platform-review/2026-06-02/03-*`
- 数据库决策：`.claude/adrs/0003/0004/0005` + `docs/architecture/ai-infra/database-postgresql.md`
- 看护机制：`backend/src/__tests__/architecture/`（34 spec）、`backend/.eslintrc.js`、`.husky/pre-push`、`.github/workflows/ci.yml`、`scripts/utils/audit-*.ts`、`docs/architecture/capabilities.json`
- 反向洞察：`docs/architecture/claude-code-borrow/agent-execution-guide.md`
- 治理红线与固化体系：`.claude/CLAUDE.md`、`.claude/standards/`（26 份）、`.claude/skills/`（44）、`.claude/agents/`（13）
