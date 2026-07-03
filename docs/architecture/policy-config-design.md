# PolicyConfig 表设计稿（L3 W1 策略数据化）

> **状态**: W1 开工设计稿（路线图 §五-2 已拍板方向：新表 + 版本号 + who/when/why 审计）
> **日期**: 2026-07-02
> **执行分支**: `feat/l3-w1-policy-config`
> **前置输入**: [l3-autonomy-roadmap.md](l3-autonomy-roadmap.md) W1 波次

## 一、目标与非目标

**目标**：把三类"策略"从代码常量抽成带版本号的 DB 配置，dual-read（DB 有值用 DB，否则代码常量兜底），为 W2 反馈管道 / W3 变体提议器提供可修改、可审计、可回滚的策略载体。

- **PROMPT**：大段 system prompt 模板（insight/writing/office/ask/teams 等 `*.prompt.ts`）
- **THRESHOLD**：评分阈值、重试、超时、并发等策略数值（`quality-thresholds.config.ts`、`mission.config.ts` 等）
- **TOPOLOGY**：团队拓扑（`TeamConfig`：成员角色、数量约束、workflow）

**非目标**（W1 不做）：

- 不做管理 UI（admin API 只留最小 CRUD，UI 是后续）
- 不做自动写入（W1 只有人写；系统自提变更是 W3 变体提议器的事）
- 不迁移全部 ~20 个模块（W1 分批：先基建 + 1-2 个样板模块，验证快照等同后再铺开）
- 不动 `AgentConfig` / `SystemSetting` 现有表（各管各的；PolicyConfig 不是它们的替代品）

## 二、为什么不复用现有机制（盘点结论）

| 现有机制                             | 缺什么                                  | 借鉴什么                                                      |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------- |
| `SystemSetting`（platform/settings） | KV 纯字符串、无版本、无审计链           | `getWithEnvFallback` 的 DB→兜底 dual-read 范式、启动全量缓存  |
| `AgentConfig`（agent_configs 表）    | 只覆盖 agent 元数据这一种形状、无版本   | "DB 存 systemPrompt" 先例、60s 内存缓存                       |
| `CapabilityFeatureFlagsService`      | 纯 bool、Redis/env 两层、无持久审计     | Redis 热切换分层兜底、fail-open 思路                          |
| `insight/prompts/prompt-version.ts`  | 手工 bump、只有 insight 用、版本不在 DB | 版本号语义 + `hashPrompt`（sha256 前 16 hex），迁移时对齐接管 |

## 三、数据模型

新 Prisma model 加在 `backend/prisma/schema/models.prisma`（与 SystemSetting/AgentConfig 同域），手写迁移 SQL。

```prisma
enum PolicyKind {
  PROMPT
  THRESHOLD
  TOPOLOGY
}

model PolicyConfig {
  id           String     @id @default(cuid())
  key          String     @db.VarChar(200)  // 命名空间点分：如 "insight.prompt.section-writing"
  version      Int                           // 每 key 单调递增，从 1 起
  kind         PolicyKind
  value        Json                          // PROMPT: {template}; THRESHOLD: 对象; TOPOLOGY: TeamConfig 形状
  contentHash  String     @db.VarChar(16)    // sha256 前 16 hex，对齐 prompt-version.ts 的 hashPrompt
  isActive     Boolean    @default(false)    // 每 key 至多一行 active（service 事务保证）
  createdBy    String     @db.VarChar(200)   // who: "human:<email>" | "system:<component>"
  changeReason String     @db.Text           // why: 必填，审计链是 L3 回滚的依据
  activatedAt  DateTime?                     // when(生效)
  createdAt    DateTime   @default(now())    // when(创建)

  @@unique([key, version])
  @@index([key, isActive])
  @@index([kind, isActive])
  @@map("policy_configs")
}
```

**核心不变式**：

1. **append-only**：行一旦创建不改 `value`（改 = 插入新 version）。回滚 = 把旧 version 复制为新 version 激活（审计线保持线性，谁在何时以何理由回滚可查）
2. **每 key 至多一行 `isActive=true`**：Prisma 无 partial unique，由 service 层事务保证（`updateMany` 取消旧 active + 激活新行在同一事务）
3. **`changeReason` 必填**：没有 why 的变更不允许落库

## 四、服务层与分层归属

**归属 L1 platform**：`backend/src/modules/platform/policy-config/`。判定依据与 credentials 迁 L1 同理——版本化配置读写是零 agent/mission 状态的通用基元（SystemSetting 同层先例）。ai-app / ai-harness 作为消费方向下依赖 L1，方向合法。

