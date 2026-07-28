# 如何构建一个 Agent / 多 Agent 系统 — GenesisPod 实践复盘（CTO 汇报）

> **日期**: 2026-07-23（v5：按"内部技术探索 + 五视角×三句"重构,主线收敛为 Agent/多 Agent 系统构建）
> **性质**: 内部技术探索项目的开发心得复盘,非对外产品汇报
> **调查方式**: 三路并行只读调研（治理规范与事故教训 / 架构演进史 / 自动化看护机制）+ 仓库量化统计
> **证据原则**: 每句结论配项目内实证；无法追溯的数字如实标注（见 §8）
> **维护者**: Claude Code

---

## 0. 项目定位声明

**GenesisPod 是一个内部技术探索项目,不是对外销售的产品。** 它的探索命题只有一个：**如何构建一个可信的 Agent / 多 Agent 系统**——包括 Agent 运行时（编排、记忆、守护、追踪）、多 Agent 协作（分工、审校、交接）、以及支撑这一切的工程方法论。

- **试验场**：自己每天真实发生的洞察任务（信源采集 → 阅读消化 → 深度研究/话题洞察 → 知识沉淀 → 持续追踪，对应 explore/research/insight/library/radar 模块链）。真实任务、真实成本、真实失败,才能压强测试 agent 系统的每个环节。
- **真正的产出**：不是某个功能,而是**一套被验证过的 Agent 系统构建方法论**——五层架构（app/harness/engine/infra）、运行时护栏（断路器/结构化输出/成本上限）、以及把经验固化为机器看护的完整体系（26 规范 / 34 架构 spec / 44 skill / 13 agent / 1,950 条能力索引）。这些资产可迁移到任何下一个系统。
- **规模背书**：后端约 157 万行 TS、20 个 agent 应用、400+ PR、绝大部分代码由 AI Agent 编写——这场探索本身就是"用多 Agent 系统构建多 Agent 系统"的双重实验。

下面是探索沉淀出的十五句心得,按五个视角组织,每句都源自本项目的真实实践或事故。

---

## 1. 一页总览：十五句

| 视角 | 三句心得 |
| --- | --- |
| **产品定位** | ① Agent 系统的交易单位是"干完的活",不是 Agent 本身 ② 没有真实任务喂养的 Agent 平台是空壳 ③ Agent 的护城河是被编码的判断,四层缺一不可 |
| **产品架构** | ④ Engine 不知道 Agent,Agent 不知道业务 ⑤ 架构边界必须机器可执行,拦不住的规则等于没有 ⑥ 不要为 Agent 自造概念层 |
| **产品工程** | ⑦ LLM 输出永远不可信,结构化要靠 native 约束 ⑧ 每个 Agent 任务必须有断路器:防冻死、防空转、封顶成本 ⑨ 模型能力必须数据驱动,换模型就是一次回归 |
| **迭代演进** | ⑩ Agent 系统的重构只能小波次滚动,没有大爆炸 ⑪ revert 也是变更,只验编译的回退埋雷更深 ⑫ 每次事故必须沉淀为机器看护,闭环才算复盘完 |
| **产品质量** | ⑬ mock 测出来的 Agent 都是"好 Agent",真跑一次才见真章 ⑭ Agent 的质量始于验收标准:说不清"什么叫做对了"就永远做不对 ⑮ AI 的产出必须被 AI 对抗,单路结论不可信 |

---

## 2. 产品定位视角

### ① Agent 系统的交易单位是"干完的活",不是 Agent 本身

用户要的是结果（一份带引用、可复盘的洞察报告）,不是养一只 agent。这决定了系统形态:多 Agent 编排对用户不可见,可见的只有交付物及其验收状态。本项目的定位坐标（`product-positioning.md`）把这一点讲透:左端零件市场卖工具（要用户会拼）,右端通用 agent 卖"一只全能 agent"（质量抽卡、会闯祸）,而以交付物为中心的系统卖"可信、一致、可问责"。**设计 agent 系统,先定义交付物和验收标准,再倒推需要什么 agent。**

### ② 没有真实任务喂养的 Agent 平台是空壳

正面:本项目所有平台能力都由日常洞察任务这条真实链路喂出来——最近 30 个提交全是这条链的打磨（YouTube 翻译、论文摘要、引用分级、信源库回填）,数据飞轮（信源信誉/知识沉淀越用越准）也只在这条链上转。反面:intent-gateway 在架构图上是"智能编排层",实际是 0 消费方的 Placeholder,最终整层删除（`docs/_archive/2026-q2/architecture-old-intent-gateway/`）。**先有任务,再有平台;为想象中的 agent 场景预建的层,只会变成维护成本。**

