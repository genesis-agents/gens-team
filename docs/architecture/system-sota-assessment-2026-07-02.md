# GenesisPod 全系统 SOTA 对标评估报告

**评估日期**: 2026-07-02
**基线 commit**: `8c7309842`
**方法**: 5 个并行专项审计（全部只读），互相独立后交叉校验
**对标基准**: 架构/工程对标业界一流 TypeScript 工程实践；平台层对标 LangGraph / OpenAI Agents SDK / Claude Agent SDK / AutoGen；产品层对标 ChatGPT / Claude.ai / Perplexity / Notion AI / Gamma

| 专项                           | 审计方式                                                                  | 实际读取                            |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------- |
| 架构合规（12 维度）            | arch-auditor 全量扫描 + `verify:arch` 40 套件实跑（全绿）+ npm audit 实跑 | 16 关键文件精读 + 全库正则/AST 扫描 |
| 平台生命力（harness + engine） | 23 聚合逐一"真伪盘点" + SOTA 能力矩阵                                     | 60+ 核心文件                        |
| 工程与验证                     | CI/测试/静态防线/发布/依赖 六维                                           | 40+ 配置与 spec 文件                |
| Web UI 业务面                  | 以导航单源圈定可见范围，逐模块完成度 + `audit:ui-discipline` 实跑         | 35+ 页面/hook/store                 |
| 代码质量深度抽样               | 核心路径深读 + 全局反模式统计                                             | 17 深读 + 7 结构探针                |

---

## 一、执行摘要

### 总分板

| 维度                       | 得分       | 一句话判词                                                                                           |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| 架构合规                   | **75/100** | Facade 边界满分、LLM 规范满分；被跨 App 耦合、代码健康度（超大文件/any）拖垮                         |
| 平台成熟度（vs SOTA 框架） | **7.5/10** | 23 聚合 22 个真实现；Guardrails 与 structured-output 韧性**超越开源 SOTA**；流式与可观测性是两块欠账 |
| 工程与验证                 | **6.3/10** | 静态防线业界领先（8.5）；覆盖率治理（4）与发布工程（5.5）严重拖后腿                                  |
| 代码质量                   | **6.7/10** | 类型纪律/注释文化/安全基线达 SOTA；粒度失控（4）与复制债（4）是系统性缺口                            |
| Web UI 业务面（可见部分）  | **~7/10**  | 旗舰路径（playground/agents/marketplace）接近可对外；RSC 缺席、i18n 名存实亡、12 万行休眠代码        |

**综合印象：一个"护栏工程做到极致、但护栏没测的维度在野蛮生长"的系统。** 层间边界、LLM 调用规范、UI 纪律这些有自动化看护的维度全部接近满分；单元大小、跨 App 耦合、复制代码、CI 覆盖率强制这些没有护栏的维度全部失守。这不是能力问题，是治理覆盖面问题——补齐护栏的成本远低于已展现的护栏工程水平。

### 全局最高优先级发现（交叉验证）

| 级别   | 发现                                                                                                                                                                                                                                                                                                                                                                                                  | 来源                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **P0** | **单例 Adapter 可变配置竞态 → 跨用户 BYOK key 串用风险**：`FunctionCallingLLMAdapter` 为 NestJS 单例却持有 `private config` + `setConfig()`（`function-calling-llm.adapter.ts:79,123`），`tool-exec.sub-facade.ts:337-355`、`ai-response.service.ts:1744` 先 setConfig 再长时流式执行——并发请求 B 会覆盖 A 流式中途的 userId/apiKey（计费/密钥串号）。这正是 CLAUDE.md 反向洞察 #8 在自家代码里的活体 | 代码质量              |
| **P0** | **backend CI 覆盖率完全空转**：`test:ci` 无 `--coverage`，精心设计的 per-module 阈值（playground 95 / harness·engine 85）在 CI 不生效；连锁导致 codecov 上传的 lcov 不存在而静默失败                                                                                                                                                                                                                  | 工程                  |
| **P0** | **生产镜像不可复现**：Dockerfile 用 `npm install --no-package-lock --legacy-peer-deps`，每次生产构建的依赖树都可能不同，`overrides` 也可能失效                                                                                                                                                                                                                                                        | 工程                  |
| **P0** | **npm audit 29 个 high 级漏洞**（0 critical，prod deps）                                                                                                                                                                                                                                                                                                                                              | 架构                  |
| **P0** | **核心执行路径静默吞错**：后端约 88 处 `.catch(() => null/{})`（其中 34 处零日志），集中在 `react-loop.ts`（5 处）、`agent-runner.service.ts`、`key-resolver.service.ts` 等核心链路                                                                                                                                                                                                                   | 架构 + 代码质量双确认 |