```
platform/policy-config/
├── policy-config.module.ts
├── policy-config.service.ts        # dual-read + 版本管理
├── abstractions/policy-config.types.ts
└── __tests__/policy-config.service.spec.ts
```

**对外 API（最小面）**：

```typescript
// 消费方唯一入口：dual-read。DB 无 active 行 / 模块未开 flag / DB 异常 → 一律回代码兜底
resolve<T>(key: string, codeFallback: T): Promise<PolicyResolution<T>>
// PolicyResolution = { value: T; source: "db" | "code"; version?: number; contentHash?: string }

// 写入端（W1 仅人用，admin API 后续再暴露）
propose(input: { key; kind; value; createdBy; changeReason }): Promise<PolicyConfig>  // 新 version，不激活
activate(key: string, version: number, by: string, reason: string): Promise<void>     // 事务切换 active
rollback(key: string, toVersion: number, by: string, reason: string): Promise<void>   // 复制旧值为新 version 并激活
history(key: string): Promise<PolicyConfig[]>
```

**零下降保障（三层）**：

1. **逐模块 flag**：env `POLICY_DB_MODULES`（逗号分隔模块前缀白名单，如 `"insight,writing"`；默认空 = 全部走代码兜底）。key 的第一段是模块名，不在白名单内 `resolve` 直接返回 code fallback，连 DB 都不查
2. **fail-open**：DB 查询异常 → warn 日志 + 回代码兜底（策略读取永不阻断业务路径）
3. **快照等同测试**：每个迁移的策略配一条 spec——DB 空时 `resolve(key, CODE_CONST).value` 与代码常量**逐字节相等**（`toBe`/`toEqual` 深比较）

**缓存**：60s in-memory TTL（照抄 `AgentConfigService` 范式），`activate/rollback` 后主动失效。W1 不上 Redis（单实例部署够用；多实例热切换是后续项）。

## 五、key 命名规范

```
<module>.<kind缩写>.<name>
insight.prompt.section-writing
writing.threshold.content-gate
teams.topology.debate-team
```

- 第一段 = 模块名（供逐模块 flag 匹配）
- 全小写 kebab-case，与目录命名规范一致
- 迁移 `prompt-version.ts` 时：其手工版本号（如 `SECTION_WRITING: "v3.1"`）作为 DB version=1 行的 `changeReason` 记载来源，此后版本由表接管

## 六、playground↔deep-insight 复制的真实形态（摸底修正）

摸底结论修正了路线图假设：**两模块不是字节级文件复制，而是同一个「多维度深度研究报告」产品的两代实现**——playground（新代：SKILL.md + mission-pipeline DAG）与 insight（老代：TS 模板字符串 + TeamConfig/WorkflowConfig），把同一套策略（8 类角色 prompt、Leader 领衔拓扑、评审/证据/超时阈值、模型分档自适应）用两套不兼容机制各编码了一遍。

**推论**：不能 diff 合并；「消灭复制」= 先定义 canonical 策略契约（放 `ai-app/contracts/`，仿 `report-template`/`agent-spec-catalog` 已有先例），让两边从同一份 DB 数据投影。其中：

- **可直接数据化（纯参数差异）**：证据下限（minFindings 5 / minSources 5-6）、passThreshold 0.7 / minReviewScore 7 / maxReworks 3、staleness/墙钟档位、evidence 乘数 1.8/0.4、freshness 1.5/1.0/0.5、目录展示元数据
- **数据化但需先统一 schema**：prompt 文案（SKILL.md ↔ \*.prompt.ts）、拓扑数据面（角色清单、min/max count、步骤依赖）、模型分档规则（regex + tier adaptation）
- **必须留代码**：DAG 执行语义（ctxReads/ctxWrites/dbWrites/resetFields——字段绑定代码符号）、Zod 输出 schema、loader/builder 机制、纯函数算法
- **真逻辑分叉不强行合并**：analyst 单角色 vs 3 专业角色、insight 独有的按主题/深度选队规则

## 七、W1 分批计划

| 批次         | 内容                                                                                                                                   | 验收                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **批 1** ✅  | 表 + 迁移 SQL + PolicyConfigService（dual-read/propose/activate/rollback）+ 单测                                                       | verify:arch 绿 + service spec 全绿 + 类型 0 error |
| **批 2a** ✅ | writing 质量门三组阈值接 dual-read（样板）                                                                                             | 快照等同 spec 绿，writing 590 测试全绿            |
| **批 2b** ✅ | insight 4 个核心 prompt 接 dual-read（借 prompt-version.ts 版本语义）                                                                  | 快照等同 spec 绿 + 13 套件 DI mock 修复           |
| **批 2c**    | **playground（用户真入口）策略阈值**：minFindingsThreshold / chapterToleranceRatio 接 dual-read                                        | 快照等同 spec + playground 套件全绿               |
| **批 3**     | canonical 策略契约（prompt/拓扑数据面）+ playground↔insight 收敛 + report-template 半抽取补全（playground 采用共享契约）+ 其余模块分批 | 同上，逐模块 flag 灰度                            |