### ③ Agent 的护城河是被编码的判断,四层缺一不可

一个专业 agent 的价值沉淀在四层可编码资产:**工作流程**（这类活分几步、何时回头,`MissionPipelineRegistry`）、**团队配置**（谁主谁辅谁审,capability roles）、**技能**（每步注入的领域方法论正文,`buildSkillInstructions` 注入 SKILL.md）、**验收 rubric**（什么叫做对了 + 不达标重跑）。本项目前三层已真跑,第四层缺失——当前 review 只是同一个 LLM 自评,无独立验收、无合格门槛（§8 风险 #0,P0）。**模型会持续变强,前三层会被逐渐摊薄,唯有"什么叫做对了"的标准不会被模型替代——它是 agent 系统最后的、也是最值钱的一层。**

---

## 3. 产品架构视角

### ④ Engine 不知道 Agent,Agent 不知道业务

多 Agent 架构的命根是"每层只知道该知道的":L2 engine（LLM 调用/工具/RAG/安全）不得持有任何 agent/mission 状态;L2.5 harness（运行循环/记忆/守护/交接）不得出现业务词汇;业务只活在 L3 app。这不是文档约定,是机器规则:`vocab-purity.spec.ts` 扫描 harness/engine 生产代码里的业务词,`layer-boundaries.spec.ts` 拦逆向 import,agents 层另有 primitive isolation 禁 import mission/teams 概念。**这条分界让 20 个 agent 应用共享同一个运行时而互不污染——没有它,每个 app 都会长出自己的私有 agent 循环。**

### ⑤ 架构边界必须机器可执行,拦不住的规则等于没有

本项目的每条架构规则都能回答"谁在机器上拦截它":facade 唯一入口（ESLint error 级,禁穿透聚合内部路径）、依赖单向（架构 spec）、前后端事件契约 byte-equal、函数调用方/字段读者锁基线契约（TS Compiler API,新增消费方必须显式过基线流程）。三层执行点互补:ESLint 写代码时拦、34 个架构 spec 推送前拦、CI 9 job 合并门最后拦。**多 Agent 系统的模块间接缝比普通系统多一个数量级（agent×tool×model×事件）,靠 review 守边界必然失守,边界必须编译期/CI 期可执行。**

### ⑥ 不要为 Agent 自造概念层

删层史:ai-kernel（模仿 OS 内核,管 Mission 进程/IPC/调度）和 intent-gateway（"智能编排层"）都被整层移除,能力并入标准分层;活下来的顶层目录全是业界标准词（agents/runner/memory/handoffs/guardrails/tracing/evaluation）,架构 spec 明令禁止自造词目录（kernel/execution/runtime 类）。配套规则:上提公共层必须有 ≥2 个真实消费方 import（`harness-uplift-gate.spec.ts`）,空壳抽象推不上去。**Agent 领域概念通胀严重,自造概念会让系统无法与业界对齐、无法招人、无法开源——命名保守是架构美德。**

---

## 4. 产品工程视角

### ⑦ LLM 输出永远不可信,结构化要靠 native 约束

6-21 事故的中心根因:agent 的 finalize 输出走了"普通文本里夹一段 JSON,再用 7 策略启发式抽取"的脆弱路径,强模型直接把万字 markdown 写进 string 槽,schema 反复 reject,任务无限重试。全平台 17+ 个 agent 同模式,但根因是单点:结构化输出路由在正常轮次用宽松 schema,修复方式是"一旦 finalize 被拒,下一轮强制升级 provider 层 strict schema"（`react-loop.ts`）。**教训:凡是要机器消费的 agent 输出,必须用 provider native 的 json_schema/tool_use 强约束;"从文本里抠 JSON"只能是最后兜底,且兜底路径必须有快停。**

### ⑧ 每个 Agent 任务必须有断路器:防冻死、防空转、封顶成本

6-21 事故里一个洞察任务空烧 33 小时 / $18.16 / 605 万 token,期间没有任何护栏介入——因为 liveness 守护只杀"心跳和事件双停滞"的冻死,杀不了"高频出事件但不推进"的空转（67 次 validation-reject 的 thrash）,且部分 mission 类型连 liveness 都没注册。修复后的完整断路器三件套:**无进度+持续烧钱即 abort、每类 mission 强制注册 liveness+wall-time/cost cap（架构 spec `mission-app-conformance` 强制）、cancel 无条件先 fire abort 再改状态**。附带一个设计警示:abort 注册表是进程内 Map,多实例部署时取消会静默失效（§8 风险 #3）。**Agent 是会花钱的无限循环,断路器不是可选项,是 agent 运行时的地基。**