---

## 二、架构（75/100，12 维度）

### 满分项（护栏生效的证明）

- **Facade 边界 15/15**：ai-app/open-api 穿透 engine/harness 内部路径 **0 违规**（含动态 import），与 949 行 `.eslintrc.js` + `layer-boundaries.spec.ts` 三方印证。
- **LLM 调用规范 8/8**：硬编码模型名/temperature/maxTokens 全库仅命中注释与事故复盘备注，ai-app 直接 SDK 调用 0 处——TaskProfile 迁移执行彻底。
- **API 设计 10/10**：DTO class-validator 覆盖 88.2%、Swagger 81.5%、全局 JwtAuthGuard + ThrottlerGuard 兜底。
- **可观测性 4/4**：Logger 采用 82.2%、聚合健康检查、OTel GenAI semconv 映射。

### 失分项

1. **依赖方向 5/8 —— 跨 App 耦合是最大架构债**。反向依赖（engine→harness、platform→上层）0 违规；但 ai-app 内部发现 **~24 处硬性跨 App 直接 import**：explore→library（FlareSolverrService 直引）、planning→teams（AiTeamsService 直引）、office 整模块装配 research/writing/insight 3 个 App、teams→writing、ask→library、company→marketplace/library 等。另外 `ai-app/contracts/agent-catalog.ts` / `agent-spec-catalog.ts` 反向拉取 6 个 App 的常量 + marketplace 内 11 个 Agent 类实现——契约层退化为耦合枢纽。
   **关键盲区**：`no-app-cross-coupling.spec.ts` 只检测目录命名，**不检测实际 import 语句**，所以这 24 处从未被 CI 拦截。正确模式已存在（`data-export.interface.ts` 的纯接口 + Symbol DI-token）但未推广。
2. **代码健康度 2/10**：非测试代码 77 处 `any`；**379 个文件 >500 行、99 个 >1000 行**（top：`team-mission.service.ts` 6333 行、`report-formatting.util.ts` 4345、`admin.service.ts` 3526）；`ai.facade.ts` 2912 行——facade 本身已偏离 thin-delegation 初衷。
3. **错误处理 4/10**：静默 catch 34 处零日志；HttpException 覆盖率 70.6% 压线，Controller 层仍有 6 处裸 `throw new Error()`。
4. **配置与依赖 2/4**：65 个文件直接 `process.env`；29 个 high 漏洞。

安全态势 8/10 整体良好：safeCompare 三处密钥比较全覆盖、raw SQL 全参数化、CORS 精确匹配；`sql-executor.tool.ts`（AI 可调用的 SQL 执行器）有纵深防御但属高价值攻击面，建议复核其注册/权限门槛。

---

## 三、平台生命力（重点专题）—— 7.5/10

### 3.1 真伪盘点结论：不是空壳

harness 11 聚合 + engine 12 聚合共 23 个，**22 个判定真实现**（stub 扫描 runner/agents/handoffs/teams 零命中）。代表性证据：

