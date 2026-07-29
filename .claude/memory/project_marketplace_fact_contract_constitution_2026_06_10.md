---
name: project_marketplace_fact_contract_constitution_2026_06_10
description: "专家市场=契约的函数；契约必须按零特权 3 方设计=事实/解释接缝；自家 app 必须吃狗粮。#16b 硬切失败根因复盘 + 重排路线"
metadata:
  node_type: memory
  type: project
  originSessionId: d49dcf2e-2c02-4701-b486-010da5ef4e6f
---

# 专家市场「宪法」：一套事实契约，1/2/3 方汇聚

2026-06-10 用户把能力抽象到「专家市场」，北极星 = **1 方(自家 app)/2 方(伙伴 company)/3 方(外部开发者)都在同一套契约上汇聚生产与消费能力**。围绕此目标重审整条能力下沉线，结论固化如下。承接 [[project_positioning_digital_employee_2026_06_09]]、[[project_capability_datafication_deferred_2026_06_09]]、[[project_expert_agent_businessflow_2026_06_09]]。

## #16b 硬切失败根因（必记，别重演）

- 时间线：6/7 sediment playground→marketplace(`9ee37c63c`) → 6/9 #16a flag 默认 OFF 双轨(`41c896e6b`) → 6/9 **#16b 硬切删 flag+删旧 dispatcher**(`164d98dc6`) → 6/9~6/10 **6 个 fix 打地鼠补事件** → 6/10 **整体 revert 回 6f59 自有 pipeline**(`c6056e795`)。
- 根因 1（与方向无关的执行硬伤）：**仅凭测试绿就删 flag**；#16b 自己写「运行时平价需部署后冒烟」，而那正是塌的地方。删 flag 后无逃生口，唯一退路是 92 文件 revert。
- 根因 2（结构性）：能力核端口 `capability-runner.port.ts` 只有 **11 个 type + 一个 `domain` 字符串逃生舱**，playground 实际需 **80 个 typed 事件**。用窄契约套最富消费方 → 每类业务事件都靠 `emitDomain("字符串名")` 约定 + 消费方各写 switch + gateway 逐个注册，**没枚举就上线后一个个发现** = 打地鼠。

## 决定一切的规则：事实 vs 解释（架构边界的生成规则）

> **通用=事实**（客观发生了什么，换任何消费方都不变：agent 调了某工具拿到某输出、stage 起止、花了多少 token、第几轮 ReAct、维度完成评分 X）。
> **自定义=解释**（某 app 决定拿事实怎么呈现/聚合/什么文案/什么策略：评分→红 badge、14-chip 点亮、序言成文、>280 截断）。

- 边界落点（确定、不手挑）：**数据「还是纯事实」的最后一刻 = 核边界；第一次编码进某 app 的选择 = app 起点。** 压缩/截断是解释，核绝不替 app 做（`relayAgentEvent` 在源头 truncate 就是越界 → 有损）。
- 三个自检：①换人测试(加第 N 个 app 要不要每家不同？要→解释) ②点名测试(出现 `playground`/`s2-leader-plan` 等具体 app 概念？有→已污染) ③增长测试(每来一个 app 就加字段/type？是→边界切错侧)。
- 为何这条线稳：**事实有限**(执行机器框死)→核表面稳定可依赖；**解释无限**(每 app 发明新视图)→放进核就每来一个 app 长一圈。#16b 的 11-type 是手挑无规则 → 必漂移。

## 实扫 playground + company 的裁决（两个 general-purpose agent，带 file:line）