### ⑨ 模型能力必须数据驱动,换模型就是一次回归

同一事故的另一半根因:BYOK 自动配置模型时不写结构化输出能力标志,capability 派生链兜底到最弱路径;而模型能力若靠 `modelId.includes('gpt')` 这类字符串猜测,换个网关别名就全错。本项目的固化:能力目录数据驱动（每条规则必含 rationale/addedBy,防投毒）,决策代码禁模型名字符串匹配（ESLint error + AST contract spec + audit 三层拦截）,模型选择走单一漏斗,定价单源。**Agent 系统的行为 = 代码 × 模型,模型是外部依赖里最善变的一个:接入新模型、新 provider,必须当作一次全量回归对待,而不是改个配置。**

---

## 5. 迭代演进视角

### ⑩ Agent 系统的重构只能小波次滚动,没有大爆炸

MECE 架构整改拆成 W0–W7 八波（engine/safety）、W1–W3 九域（跨层能力迁移）,按风险梯度 low→high 排序,每波以 `verify:arch` 全绿收口（有执行回执:4 波执行、32 套件 362 测试全通过）;策略配置迁移用 dual-read（新旧双读）不停机切换。roadmap 的非目标清单第一条就是"❌ 重写"。**Agent 系统是在线跑着真任务、烧着真钱的系统,大爆炸重构等于拿生产 mission 当小白鼠;小波次 + 每波机器验收,是唯一被验证可行的演进方式。**

### ⑪ revert 也是变更,只验编译的回退埋雷更深

2026-06-10 的一次 revert,验证标准只有"tsc 0 错误、测试全绿",没真跑一次 deep mission。它悄悄抹掉了终态仲裁/快停修复,把 playground 冻成 deep-insight 的永久分叉克隆——十一天后成为 6-21 事故的放大器（schema 失败的任务无法 fast-fail,只能静默空转）。**回退在心理上是"恢复安全状态",在事实上是一次和 feature 同权重的变更;对 agent 系统,任何变更（含 revert、含换模型）的验证标准都必须包含"真跑一次端到端 mission"。**

### ⑫ 每次事故必须沉淀为机器看护,闭环才算复盘完

本项目的固化流水线:事故/诊断发现 → 编号规范（绑定机器看护 spec）→ skill/agent 工具化。实例:迁移红线从 honor-only 升级为 spec 拦截（18 个历史违规冻结 allowlist,新增零容忍）;"先查复用"经验固化为 capability-map skill + CI 门;审计能力常驻为 arch-auditor/arch-guardian agent。还包括向同行学习:对照还原的 Claude Code 源码提炼 10 条 agent-runtime 血泪教训（断路器/prompt cache/fallback 配对）,直接当强约束规范用——**读别人源码注释里的事故,比自己烧一遍便宜**。尚未自动化的规范被逐条标注 honor 状态、当显式债务排期偿还:"还没固化"不可耻,不承认才可耻。

---

## 6. 产品质量视角

### ⑬ mock 测出来的 Agent 都是"好 Agent",真跑一次才见真章

6-21 事故漏到生产的四层失守里,最扎心的是"1913 个测试几乎全 mock LLM"——mock 永远返回合法 JSON,真模型根本不吐。同类假绿还有:CI 曾静默跳过 53 个 spec（含安全测试）,覆盖率门槛形同虚设。对策已落地:boot-smoke 在 CI 真实实例化整个 DI 依赖图（抓 mock 抓不到的循环依赖）,全量 test:ci + per-module 覆盖率棘轮,真模型端到端回归列入计划（§8 风险 #6）。**Agent 系统的核心行为在模型侧,mock 掉模型的测试只能证明胶水代码没写错,证明不了系统能活。**

### ⑭ Agent 的质量始于验收标准:说不清"什么叫做对了"就永远做不对

两个层面同一条理。对人/对开发:任何任务开工前必须转成可验证目标（"修 bug"→"复现测试通过","优化"→"指标+基线+目标值"）,答不出验收标准的需求退回澄清。对 agent/对产出:mission 的 review 环节目前只是同一个 LLM 自我总结自评,没有独立验收、没有合格门槛、没有不达标重跑——这是全系统识别出的最高优先缺口（§8 风险 #0）。**多 Agent 协作里,没有独立验收的"审校"角色是集体自嗨;rubric（什么叫做对了 + 不达标怎么办）应该和 prompt 同等地位,是 agent 定义的一等公民。**

### ⑮ AI 的产出必须被 AI 对抗,单路结论不可信