- **runner**：`react-loop.ts` 2620 行真 ReAct 环（maxIterations 守卫 + 临限强制 finalize、failover 时退还迭代预算、每轮 microcompact）；`function-calling-executor.ts` 1924 行原生 FC 环（每轮 checkpoint + `resumeFromCheckpoint` 生成器真中断恢复、`Promise.allSettled` 并行工具组）；`kernel-scheduler` 用 PG `FOR UPDATE SKIP LOCKED` 做分布式调度；真 DAG 执行器 + 死锁检测。
- **guardrails（超越 SOTA）**：70%/85%/100% 梯度预算压力，loop 内真调 `budget.downgrade()` 换便宜模型直至 `stopReason="budget"` 硬中止；`MissionBudgetPool` 父子 agent 共享预算池；Redis `INCRBY` 原子 token 账本；对接真 CreditsService 扣费。**开源框架普遍没有这一层。**
- **memory**：Prisma 表 checkpoint/事件溯源（per-agent seq 唯一约束，multi-pod 安全）+ resume/fork 带租户越权检查。
- **protocols**：A2A v0.3 规范级双向实现（JSON-RPC 2.0 server + client + agent-card discovery + 把远端 A2A agent 当队员用的 adapter）。
- **engine/llm**：5 个原生 provider caller；structured output **9 策略降级链** + 请求内 4xx 降级 + 空产出自愈 + 降级结果异步 self-heal 持久化；`ModelFallbackService` 错误分类学 + TTL blocklist + BYOK-aware 链。
- **engine/tools**：72 内置工具；真 MCP client 三传输（stdio / SSE / streamable-http 带会话续传 + SSRF guard）+ 对外 MCP server；Claude-Code 式 `isConcurrencySafe` 并行分组；真 DB 轮询 HITL 审批。
- **engine/rag**：HyDE → 混合检索 → RRF → Cohere rerank（BYOK failover）→ parent 扩展 + 8k 预算组装。

半成品清单：mission 级 checkpoint 仍是 in-memory Map（agent 级已持久化）、`NoopEmbeddingProvider` 默认伪向量、A2A `message/stream` 只回单个 final 事件、**OpenAPI→tool adapter 文档声称但实际不存在**、MCP 握手协议版本停在 2024-11-05、**LiteLLM 已不在依赖中（CLAUDE.md 技术栈描述过时）**。

### 3.2 SOTA 能力矩阵

| 能力                 | LangGraph | OpenAI SDK | Claude Code | 本项目     | 差距/优势                                                                               |
| -------------------- | --------- | ---------- | ----------- | ---------- | --------------------------------------------------------------------------------------- |
| Agent loop 健壮性    | 强        | 中         | 强          | **8/10**   | checkpoint+resume/fork+compaction 齐；扣：双 loop 并存、mission checkpoint 未持久化     |
| 工具系统（MCP/并行） | 中        | 强         | 强          | **8/10**   | MCP 双向 + 72 工具 + 并行分组；扣：无 OpenAPI adapter、协议版本旧                       |
| 多 Agent 编排        | 强        | 强         | 中          | **8/10**   | 真 debate/voting/DAG/分布式调度 + spawnMany 对冲/多数决 + A2A 远端队员                  |
| 可观测性             | 强        | 强         | 强          | **6.5/10** | 自研 OTel-形 tracer 无 OTLP 出口，生态接入需自写 sink                                   |
| Guardrails/预算      | 弱        | 中         | 中          | **8.5/10** | **领先业界**：梯度降级 + 共享预算池 + 真扣费                                            |
| Memory               | 中        | 弱         | 中          | **7/10**   | DB-backed 全套；扣：JSONB 向量应用层余弦有规模天花板                                    |
| Streaming/Realtime   | 强        | 强         | 强          | **6.5/10** | **主 chat 路径 `callAPIWithConfig` 是缓冲非流式**——最大体验短板                         |
| 扩展性               | 强        | 强         | 强          | **8/10**   | LoopRegistry 可插拔 + 代码/DB 双注册 + SKILL.md 同 Claude Code 格式；扣：绑死 NestJS DI |

### 3.3 生命力判断（回答"如何确保足够生命力"）

**(a) 耦合度**：harness 对 ai-app 的 import 为 **0**（反向 763 个 ai-app 文件消费 harness facade）——层间出乎意料地干净。但 34 处 `@/common/prisma` + CacheService + credits 依赖 + 全量 NestJS DI 意味着**脱离本 monorepo 无法编译**。定位是"干净的内部层"，不是"可 npm publish 的框架"。