**优先级修正（2026-07-02 用户纠偏）**：2026-06-12 IA 重构后左侧菜单「AI 洞察」已改指 agent-playground，`/ai-insights`（insight 模块）仅路由保活（书签/直链可达）。**用户真入口是 playground**——批 2 原以 insight 为主的排序是按迁移顺滑度而非产品权重排的，已纠正为 insight 收尾即转 playground。insight 改动保留的理由：保活路由仍可能有流量、marketplace deep-insight 是其克隆、其 prompt 版本机制是 W2 telemetry 样板。

**批 2c 接入形态（同步消费方约束）**：三个消费点中 s3 stage / per-dim-pipeline 在 async 流内可直接 await，但 `researcher.agent.ts` 的 `validateBusinessRules` 是框架 finalize 同步校验（无 ctx 参数、不能 await）。方案：**mission 启动时 resolve 一次 DB overlay 存模块级快照**（async + DI 可用处刷新），同步消费方读快照叠加在 `loadPlaygroundRuntimeConfig()` 之上；快照未刷新/DB 空 = 纯 env/profile 现状（零下降）。副产品：mission 内策略字节级一致（同 prompt cache prefix 冻结原则）。测试需暴露 reset 钩子防跨用例污染（借鉴 Claude Code 反向洞察 #8）。

**策略 vs 安全网的划分原则（批 2c 起生效）**：playground runtime 旋钮里只有**策略类**（minFindingsThreshold、chapterToleranceRatio——影响产出质量的业务决策）进 PolicyConfig；**安全网类**（staleThresholdMin / softWarn / wallTimeCap / noProgress\* / tokenCapUnits——liveness 看门狗与预算兜底）**永不数据化**，留 env + tuning profile。理由：W3 变体提议器将获得改 PolicyConfig 的权力，**系统不应能修改自己的保险丝**——爆炸半径控制（缺口 #6）的前置纪律。

## 八、批 3b canonical prompt 契约终稿（2026-07-02 设计 workflow 合成，评分 C 22.5 > A 21 > B 13）

**基底裁决**：方案 C 的机制 × 方案 A 的范围。

- **载体**：SKILL.md 原文作 canonical（`SkillDocPolicyValue = { schemaVersion: 1, markdown }`），解析复用 ai-engine 的 skill parser（新拆 `loadSkillFromString`，`loadSkill(file)` 委托之）——不发明第三种格式
- **投影保险丝**：DB 覆盖**只作用于 `skillSpec.systemPrompt`**；frontmatter 的 allowedTools/allowedModels/outputSchema 永远取代码，DB 文档 frontmatter 与代码副本不一致 → 整 key 拒绝回代码 + warn——堵死"一次 PROMPT activate 静默扩权工具面"
- **接入形态**：`applyMissionPolicyOverlay(cfg)` 纯函数 per-mission clone，快照全空返回原引用（toBe 级零下降）；绝不回写 registry/catalog/dag-view（反向洞察 #8）；刷新点与批 2c 的 strategy overlay 同点位（runMission 起点）
- **机制统一 ≠ 文本共 key**：insight 4 key 冻结（value 形状上提契约、禁止新增）；两代文本收敛走逐 key 人工 activate（changeReason + golden eval 把关），永远不是迁移的自动副作用
- **key**：`playground.prompt.skill.<roleId>` × 8（leader 缓接，见开放点）；deep-insight（playground 字节级克隆，7/8 identical + leader DIFFERS）跨模块读同组 key
- **surface 枚举**：`PLAYGROUND_POLICY_SURFACE` 带 `efficacy: "live" | "soul-inert"` 标注（实测仅 plan/assess/signoff 三个 primitive 消费 `skillSpec.systemPrompt`，其余角色运行时 prompt 主体在 `buildSystemPrompt()` 执行面）；W3 提议器 v1 只许写 live 条目

**迁移步骤**（每步带验证标准，详见 workflow 合成全文）：① 契约文件 + insight 类型上提 → ② SKILL.md 双副本 sha256 漂移守护 spec → ③ engine `loadSkillFromString` 拆分 → ④ playground prompt 快照 dual-read + `applyMissionPolicyOverlay`（核心）→ ⑤ surface 枚举 + efficacy 一致性 spec → ⑥ deep-insight 接同 key（leader 缓接）→ ⑦ backfill propose 不激活 + staging 人工灰度 → ⑧ W2 telemetry 溯源快照对接。