- playground 80 事件：**~50 纯事实(该核供)** / **~12 纯解释(该留 app)** / **~18 混合(该拆)**。8 个 agent-level 事件是 raw `IAgentEvent` 的 1:1 机械改名(`event-relay.framework.ts:262-469`)=纯事实铁证。
- **最致命证据**：同一事实 `dimension:graded`/`agent:narrative` 被 playground projector(`todo-board.projector.ts:842/1124`)与 company bridge(`company-mission.service.ts:1233/1254/1263`)**各用字符串字面量识别一遍** = 核没标准化供出事实的代价(增长测试报警实锤)。
- 点名违规(双向)：核点名 playground(`agent-invoke.helper.ts:13/55`、`deep-insight-stage-bindings.ts:224/373...` 全是 `playground.*` specId；port:131-140 注释钉 `14-chip`/`s1-budget`)；company 被迫认核内部(`company-mission.service.ts:825` 硬编码 `"playground.researcher"`、`828` `resolve("deep-insight")` 类名、`110/1346` `s2-leader-plan` stepId)。
- 注：`playground.*` specId 在**共享 agent-spec-catalog**(playground 自己也读)→去点名与「playground 不动」有边界冲突，需别名层或小幅动 catalog id。

## 北极星的硬性要求（市场宪法 5 条）

1. **一套契约 = 事实/解释接缝**：3 方发事实，宿主投影解释。这就是 SDK 表面。
2. **零点名，spec/lint 强制**（非 honor）：3 方无特权上下文，任何 `playground.*`/stepId 泄漏即硬阻断。扩 arch spec 加「契约禁现 app 名」。
3. **信任+执行隔离是独立于语义契约的另一轴**：1 方进程内全信任；**3 方不能进程内跑，须沙箱/远程(MCP/A2A)**。`ICapabilityRunner` 注释已预埋「未来 sandbox/remote/MCP 实现」。一套语义契约、多种执行部署，不是三套契约。
4. **事实必须可序列化跨进程/网络**：3 方在别处跑，现 `payload: Record<string,unknown>` 传进程内对象过不了远程边界。1/2 方不咬人，3 方一上来就咬。
5. **manifest + 权限 + eval + 计费/归因 = 契约原语**：3 方声明要哪些工具/数据、宿主授权；3 方烧的 token 谁付怎么拿钱；质量信号怎么附。1 方能手挥过去，3 方不行。

## 关键判断（回答用户历次提问）

- **3 方是让契约诚实的强制函数**：为零特权者设计 → 自动得到超集 + 零泄漏 + 标准协议。这解开了「哪个 app 定义契约」——**都不是，是假想 3 方定义**，1/2 方是其子集。
- **自家 app 必须吃狗粮**（Bezos API mandate / AWS·Stripe·Salesforce·Apple 共同打法：一套契约、自家 app 只是第一租户、第一天就为对外设计）：**playground 跑私有 pipeline 绕过契约 = 1 方走后门**；两级体系(1方私道/2·3方走市场)必致公开契约腐烂。故「冻结 playground 只修核+company」**可作阶段 1，作终态致命**——playground 上契约是契约不腐烂的唯一狗粮测试。
- **趋势判断**：能力市场+开发者生态是主航道(GPT Store/Agents SDK、MCP/A2A、AgentExchange/Copilot Studio)。你可执行+可验证(eval 层)起点高于 GPT-store 套壳。但**技术只是入场券**，发现/信任质量门/变现分成三个非技术问题最终决定生死。

## 重排路线（顺序与 #16b 正相反）

1. **阶段 1**：定义那一套契约，**从第一天按 3 方设计**(typed 可序列化事实流 + 零点名 + 可 MCP/A2A 表达 + manifest/权限/eval/计费占位)；**用 playground 80 事件超集校验** + 加「playground 平价」契约测试(即便 playground 没上)；迁 company 上干净契约。**雷：当成「只为 company 修」会造出两方好用、3 方崩的契约，将来重造。**
2. **阶段 2**：狗粮——迁 playground(1 方)上同一契约。flag 纪律(生产实测平价才删私道)。了结双源。
3. **阶段 3**：开边界——契约经 MCP/A2A 对外 + 沙箱 + manifest + 计费 + eval，放 2 方再放 3 方。

契约设计草案：`docs/architecture/marketplace-fact-contract-v0.md`（设计文档，未动代码）。

## 评审 + v0.1（2026-06-11）