**(b) 协议标准跟进**：业界少见地激进——MCP 双向（既消费又暴露）+ A2A v0.3 双向 + OpenAI 兼容路由 + OTel GenAI semconv + Langfuse。协议面上不会被时代甩下。

**(c) 维护成本 vs 机会成本**：近 90 天 harness 481 / engine 592 commits，315+273 个 spec，维护有纪律。**换 LangGraph/OpenAI SDK 的机会成本高**——它们不提供 BYOK failover 链、credits 真扣费、mission 终态仲裁、capability self-heal，而这些正是 13 个 app 的商业刚需。

**(d) 差异化护城河**（业界开源框架没有的）：① mission 终态单写者仲裁；② 父子共享预算池 + loop 内梯度降级换模型；③ structured-output 9 策略降级链 + 自愈持久化；④ BYOK 全链路（key 三档来源、user-scoped 错误分类防误熔断）；⑤ `HarnessFailurePattern` 失败模式学习；⑥ 模型选举 + mission 内多样性扣分。

**生命力结论**：平台的生命力**不在于能否独立发布**，而在于它让 13 个 AI 应用共享同一套预算、韧性和编排肌肉——这是直接采用 LangGraph 们买不到的部分。战略上应**明确"不做通用框架"**，把投入锁在护城河项上，同时止住两处失血：双 agent loop 并行演化（最大隐性 bug 工厂）和主 chat 路径非流式（最大体验落差）。

---

## 四、工程与验证 —— 6.3/10

| 子维度     | 分      | 要点                                                                                                                                                                                                                 |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 静态防线   | **8.5** | 全仓最强：949 行事故驱动 ESLint（每条附事故编号）、AST 级反模式拦截（API 双前缀 404、hydration 安全）、40 架构 spec（90 describe）、pre-push 10 步（god-class 增长限额、i18n 棘轮、runtime-deps 审计）。超过多数团队 |
| CI 流水线  | 7.5     | 9 并行 job + 硬合并门 + `boot-smoke`（NestFactory 全 DI 图验证，业界少见）；扣：无分片、job 间无产物复用                                                                                                             |
| 测试金字塔 | 6       | 抽查 10 个 spec 质量真实不走过场；但形状是"单根柱子"：单元:集成:e2e ≈ **1761:3:32**，且 32 个 Playwright e2e 完全不进 CI，CI 里的 Postgres container 几乎没人消费                                                    |
| 依赖治理   | 6       | dependabot + gitleaks + prod critical 硬门 + runtime-deps 审计好；扣：ESLint 8 已 EOL、Next 14/React 18、双 canvas 依赖、audit 放行 high                                                                             |
| 发布工程   | 5.5     | entrypoint 单一真相源 + 灰度开关好；扣：**deploy.yml 是 placeholder（无真实 CD）**、Dockerfile 不用 lockfile、无镜像扫描/SBOM                                                                                        |
| 覆盖率治理 | **4**   | 最大言行不一：分模块阈值设计精细但 **CI 不带 `--coverage` 完全不生效**，codecov 上传静默失败（`fail_ci_if_error: false` 双重掩盖）                                                                                   |

---

## 五、代码质量 —— 6.7/10

**达到/超过 SOTA**：生产代码 `as any` 仅 15 处（前端 0）、`@ts-ignore` 近零、strict 全开；failureCode 分类学 + diagnostic + recoveryHint 全链路；"法证式注释"文化（带日期、mission id、根因链）；`tool-invoker.ts` 教科书级资源管理（派生 AbortController + Promise.race 超时 + finally 清理）；SQL 白名单 + 生产密钥强制 + per-user HKDF 密钥隔离。

**两大系统性缺口**：

1. **粒度失控（4/10）**：268 个 >800 行非测试文件（6.5%，SOTA 通常 <1%）；`react-loop.ts` 的 `run()` 单方法 ~1364 行、`chatInner()` ~1270 行、`executeTask` ~630 行——均不可单测。lint/spec 护栏覆盖了"层间边界"却没覆盖"单元大小"。
2. **复制式演进（4/10）**：① playground ↔ deep-insight **24 个文件整目录复制**（`mission-critic.agent.ts` 两份字节级相同，diff 退出码 0）；② `function-calling-executor.ts` 内部三份近似循环（execute / resumeFromCheckpoint / executeWithDefinitions）；③ ReActLoop 与 FunctionCallingExecutor 双 agent loop 各自维护 maxIterations/预算/failover；④ 前端 `useRadarStream` 与 `useMissionStream` ~90% 重复。