**不做清单**（带复活触发条件）：拓扑 TOPOLOGY key（W3 提拓扑变体/analyst 拍板/用户自定义团队时复活，数据面草案 = roles min-max + steps dependsOn）、两代文本收敛、`buildSystemPrompt` 动态正文模板化（若 W3 证实 soul 层杠杆不足 → 二期静态段抽取，**可能早到**）、B 的全套投机抽象（15 值 roleId union / 双轴寻址）、拓扑 v1 死旋钮、insight review-gate 阈值、deep-insight 独立 kill-switch、删 SKILL.md 副本、insight 三级链。

**已自驱拍板**（有异议请推翻）：灰度捆绑接受——deep-insight 跨模块读 `playground.*`，开 playground 白名单同时点亮 marketplace 面（同产品两货架，预期行为）；独立止血靠 rollback 该 key。

**残留风险如实声明**：8 key 中仅 live 路径角色的 soul 即时生效（efficacy 实测：仅 leader 经 plan/assess/signoff 三 primitive 消费 systemPrompt，其余 soul-inert = 编码统一 + 二期铺路）；模块级快照并发 mission last-write-wins（批 2c 同款已接受，per-mission clone 保 mission 内冻结）；DB 文本与代码内业务红线语义漂移无法机器校验——靠 changeReason + contentHash 溯源 + activate 前 golden eval 人工门。

**insight 维护模式立牌**：insight 是菜单已摘的老代实现（真入口 agent-playground）。其 4 个 `insight.prompt.*` key 冻结（禁止新增），value 形状已上提契约；如未来复活，一次性转换路径 = 把 `*.prompt.ts` 模板包成 SkillDoc（补 frontmatter）走 canonical key，转换脚本届时按 backfill 脚本范式写。

**拓扑数据面草案（留档，不实现）**：`TopologyPolicyValue = { schemaVersion: 1, roles: [{ roleId, minCount?, maxCount? }], steps: [{ id, dependsOn: string[] }] }`——只有依赖边与数量约束进 DB；ctxReads/ctxWrites/dbWrites/resetFields/rerunable 级联永远留代码。启动触发条件见 §八不做清单 #1。

**深度检视修复（2026-07-03，合并前检视实锤）**：① activate 并发双 active 行（P1）——DB partial unique index `policy_configs_one_active_per_key` 兜底 + service P2002 重试 + getActiveRow orderBy 确定性；② writing/simulation 结构化 value 无防坏行——通用 `conformsToShape` 守卫（DB 值须形状兼容代码兜底，缺字段/类型漂移回代码）；③ prompt 尺寸上限——schema max 200K 字符 + propose 1MB JSON 硬顶。**接受不修（留痕）**：strategy overlay 并发 mission last-write-wins（批 2c 已拍板接受；prompt overlay 有 per-mission 冻结是因 config 副本机制顺路，strategy 消费点是无 ctx 的同步校验，per-mission 化需框架改造，W3 提拓扑/阈值变体时再评估）；propose 无调用方-模块绑定 enforcement——**W3 开工前置任务**：服务端按 PLAYGROUND_POLICY_SURFACE 白名单校验 system:\* 调用方的 key 写入面（W1 只有人写，人工审阅即门）。

**落地状态（2026-07-02 批 3b 完成）**：步骤 1-7 已提交（`37dee663c` + backfill 脚本 `bd9352e2f`）；步骤 7 的 staging 灰度是部署后人工闸；步骤 8（评分落库附 PromptResolution 溯源）留 W2 开工首项，挂点 `getPlaygroundPromptResolution(roleId)` 已就绪。

## 九、待用户拍板的开放点

1. ~~**TOPOLOGY 的 value 形状**~~ ✅ 已定：只存数据面，且整体推迟（§八不做清单 #1，草案留档）
2. **Redis 热切换**：多实例部署时 60s TTL 是否够，还是照抄 CapabilityFeatureFlags 加 Redis 层？——W2 影子模式前定
3. ~~**analyst 角色分叉**~~ ✅ 已定：不强行合并（§八机制统一不共文本）
4. **leader SKILL.md 双副本已漂移**（playground 版 vs marketplace deep-insight 版内容不同）：以哪版为准、还是有意分叉各自保留？拍板前 leader 不接共享 key（漂移守护 spec 对 leader 用 it.skip 留闸 + deep-insight 缓接）
