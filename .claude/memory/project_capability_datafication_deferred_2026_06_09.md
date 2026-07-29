---
name: project_capability_datafication_deferred_2026_06_09
description: 万级专家 scaling 改造——把 CapabilityRegistry 从代码注册改为 data-driven，已排期到「既有架构/流程优化收尾后」再做
metadata:
  node_type: memory
  type: project
  originSessionId: 3c8583f5-0c9c-4925-88df-845744c27640
---

用户 2026-06-09 拍板：**等既有架构和流程优化弄完，再落实「专家数据化（支撑数千上万专家）」改造**。即这是已确认的下一阶段路线项，当前不动手，先收尾既有工作。

**Why**：分析现状（读 marketplace-catalog.service.ts / company-hero.service.ts / company-mission.service.ts / capability-registry.ts）得出——当前架构能轻松撑**数千上万*用户*订阅**（CompanyHero/CompanyMission 纯 userId-indexed 行，标准水平扩展），但只能撑**几十量级的*专家定义***。根因：专家 = 编译期代码，不是运行期数据。

现状硬天花板（核实过）：

- `CapabilityRegistry`（capability-registry.ts:16）= 进程内 `Map<string, ICapabilityRunner>`，能力家在 `onModuleInit` 手动 `register()`。今天真 runner 实际只有一个 `deep-insight`（deep-insight.runner.ts）。Team/Skill/MissionPipeline Registry 同形——全是 boot 期代码注册的 in-memory 单例。
- 加 1 个专家 = 改代码 + 加 NestJS Provider + 发版；1 万专家 = 1 万 Provider 每 pod 启动全量注册进内存，无法按需加载/分页。
- `MarketplaceCatalogService.getCatalog()`（marketplace-catalog.service.ts:266 getWorkflows 嵌套 byRole Map+flatMap 去重）每次 O(n) 重算，**无缓存**。

**How to apply**（改造方向，到时按此落）：

1. **CapabilityRegistry data-driven**：专家 manifest 入 DB，少数**通用参数化 runner** 按 manifest 执行（取代每专家一段代码）。注：现有抽象方向已对——`adoptHero` 存 capabilityId **引用字符串**而非 snapshot，天然适配「专家变数据」，真正要换的只是 registry 的解析端。
2. **目录 DB+Redis 缓存**：按 capabilityId 懒加载，目录走分页/搜索，增量失效。
3. **mission 执行加队列**：现 `createMission` 用 `void this.runMission()` fire-and-forget（company-mission.service.ts:163），无并发上限/背压 → 高并发派单撞 LLM 限流 + 内存爆。需 BullMQ/Redis 队列 + concurrency cap + 重试/死信。
4. **运行态搬进 Redis**：`abortControllers`/`collabBuffers`/`liveTaskState` 现是进程内 `Map`（:91-112，代码注释已自认「单 pod 内有效，多 pod 取消落非起跑 pod 只翻 DB 状态」）→ 多 pod 时取消/回放/live 进度会串或丢。

**harness/engine 层补充评估(2026-06-09,Explore 逐文件审计)**——「数万用户×数万专家」下两层本身的瓶颈:

- **✅ registry 不受专家数影响**:ToolRegistry(~200)/SkillRegistry(~50)/TeamRegistry/AgentRegistry/PromptRegistry 都 onModuleInit 全量注册的固定大小 Map(ai-engine.module.ts:254),存「定义」非「实例」。但 harness 的 TeamRegistry/AgentRegistry **也是代码 onModuleInit 注册** → 数万专家定义仍要数万段代码每 pod 启动全注册,**专家数据化改造必须连 harness 这俩 registry 一起做**。
- **❌ 数万用户的三个真·架构天花板(独立于专家数,即使数据化做完仍在)**:
  1. **运行态全进程内 Map 非 Redis**:EventBus 订阅表进程内(protocols/ipc/event-bus.service.ts:32,事件订阅不跨 pod)、ConcurrencyLimiter 队列(runner/concurrency/concurrency-limiter.ts:33)、cost-controller records、SessionMemorySidecar(runner/executor/session-memory-sidecar.service.ts:58)全 per-pod → mission 必须 sticky 否则取消/事件/进度乱。解:运行态搬 Redis + EventBus 上 Redis pub/sub adapter。
  2. **无全局背压**:mission fire-and-forget,ConcurrencyLimiter 队列无上限,token-budget 是 per-mission DB 预算非系统级限流 → 突发涌入 OOM + DB 连接池枯竭。解:Redis 队列 admission control。
  3. **LLM 并发/配额无分布式共享限流**:httpAgent maxSockets=50 per-pod(llm/llm.module.ts:96);RPM 限流是进程内 Map<userId:modelId>(ai-chat-failover-caller.service.ts:62)不跨 pod → 多 pod 集体打爆 provider 配额。解:Redis per-provider token bucket。
- **⚠️ 卫生项(量级小,优先级低于上面)**:进程内 cache 懒过期无 LRU(rpmCache/cachedConfigByUser embedding.service.ts:158/authErrorEndpoints);harness_agent_events+checkpoint 表无 TTL/归档,listByAgent O(n) WAL 压力;向量检索依赖 pgvector HNSW 索引(运维项);batchStoreEmbeddings 逐个 await 非真批(embedding.service.ts:188);BYOK key 每次 DB 解密 ~10-50ms 热路径无缓存。