**其他代表性问题**：provider 错误分类靠消息文案 regex（已因 xAI/OpenAI 文案差异修过两次，应在 adapter 层归一化 typed error）；`chatInner` 把错误编码进 content 字符串（下游漏检 `isError` 即把错误文案当模型输出入库）；`useApi.ts` 两处竞态（abort 后 finally 打灭新请求 loading；deps 展开 + 内联回调致自动重刷循环）；`useStream.ts` 重连 timer 无清理；后端 64 个非测试文件含 emoji、244 处 TODO/FIXME。

---

## 六、Web UI 业务面（仅可见部分）

### 6.1 可见范围（导航单源 `nav-config.ts`，Sidebar/MobileNav 无漂移）

可见 8 个主入口 + 3 个底部项。**约 12 万行前端代码（近半业务组件）挂在隐藏/无入口路由上**，仍参与构建与 lint：ai-insights 31,969 行（已被 playground 替代）、ai-office 25,470（Docs/Excel 是 Coming Soon 占位）、ai-research 16,042（已退役）等 11 个模块。

### 6.2 可见模块完成度

| 模块                         | 分      | 状态                                                                                                                             |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| /agent-playground（AI 洞察） | **8.5** | 旗舰：replay hydrate + socket.io + polling 兜底 + 断点续跑（业界少见）；瑕疵：重命名用 `window.prompt`                           |
| /agents、/marketplace        | 7.5     | 成熟，全 canonical，薄壳页                                                                                                       |
| /library                     | 7       | 成熟但笨重：page.tsx 1895 行、自写图片 Modal、中英混杂                                                                           |
| /ai-radar                    | 7       | 可用→成熟；三态是自写 div 未用 canonical                                                                                         |
| /me                          | 7       | 成熟；裸 `<img>`、保存后 `window.location.reload()`                                                                              |
| /explore                     | 6.5     | ExploreContent 3734 行 god component                                                                                             |
| /foresight                   | 6.5     | P0 期，深度依赖 seedDemo                                                                                                         |
| /ai-ask（门面页）            | **6**   | 功能最全但技术债最重：2978 行 god component + `eslint-disable no-explicit-any`、自写 Toast、Unsplash 外链背景、fallback 🤖 emoji |

### 6.3 横向质量

强项：UI 纪律审计实测 **543 文件 16 规则 0 违规**；API 层设计优秀（token 刷新/LRU/AbortController 去重 + 48 domain hooks）；mission 流式架构业界水准；MobileNav 一流。
弱项：**API 层执行 4/10**（~350 处裸 fetch 绕过 canonical 层）；**性能 3/10**（116 个 page.tsx 中 110 个 `'use client'`，RSC 基本未用；根路由带 4034 行死代码做客户端跳转；14 个 >2000 行 god 文件）；**i18n 4/10**（基建干净但 84+ 文件硬编码中文，英文 locale 名存实亡）；3 套 SSE 解析并存。

### 6.4 与 SOTA 产品差距 Top 5

1. 首屏路径：95% 客户端渲染 + 零 RSC，TTI 远劣于 ChatGPT/Perplexity 的流式 SSR
2. 英文体验不可用——封死国际化发布
3. 分享能力错位：`/share` 只覆盖已退役模块，旗舰 playground 有可见性 API 却无公开分享落地页
4. 无消息级"编辑重发/regenerate/换模型重答"闭环；无跨模块统一历史/全局 Cmd+K
5. 产品叙事发散：8 可见入口 + 11 休眠模块 vs ChatGPT 一个输入框的心智模型（IA 已在收敛，半路状态暴露给用户）

**可合并项**：ai-ask self-driven-team / rooms / ai-teams / ai-simulation 本质是"多 Agent 会话"四胞胎；ai-store（纯 mock）并入 marketplace 或删除；ai-image 并入 playground 产出链。