对抗式 workflow 评审（4 维度 reviewer × 真实代码 + 逐条对抗验证）：**29 finding，28 确认，1 假阳**。总判定：核心论点(事实/解释切分+为3方设计+狗粮)站得住，但 v0 不够格当承重墙。评审抓到我 v0 的真错：①凭空造私有 `FactEnvelope`/`CapabilityManifest`，**无视仓内已有 A2A v0.3 全栈**(`ai-harness/protocols/a2a/a2a-spec.types.ts`)和**同名 `capability-manifest.ts`+ADR 009**(权限/沙箱/版本复用 plugin+isolated-vm，不得重造)；②写错文件路径(`relayAgentEvent` 真实在 `deep-insight.runner.ts:893-1091`+`deep-insight-stage-bindings.ts:358/537` slice，非 playground/events 路径)；③relay 静默丢 **4 类**(output/terminated/tools_recalled/iteration_progress，`default:return`)非我以为的 3 类；④契约自留 4 个 `Record<unknown>` 逃生舱=自打脸；⑤超集承诺为假(缺 chapter/reconciliation/postlude/memory/output 整族)。

**D1 已拍板：deep-insight 核作实现真源，playground 迁移上核**(理由：manifest/ADR 009/A2A/company 消费等基建都绑核上，提升 playground 等于弃投资)。

**v0.1 已落**(重写 docs/architecture/marketplace-fact-contract-v0.md)：补全 80+ 事件超集的完整 typed FactEvent union(AgentFact 18+PipelineFact 40+，无开放舱，GoalsShape 类型化，chapter/segment 轴 parentUnitId 嵌套，critic warnings[]/red-team 三计数/dimension:graded 拆分)；§4 manifest 改增量 diff(复用 rubric/permissions/coreVersionRange)；§6 A2A v0.3 逐字段映射(FactEvent↔TaskStatusUpdateEvent/TaskArtifactUpdateEvent，manifest↔AgentCard)+远程边界(异步 OnFact/at-least-once+seq/size 上限走 artifact 外置)；§7 spec 断言运行期 stageId∈manifest.stages(非只扫源码)；§9 契约演进章(schemaVersion+unknown-kind MUST-ignore+只增可选+facts[]白名单)。

**D2/D3/D5 已专业拍板**(技术决策不外推)：D2 命名定 `unit`(父)+`segment`(子,parentUnitId 嵌套)——跨能力通用，section 太偏写作/workItem 偏任务味 · D3 去点名定**迁共享 catalog `playground.*`→`deep-insight.*` 一次机械改全引用、不建别名层**(别名层=迟早删的双源；契约可点名 capability 不可点名 app；id 重命名是字符串级非行为改) · D5 定**复用 plugin PluginCapability+isolated-vm(ADR 009 已批，无据推翻)**。**D4 计费(用户提示"参考Genspark"后改判)**：~~原定 consumer-pays 原始 token 是弱答案~~。Genspark 实际=**信用点(credits)中介模型**(已 web 核实:订阅+加油包、聊天 0 点获客/重活收点、平台吃 token 成本波动)。改判结构:**买方恒付平台信用点(骑既有 credits 系统)，能力声明点价，平台吃点价↔token 差，补贴/获客=平台定价政策杠杆非契约二元开关，3 方分成走 take-rate(App Store/AppExchange，Genspark 自营无此维度)，token 必须平台代理计量/签名对账不信自报。** `manifest.billing` 改成 `{pricing,publisherPayout}` 非 `attribution` 二元。**商业参数用户让"默认一个不纠结",已置默认(可调零架构影响)**:take-rate 20%/聊天0点·能力收点(照 Genspark)/1点=$0.002($20·1万点)/revShare%(非 bounty)。D2-D5 全闭合，契约 v0.1 技术自洽。完整 80 事件归类表 + 3 条 trace 映射见评审 agent 产出(aab7facbded4a0078)，阶段 1 落 spec 时内联。

**协作教训**：用户两次("你应该围绕未来目标重新审视"、"你没有办法专业决策么")纠我 over-defer——技术决策(命名/去点名打法/复用既有 ADR)有证据就该专业拍板+给依据,只把真正的商业/产品决策外推给用户。见 [[feedback_expose_ambiguity_not_silent_choice]] 的边界:暴露多义是对"用户才能定的"，技术最优解该自己定。