全栈诊断动用 26 个子 agent、8 维度独立审计,再对全部 high/critical 发现做对抗性复核——结果证伪 1 条 critical 误报、多条 high 降级,并留下"勿追误报"清单;MECE 迁移蓝图由 28 agent 的 workflow 产出,9 个域先全部被判 needs-fix、修正后才定稿。守护自身同样要被对抗:protection-net 测试故意投喂坏数据确认闸门真的会拦,审计脚本必须在反模式样本上自证会报错。**"生成 + 对抗验证"是 agent 系统的质量下限结构——对 agent 写的代码如此,对 agent 产的报告如此,对质量守护本身也如此。**

---

## 7. 项目底盘数据

| 指标 | 数值 | 指标 | 数值 |
| --- | --- | --- | --- |
| 后端 TS | 4,617 文件 / 约 157 万行 | 前端 TS | 1,555 文件 / 约 50 万行 |
| 测试文件 | 2,016 个 | 累计 PR | 400+（本地浅克隆仅见 74 提交） |
| Agent 应用（L3） | 20 个 | Harness/Engine 聚合 | 11 / 12 个 |
| 架构 spec | 34 套件（7 类） | 能力索引 | 1,950 条（AST 生成,CI 防漂移） |
| 编号规范 / ADR | 26 / 5 | skill / agent | 44 / 13 |

技术栈:Next.js 14 + NestJS 10 + Prisma + PostgreSQL 16（三库合一,已移除 MongoDB/Neo4j/Qdrant）+ Redis 7,LLM 经 LiteLLM 多供应商接入。

---

## 8. 风险台账（需 CTO 知晓或拍板）

| # | 风险 | 现状 | 建议 |
| --- | --- | --- | --- |
| 0 | **验收 rubric 缺失**（呼应第⑭句）:review 仅同一 LLM 自评,无独立验收/合格门槛/重跑,DTO 无 rubric 字段 | 定位文档判为 P0 命门 | 探索命题的下一个主攻方向,建议最高优先级（`ai-harness/evaluation` 已有承载位） |
| 1 | **迁移链不是 schema 真相源**:338 个迁移,部署靠 `db push --accept-data-loss` 兜底 | squash runbook 已写好,待审批未执行 | 数据层最深债务,建议尽快批执行窗口 |
| 2 | **playground / deep-insight 双克隆漂移**（第⑪句的现在进行时） | 事故复盘 P1-2,"唯一不可逆决策,待拍板" | forward-port 修复或退役 playground 自有 pipeline,二选一 |
| 3 | **MissionAbortRegistry 进程内 Map**:多 pod 时 cancel 静默失效 | 已登记设计风险,单 pod 暂缓 | 横向扩容前必须先做（Redis pub/sub 或亲和路由） |
| 4 | **"70-75% 成本优化"缺测算依据**:仅为结论性断言 | 技术可行性有据,数字不可追溯 | 引用前补测算,或降级为"显著降低" |
| 5 | **10 条反向洞察多为 honor-only** | 已逐条标注看护方式 | 高频项（断路器/运行时验证）升级为 spec/lint |
| 6 | **真模型端到端回归缺位**（第⑬句的未竟项） | 事故复盘 P2-1,未落地 | 纳入 CI 定期任务（非每 PR）,断言成本上限 |

**诚实性说明**:本仓库为浅克隆（本地仅 74 提交,2026-06-15 起）,早期演进依据 docs 归档与文中 commit hash 重建;"PR-X 系列"本地无留档,未采信。规范编号存在撞号/缺号小瑕疵,不影响结论。

---

## 附：关键证据文件

- 事故复盘:`docs/operations/incident-2026-06-21-mission-runaway-postmortem.md`
- 全栈诊断:`.claude/diagnosis/diagnosis-2026-06-14.md`（+ `migration-squash-runbook.md`）
- 分层架构:`docs/architecture/layered-architecture.md`;MECE 系列:`docs/architecture/platform-review/2026-06-02/03-*`
- 定位与护城河四层:`docs/architecture/product-positioning.md`
- 数据库决策:`.claude/adrs/0003/0004/0005` + `docs/architecture/ai-infra/database-postgresql.md`
- 看护机制:`backend/src/__tests__/architecture/`（34 spec）、`backend/.eslintrc.js`、`.husky/pre-push`、`.github/workflows/ci.yml`、`scripts/utils/audit-*.ts`、`docs/architecture/capabilities.json`
- 反向洞察:`docs/architecture/claude-code-borrow/agent-execution-guide.md`
- 治理与固化体系:`.claude/CLAUDE.md`、`.claude/standards/`（26）、`.claude/skills/`（44）、`.claude/agents/`（13）