---

## 七、综合改进路线图（按 ROI 合并排序）

### 立即（本迭代，多数为小改动大收益）

1. **修 P0 竞态**：`FunctionCallingLLMAdapter.setConfig` 改为每调用创建轻量实例或 config 参数透传（跨用户 BYOK 串号风险）
2. **CI 开覆盖率**：`test:ci` 加 `--coverage`（1 行），已配好的 per-module 阈值立即生效，顺带修复 codecov 静默失败
3. **Dockerfile 改 `npm ci`** + `COPY package-lock.json`，恢复构建可复现
4. 排查 29 个 high 漏洞的生产可达性
5. 核心路径 34 处零日志静默 catch 补 `logger.warn`
6. **删 `app/page.tsx` 4034 行死代码**，根路由改 server redirect——零风险立即减包

### 短期（1-2 个迭代）

7. **合并双 agent loop**（react-loop 2620 行 vs FC executor 1924 行）——最大隐性 bug 工厂；以 native FC 收敛
8. **主 chat 路径接通真流式**（SSE 解析器已有，接通即得端到端 token 流）
9. `no-app-cross-coupling.spec.ts` 升级为真扫 import 语句，24 处跨 App 耦合建 allowlist + 归零计划；`contracts/` 改用已验证的 DI-token 模式解耦
10. 消灭 playground ↔ deep-insight 24 文件复制目录（抽共享包）
11. e2e 冒烟子集（5-8 条关键 journey）进 PR CI；新增 10-20 个真库集成测试消费 CI 的 Postgres
12. mission 级 checkpoint 落 Prisma；provider 错误分类升级为 adapter 层 typed error
13. 归档 ai-insights + ai-research（合计 48K 行退役代码）

### 中期（季度）

14. 写 OTLP sink（`SpanExporter.addSink()` 接口已备好）接入 Jaeger/Datadog 生态
15. 文件行数 CI 门（新增文件 ≤500 行棘轮）+ 分批拆 top 10 巨石（`team-mission.service.ts` 6333 行起）
16. ESLint 8→9 / @typescript-eslint 8（EOL 工具链是静态防线地基风险）；真实 CD 落地（Railway API + trivy 扫描）
17. i18n 清欠（84+ 文件硬编码中文）+ 关键页面 RSC 化 + playground 公开分享落地页
18. 向量层迁 pgvector；CLAUDE.md 纠偏（删 LiteLLM/PM2/OpenAPI adapter 等过时声明）；10 条 honor-only 反向洞察中第 1/4/8 条升级为 spec/lint

### 战略决定（需要明确拍板）

- **平台不做通用框架**：不投入 Nest/Prisma/credits 端口化剥离；把精力锁在 6 项护城河能力上
- **产品叙事收敛**："多 Agent 会话四胞胎"合一、休眠模块处置（归档 vs 复活）需要产品层决策，代码层面已具备收敛条件（MissionGalleryView 等共享组件方向正确）

---

## 附录：五份专项报告的评分对照

| 报告       | 综合分 | 最强项                                             | 最弱项                           |
| ---------- | ------ | -------------------------------------------------- | -------------------------------- |
| 架构合规   | 75/100 | Facade 边界 15/15、LLM 规范 8/8、API 10/10         | 代码健康度 2/10、错误处理 4/10   |
| 平台生命力 | 7.5/10 | Guardrails 8.5（超 SOTA）、loop/工具/编排/扩展性 8 | 流式 6.5、可观测性 6.5           |
| 工程与验证 | 6.3/10 | 静态防线 8.5                                       | 覆盖率治理 4、发布工程 5.5       |
| 代码质量   | 6.7/10 | 类型安全 8.5、命名可读性 8                         | 粒度 4、重复代码 4               |
| Web UI     | ~7/10  | UI 纪律 8、API 层设计 8、流式 7.5                  | 性能/RSC 3、i18n 4、API 层执行 4 |

> 各专项报告中列出的"实际读取文件清单"与逐条证据（文件:行号）保留在各自审计输出中；本文为交叉校验后的汇总。审计过程未修改任何代码。