**关键认知:scaling 是两条独立的轴**——「数万专家」=registry 数据化(marketplace CapabilityRegistry + harness Team/AgentRegistry);「数万用户」=运行态搬 Redis + 全局背压 + 分布式限流。两者不能互相替代,要分别治理。

**专业判断·优先级裁决(2026-06-09,文档 §7,推翻"两轴平级一路建完"的初版编排)**——「数万用户×数万专家」是假设非现状(今天真实只 1 个 capability=deep-insight),两轴该不该现在做结论相反:

- **轴 B 是当下可靠性缺陷非未来 scaling**:company-mission.service.ts:163 `void this.runMission()` = 今天进程一重启在跑 mission 就丢,单 pod 也错(agents-task 当初同因列 P0)。→ **B-W1(BullMQ 队列+boot recovery+运行态搬 Redis,照抄 agents-task 范式)是收尾后第一件该立项的,理由是可靠性不是扩展性,独立 P0 不捆绑轴 A**。
- **轴 B-W2(跨 pod 事件+分布式限流)**:等真上 ≥2 pod 再做。
- **轴 A(专家数据化全套)暂不做**:就 1 个 capability 去建 manifest 表+模板 runner+DB registry = 为不存在用例抽象(踩反过度抽象红线)。**触发条件 = 路线图确有 ≥3–5 个不同专家类型在排队(rule of three),由第 2/3 个真实专家形状定模板接缝——不按数字触发**。
- **§6 四待确认项的结论**:①模板粒度现在别定(只 1 个模板,决策是空的);真要选用 `template` 字符串键非 `kind`(kind 是货架分类,与执行形状正交)②manifest 来源=平台运营建坚决不开放用户自定义(安全:permissions 推给 plugin isolated-vm;战略:用户自建会填平"专家=平台判断力"护城河)③harness EventBus 不上 Redis pub/sub(WS 层 @socket.io/redis-adapter 已够;当前一 mission 在一 worker 内跑完无跨 pod 业务订阅方)④限流用 ioredis 手写 token bucket 非 @nestjs/throttler(后者 HTTP 请求级抽象错位,要按 provider TPM/token 成本算)。

**5 路集中审视修正(2026-06-09,workflow wf_ede0c0a5)——文档初稿基于过时代码,轴 A 大幅缩水**:

- **撰稿期间 W2「能力即产品」重构同日落地**(另一处工作),deep-insight 从「手写 6 阶段」升级为 `MissionPipelineOrchestrator + recipe(14阶段 s1-budget…s11-persist) + DeepInsightStageBindings`(deep-insight.runner.ts:4-6 头注释/:125 register+registerPipeline,654 行)。我写文档读的是旧代码 → §2.1/§3.1 旧描述全过时。
- **存在权威文档 docs/architecture/capability-execution-architecture.md(v1.0 同日,authoritative)已定形「能力即产品」执行架构 + W1→W5**:recipe=声明式config、StageBindings=能力侧编排代码、MissionPipelineOrchestrator=通用执行器、三端口(StageBindings/MissionPersistencePort/MissionEventPort)。**这正是我轴 A 提的"模板 runner 数据化"——人家已设计且 W2 已落地**。→ **本文轴 A 真正增量只剩一条:recipe/manifest 从代码常量变 DB 数据 + DB-backed CapabilityRegistry + 目录分页缓存**(权威文档把 recipe 留作 code const,未覆盖数据化层)。其余轴 A 以权威文档为准,不另设计。
- **行号修正**:company-mission.service.ts abortControllers :131(非:91)/collab :136/live :144/runMission :203/runHeroMission :243/**验收 gate :647-686(rubric 已实装在运行路径,非"未激活")**。
- **§7 优先级判断仍成立**(section7_holds=true):B-W1 先做轴A暂缓经得起审视。但 **B-W1「照搬 agents-task」假设被证伪**:company 的 onEvent 进程内缓冲(崩溃即丢)/验收递归 runViaCapability(attempt+1)/跨pod abort(AbortController进程内)都是 agents-task 没有的 → **B-W1 立项前必补 3 项设计:①onEvent 持久化 ②分布式 abort 信号 ③验收重跑 processor 化**;另多pod jobId=missionId 需 Redis SETNX 锁防双执行双计费 + processor 显式注 billing.userId。
- **教训**:[[feedback]]类——多 session 并行下,跨多轮写架构文档前/中必重读关键文件确认基线未漂移(本次正是 W2 同日落地导致初稿全程基于过时读取)。修正栏已置文档顶部,§4 已标"仅技术参考"。

文档权威:docs/architecture/platform-review/2026-06-09-scale-10k-users-10k-experts-plan.md(已加顶部集中审视修正栏;轴A缩水,轴B有效但需补3项设计)。承接定位 [[project_positioning_digital_employee_2026_06_09]] 与业务流闭环 [[project_expert_agent_businessflow_2026_06_09]]。
