# 算力基础设施 KOL 追踪方案

> 目标：把 `d:\research\Insight\01 KOL 数据源\KOL List.xlsx`（209 条）落地为 AI Radar 可持续运行的追踪体系。
> 约束：**绝大部分信息通过非 AI 手段获取，AI 只做必要分析**。
> 首期范围：S 级（58 条 / 54 名唯一人物）。
>
> 创建：2026-07-29 · 状态：待评审

---

## 1. 目标与验收标准

| #   | 目标                           | 可验证标准                                                       |
| --- | ------------------------------ | ---------------------------------------------------------------- |
| G1  | S 级人物的公开发声可被自动采集 | 单次 refresh run 中 `sourcesFailed / sourcesAttempted` < 20%     |
| G2  | 采集环节零 AI                  | S1-S3 全链路无 `AiChatService` 调用（现状已满足，见 §3）         |
| G3  | AI 成本可控                    | 单 run token 消耗 < 50,000（平台强制额度上限），见 §5.4          |
| G4  | 每日精选非空且信噪比可接受     | 连续 7 天 daily briefing 均产出 ≥ 3 条信号，人工抽检相关度 ≥ 80% |
| G5  | 无稳定 feed 的人物仍可被感知   | S6 实体抽取能从他源内容中捞出 §6.3 名单中的人名提及              |

G4/G5 是本方案的真正验收点。G1-G3 只是前置条件。

---

## 2. 清单画像（实测，非估算）

209 条，9 个层级。按「主要发声渠道」字段做可追踪性分档：

| 分档          | 条数 | 占比 | 含义                                  |
| ------------- | ---- | ---- | ------------------------------------- |
| A 可自动订阅  | 137  | 66%  | 有稳定 feed，纯非 AI 手段可持续采集   |
| B 需定制抓取  | 40   | 19%  | 财报/法说会 23、官方博客与技术报告 35 |
| C 无稳定 feed | 32   | 15%  | 只出现在峰会、访谈、著作、听证会      |

A 档渠道分布（可重复计）：X 70、论文 60、Newsletter/博客 46、播客 45、YouTube 5、GitHub 3。

分评级：S 级 58 条中 42 条属 A 档；A 级 109 条中 75 条属 A 档；B 级 42 条中仅 20 条属 A 档。
**最该盯的人恰好最好盯**，因此按评级分期铺开是合理的。

S 级 58 条去重后为 **54 名唯一人物**（Ilya Sutskever、Yann LeCun、Fei-Fei Li、Andrej Karpathy 跨层重复计入）。

---

## 3. 现有系统能力核查

实际读过的文件（未读的不评价）：

- `backend/src/modules/ai-app/radar/runtime/radar.config.ts`
- `backend/src/modules/ai-app/radar/runtime/radar.constants.ts`
- `backend/src/modules/ai-app/radar/mission/services/collectors/collector-router.service.ts`
- `backend/src/modules/ai-app/radar/mission/services/collectors/rss-collector.service.ts`
- `backend/src/modules/ai-app/radar/mission/services/collectors/x-collector.service.ts`
- `backend/src/modules/ai-app/radar/mission/services/collectors/ssrf-util.ts`
- `backend/src/modules/ai-app/radar/mission/pipeline/stages/s2-collect.stage.ts`
- `backend/src/modules/ai-app/radar/mission/pipeline/stages/s4-relevance.stage.ts`
- `backend/src/modules/ai-app/radar/mission/pipeline/stages/scoring.ts`
- `backend/src/modules/ai-app/radar/api/dto/create-radar-source.dto.ts`
- `backend/src/modules/ai-app/radar/api/controller/radar-source.controller.ts`（仅路由签名）
- `backend/prisma/schema/models.prisma`（RadarTopic / RadarSource / RadarItem / RadarInsight / RadarRun）

### 3.1 结论：能跟，但不是开箱即用

`ai-app/radar/` 就是为持续追踪写的模块，能力对齐如下：

| 需求       | 现有能力                                        | 位置                                              |
| ---------- | ----------------------------------------------- | ------------------------------------------------- |
| 定时采集   | `RadarTopic.refreshCron`，默认 `0 */6 * * *`    | `models.prisma`                                   |
| 多源类型   | `RSS / YOUTUBE / CUSTOM`（X 写侧已禁，见 §4.1） | `RadarSourceType`                                 |
| 信源权威度 | `authorityWeight` 1-5 星，参与打分              | `RadarSource`                                     |
| 源健康度   | 连续失败 5 次进 24h cooldown                    | `RADAR_SCHEDULER_DEFAULTS`                        |
| 去重       | `externalId` + `contentHash` 双重               | `s3-dedupe`                                       |
| 额度硬闸   | 单 run 50 credits = 50,000 tokens               | `resolveRadarMaxCredits()` + `ResolvedBudgetCaps` |
| 每日精选   | Stage A 确定性打分 + Stage B 成稿               | `scoring.ts` / `s9`                               |
| 推送       | `pushConfig` / `briefingTime` / `weekendSkip`   | `RadarTopic`                                      |

### 3.2 采集层本来就零 AI

这一点与「少用 AI」的诉求天然吻合，无需改造：

- RSS → `rss-parser` 直接解析（`rss-collector.service.ts`）
- YouTube → channel feed
- CUSTOM → 选择器抓取（`config.listSelector` 等）

AI 只出现在采集**之后**：S4 相关性、S5 质量+中文摘要、S6 实体抽取、S7 洞察、S9 Stage B 成稿、以及独立的 source-curator 推荐流水线。

---

## 4. 三个必须先解决的缺口

### 4.1 X 通道：写侧已被禁用，必须绕行

`CreatableRadarSourceTypeDto` 只允许 `YOUTUBE / RSS / CUSTOM`，**X 被显式排除**，DTO 校验层直接拦截创建。
注释记录的原因（2026-05-17）：「Nitter 全死 + 业界已淡化 X 集成，避免新增 dead source 噪音」。

同时 `x-collector.service.ts` 的头注释描述了「API 优先 + 抓取兜底」策略，但**实现中只有 Nitter 分支**，
`fetch()` 直接进 `NITTER_INSTANCES` 三实例循环，没有 X API v2 代码路径。注释与实现不符。

X 是清单第一大渠道（70 人，S 级中 17 人）。**解决方案：自建 RSSHub，以 `RSS` 类型接入。**

优势是绕开 X 类型禁令，且**零后端代码改动**——`RadarSource.identifier` 存 RSSHub URL 即可，
`RssCollector` 照常工作。

**硬约束：RSSHub 必须挂公网域名。**
`ssrf-util.ts` 的 `PRIVATE_HOST_REGEX` 拒绝 `localhost / 127. / 10. / 172.16-31. / 192.168. / 169.254. / ::1 / fe80:`，
且 `RssCollector.fetch()` 每次采集都会重新校验（不只入库时校验一次）。
部署在内网或 localhost 的 RSSHub 会被 100% 拦截。建议随项目现有 Railway 部署，分配独立子域。

**待验证（不可假设）**：RSSHub 的 X 路由近年需要认证 cookie 才能稳定出数，
部署后必须实测连续 7 天成功率，不能假定可用。这是本方案最大的单点风险。

### 4.2 全 RSS 化会让 engagement 分量恒为 0

`RssCollector` 构造 `RawCollectedItem` 时**硬编码 `metrics: null`**（`rss-collector.service.ts:100`）。
`computeEngagement()` 对 null 直接返回 0。

由于本方案把 X 也转成 RSS 接入，**所有源都走 RSS**，意味着 `STAGE_A_WEIGHTS.engagement`（0.10）
成为恒零的死权重。必须在权重重算时剔除（见 §5.2）。

### 4.3 纯确定性模式有两个阻断点

若把 AI 全部关掉，会有两处独立失效，且**第二处比第一处触发更早**：

**阻断点一 —— 每日精选恒空。**
`STAGE_A_WEIGHTS` 中 relevance 0.35 + quality 0.25 共 60% 权重来自 LLM，不跑则记 0。
剩余 authority 0.15 + freshness 0.15 + engagement 0.10 满分仅 0.40，
而 `STAGE_A_SCORE_THRESHOLD = 0.55`，`selectCandidatePool` 用严格大于过滤 → 候选池永远为空。
考虑 §4.2 后上限进一步降到 0.30。

**阻断点二 —— 看板恒空。**
`RADAR_PIPELINE_DEFAULTS` 定义 `acceptedRelevanceMin: 60` / `acceptedQualityMin: 50`，
`RadarItem.accepted` 的 schema 注释为「relevanceScore >= 60 && qualityScore >= 50」。
砍掉 S4 会让 `relevanceScore` 恒为 null，item 永远 `accepted = false`，根本进不了看板，
更谈不上进每日精选。

**结论：不能靠「关掉 stage」来省 AI。** 正确做法见 §5.1。

> 实施前需确认一项：`s8-persist.stage.ts` 中 `accepted` 的实际判定逻辑（本次未读该文件），
> 上述结论基于 constants 定义与 schema 注释推导。

---

## 5. AI 用量控制方案

### 5.1 方案 A（推荐，零代码改动）：用 literal 模式节流 S4

`RadarTopic.matchMode` 设为 `"literal"`。`s4-relevance.stage.ts:90-101` 的行为是：

- 未命中关键词的条目 → 直接判 0 分，**跳过 LLM 调用**，理由写入哨兵值 `未命中关键词（精确匹配）`
- 命中的条目 → 正常送 LLM 评分

这是模块内建的省 token 闸，且**不破坏 accepted 链路**（未命中项被判 0 分正是设计意图上的淘汰，
命中项仍有完整的 relevanceScore）。

保守估算：S 级 54 源 × 日均新增约 3 条 ≈ 160 条/天。若关键词命中率 40%，
则约 64 条进入 S4/S5/S6。按 batch size 10/10/8 计，约 20 次 LLM 调用/天，
远低于单 run 50,000 tokens 的额度上限（详见 §5.4）。

**注意**：`isLiteralHit` 在关键词列表为空时返回 `true`（不淘汰任何条目，交回 LLM 判断）。
因此 literal 模式**必须**配好关键词，否则退化成 semantic，节流失效。

### 5.2 方案 B（可选，需 ADR）：重算 Stage A 权重

若方案 A 实测仍嫌 AI 占比高，可进一步弱化 relevance、剔除死权重 engagement。

`scoring.ts:7` 明确要求：**改权重必须写 ADR + reviewer 共识（决策 H6）**。此项不得跳过流程直接改。

建议新权重（待 ADR 论证）：

| 分量       | 现值 | 建议值 | 理由                                              |
| ---------- | ---- | ------ | ------------------------------------------------- |
| relevance  | 0.35 | 0.10   | 源已是人工精选的 KOL，相关性在选源时已保证        |
| quality    | 0.25 | 0.40   | S5 顺带产出，边际成本为零，是最值得倚重的 AI 信号 |
| authority  | 0.15 | 0.30   | 直接复用清单已有的 S/A/B 人工评级                 |
| freshness  | 0.15 | 0.20   | 日报场景时效性权重应提高                          |
| engagement | 0.10 | 0.00   | 全 RSS 架构下恒为 0（§4.2），保留即稀释其他分量   |

阈值同步下调至 0.50。校验两个样例：

- S 级源 + 12h 内 + quality 60 → `0.10*r + 0.40*0.6 + 0.30*1.0 + 0.20*0.71` = 0.24+0.30+0.142 = 0.68+ → 入选
- B 级源 + 48h + quality 50 → `0.40*0.5 + 0.30*0.6 + 0.20*0.25` = 0.20+0.18+0.05 = 0.43 → 落选

行为符合预期：权威信源的新鲜内容优先，低权威的陈旧内容被过滤。

### 5.3 必须保留 AI 的三处

| 环节            | 为何非 AI 做不了                               |
| --------------- | ---------------------------------------------- |
| S5 中文摘要     | 清单中绝大多数为英文源，翻译+提炼是刚需        |
| S6 实体抽取     | 这是捕获 §6.3「无稳定 feed」人物的**唯一手段** |
| S9 Stage B 成稿 | Top-N 信号的串联与编辑                         |

S7 洞察（跨周期对比）可视首期效果决定是否保留。

### 5.4 成本模型（2026-07-29 查证订正）

> **本节推翻本文档早期版本的说法。** 早期版本称「单 run 成本硬闸 0.5 USD」并据此推出
> 「9 topic 日上限 18 USD」，两处均错误。

**`RADAR_PIPELINE_DEFAULTS.budgetUsdCap = 0.5` 是死常量** —— 全库检索仅出现在
`radar.constants.ts:69` 的定义处，**零消费方**，不构成任何约束。

真实的额度机制是按 token 计：

```
resolveRadarMaxCredits()           = 50 credits   （主刷新 mission）
resolveRadarDiscoveryMaxCredits()  = 10 credits   （AI 推荐源 mission）
CREDITS_TO_TOKENS                  = 1000
→ 单次刷新硬上限 = 50,000 tokens
```

`ResolvedBudgetCaps` 中的 `creditBudgetProxyUsd`（= credits × 0.002）代码注释明确标注为
**「额度代理值，非真实成本」**，真实成本走 `ModelPricingRegistry`。因此 0.5 USD 这个数字
从来不是成本闸，只是额度的粗略折算，且隐含 $2/1M token 的假设单价。

**单价按档位**（`TIER_DEFAULT_PRICING`，USD / 1M tokens）：

| 档位     | 输入 | 输出 |
| -------- | ---- | ---- |
| basic    | 0.5  | 1.5  |
| standard | 3    | 12   |
| strong   | 15   | 60   |

具体落哪档由 admin 在 `/admin/ai/models` 配置，DB 驱动，代码中不可静态确定。

**各阶段的模型档次（硬编码）**：

| 阶段         | modelType   | outputLength | 频次         |
| ------------ | ----------- | ------------ | ------------ |
| S4 相关性    | `CHAT_FAST` | minimal      | 每 10 条一批 |
| S5 质量+摘要 | `CHAT_FAST` | short        | 每 10 条一批 |
| S6 实体抽取  | `CHAT_FAST` | short        | 每 8 条一批  |
| S7 洞察      | `CHAT`      | medium       | 每 run 1 次  |
| S9 日报成稿  | `CHAT`      | long         | 每天 1 次    |

成本大头是 S7/S9（走 `CHAT`，通常 standard 档），而非逐条评分（走 `CHAT_FAST`，通常 basic 档）。

**估算**（27 源单 topic，日均新增约 40 条，literal 命中率 40%）：

| 场景         | 每天 token | 每月 USD |
| ------------ | ---------- | -------- |
| P1 单 topic  | ~28k       | 0.6 – 4  |
| 9 topic 全铺 | ~250k      | 5 – 37   |
| 打满额度上限 | 1.8M       | 38 – 260 |

区间下界 = 全部落 basic 档，上界 = 全部落 standard 档。实际大概率靠近下界。

**压成本杠杆**（按性价比排序）：

1. **按层调 cron** —— 最有效。慢变量层（能源政策、arXiv 论文）改 `0 0 * * *` 每天一次，直接砍 3/4
2. **`matchMode = literal`** —— 减少 S4/S5/S6 的批次数
3. **调小 `signalsTarget`** —— S9 是 long 输出且走 standard 档，单价最高

**两个风险**：

- 额度闸管的是 token 不是钱。同样打满 50k tokens，basic 档几分钱、standard 档两毛多，
  **实际花费相差约 7 倍**，而额度闸对此毫无感知。若 admin 把 `CHAT_FAST` 配到 standard 档模型，
  成本会静默上涨。
- **界面不展示成本**。后端 `GET /radar/runs/:runId/view` 已返回 `cost.costUsd` / `cost.tokensUsed` /
  `metricsSummary.llmCost`，前端 `RadarRunDetailView` 类型也已声明，但**无任何组件渲染这些字段**
  （检索 `costUsd|llmCost|tokensUsed` 在 `app/ai-radar` 与 `components/ai-radar` 下零命中）。
  数据已就绪，只差一个展示组件——这是低成本高价值的改进项。

---

## 6. 追踪架构

### 6.1 Topic 拆分：按 9 个层级建 9 个 RadarTopic

不建单个巨型 topic，理由有三：

1. **并发压力**：`CollectorRouter.fanOut` 是 `sources.map` + `Promise.all`，**没有并发上限**
   （`perSourceItemLimit` 限制的是每源条数，不是并发数）。209 源塞进单 topic 会全量并发打出去。
2. **关键词不同**：literal 模式依赖精准关键词，能源层与模型层的关键词集合无交集。
3. **日报可分层分发**：`signalsTarget` / `briefingTime` 按层独立配置。

首期只建 S 级涉及的层级 topic，源按 §6.2 归位。

注意 `RadarSource` 唯一键为 `[topicId, type, identifier]`：同一个人若要在多层追踪，
需在各 topic 下重复建源，item 也会重复采集。跨层重复的 4 人（Ilya / LeCun / 李飞飞 / Karpathy）
建议只归入其主层级。

### 6.2 源类型映射（全部非 AI 采集）

| 清单渠道        | RadarSourceType   | 做法                                     | S 级涉及 |
| --------------- | ----------------- | ---------------------------------------- | -------- |
| X               | `RSS`             | 自建 RSSHub 的 X 路由 URL                | 17       |
| 论文            | `RSS`             | arXiv 官方 Atom API 按作者查询           | 13       |
| 财报/法说会     | `CUSTOM`          | SEC EDGAR 官方 Atom（免费）+ IR 页选择器 | 7        |
| 官方站/技术报告 | `RSS` 或 `CUSTOM` | 实验室与公司博客原生 feed                | 5        |
| Newsletter/博客 | `RSS`             | Substack `/feed`、独立博客原生 feed      | 5        |
| 无稳定 feed     | 不建源            | 靠 S6 实体抽取捞提及（§6.3）             | 7        |

`authorityWeight` 直接映射清单评级：**S → 5、A → 4、B → 3**。
这把你已经做过的人工判断变成确定性排序信号，是「少用 AI」的核心杠杆。

两个必须注意的采集局限：

- **arXiv 按作者查询存在重名歧义**，同名作者需人工确认过滤条件，不能批量生成后直接入库。
- **播客 RSS 是节目级而非人物级**。清单里 45 人标注了播客渠道，但订阅只能订到节目；
  「某人上了别人的播客」这类事件订阅不到，只能靠 S6 实体抽取捕获。

### 6.3 无稳定 feed 的 S 级人物（7 名）：不建源，靠实体提及

Kevin Scott、Andy Bechtolsheim、Dario Amodei、Ilya Sutskever、Geoffrey Hinton、
Michael Truell、王坚。

这些人本身就「极少公开发声」或只在访谈/峰会露面。给他们建源只会得到持续空采集
和 source health 告警。正确做法是把他们作为**实体关键词**，靠 S6 从其他源的内容里
抽取提及——分析师、技术媒体、播客本来就在密集讨论他们。

这也解释了为何 S6 实体抽取不能砍。

### 6.4 全量 209 人的分期建议（首期之后）

| 期   | 范围                        | 新增源                         |
| ---- | --------------------------- | ------------------------------ |
| 一期 | S 级 A 档                   | 约 47（54 名去掉 7 名无 feed） |
| 二期 | A 级 A 档                   | 约 75                          |
| 三期 | B 档定制抓取（财报/官方站） | 约 40                          |
| 不铺 | C 档无 feed 人物            | 0，全部转实体关键词            |

---

## 7. S 级 54 人映射底表

`identifier` 列留空，由实施阶段（身份解析）填充。**不得靠推测填写 handle 或 URL。**

| #   | 层级       | 姓名                | 机构与职位                                   | 清单渠道                   | 建议源类型                 | identifier |
| --- | ---------- | ------------------- | -------------------------------------------- | -------------------------- | -------------------------- | ---------- |
| 1   | 1 能源     | Fatih Birol         | IEA 执行主任                                 | IEA 报告、达沃斯、财经媒体 | RSS/CUSTOM 官方站          |            |
| 2   | 1 能源     | Jesse Jenkins       | 普林斯顿教授，ZERO Lab                       | 论文、X 长帖、播客         | RSS via RSSHub             |            |
| 3   | 1 能源     | Brian Janous        | Cloverleaf 联创，前微软能源总经理            | X、播客、峰会              | RSS via RSSHub             |            |
| 4   | 1 能源     | Chris Wright        | 美国能源部长                                 | 官方声明、听证会           | RSS/CUSTOM 官方站          |            |
| 5   | 2 芯片     | Jensen Huang 黄仁勋 | NVIDIA 创始人兼 CEO                          | GTC、财报会、访谈          | CUSTOM IR/EDGAR            |            |
| 6   | 2 芯片     | Lisa Su 苏姿丰      | AMD 董事长兼 CEO                             | Advancing AI、财报会       | CUSTOM IR/EDGAR            |            |
| 7   | 2 芯片     | 魏哲家 C.C. Wei     | 台积电董事长兼 CEO                           | 法说会                     | CUSTOM IR/EDGAR            |            |
| 8   | 2 芯片     | Christophe Fouquet  | ASML 总裁兼 CEO                              | 财报会、投资者日           | CUSTOM IR/EDGAR            |            |
| 9   | 2 芯片     | Hock Tan 陈福阳     | Broadcom 总裁兼 CEO                          | 财报电话会                 | CUSTOM IR/EDGAR            |            |
| 10  | 2 芯片     | Bill Dally          | NVIDIA 首席科学家                            | Hot Chips、论文、演讲      | RSS arXiv                  |            |
| 11  | 2 芯片     | Jim Keller          | Tenstorrent CEO                              | X、播客、峰会              | RSS via RSSHub             |            |
| 12  | 2 芯片     | Norm Jouppi         | Google TPU 首席架构师                        | ISCA 论文、Hot Chips       | RSS arXiv                  |            |
| 13  | 2 芯片     | Amin Vahdat         | Google Cloud 基础设施 VP/Fellow              | I/O、Next、论文            | RSS arXiv                  |            |
| 14  | 2 芯片     | David Patterson     | UC Berkeley 荣休教授 / Google                | 论文、主题演讲             | RSS arXiv                  |            |
| 15  | 3 基础设施 | Michael Intrator    | CoreWeave 联创兼 CEO                         | 财报会、访谈               | CUSTOM IR/EDGAR            |            |
| 16  | 3 基础设施 | Kevin Scott         | 微软 CTO 兼 AI EVP                           | 主题演讲、播客、著作       | 无 feed，转实体            |            |
| 17  | 3 基础设施 | Andy Bechtolsheim   | Arista 创始人兼首席架构师                    | Hot Interconnects、OFC     | 无 feed，转实体            |            |
| 18  | 3 基础设施 | Ion Stoica          | UC Berkeley 教授，Ray/vLLM 奠基              | 论文、Sky Lab、峰会        | RSS arXiv                  |            |
| 19  | 3 基础设施 | Woosuk Kwon         | vLLM 创始作者                                | 论文、GitHub、Meetup       | RSS arXiv + GitHub atom    |            |
| 20  | 3 基础设施 | Tri Dao             | 普林斯顿助理教授，Together 首席科学家        | 论文、X、演讲              | RSS via RSSHub + arXiv     |            |
| 21  | 4 模型     | Sam Altman          | OpenAI 联创兼 CEO                            | 博客、X、访谈              | RSS via RSSHub + 博客 feed |            |
| 22  | 4 模型     | Jakub Pachocki      | OpenAI 首席科学家                            | 论文、有限访谈             | RSS arXiv                  |            |
| 23  | 4 模型     | Noam Brown          | OpenAI 研究员                                | 论文、X、演讲              | RSS via RSSHub             |            |
| 24  | 4 模型     | Dario Amodei        | Anthropic 联创兼 CEO                         | 长文、播客、访谈           | 无 feed，转实体            |            |
| 25  | 4 模型     | Jared Kaplan        | Anthropic CSO，JHU 教授                      | 论文、播客                 | RSS arXiv                  |            |
| 26  | 4 模型     | Demis Hassabis      | Google DeepMind 联创兼 CEO                   | 主题演讲、播客、论文       | RSS arXiv                  |            |
| 27  | 4 模型     | Jeff Dean           | Google 首席科学家                            | 论文、X、演讲              | RSS via RSSHub             |            |
| 28  | 4 模型     | Noam Shazeer        | Google 杰出工程师，Gemini 联合技术负责人     | 论文                       | RSS arXiv                  |            |
| 29  | 4 模型     | Ilya Sutskever      | SSI 联创兼 CEO                               | 少量演讲/访谈              | 无 feed，转实体            |            |
| 30  | 4 模型     | Yann LeCun          | 图灵奖得主，NYU 教授                         | X、论文、演讲              | RSS via RSSHub             |            |
| 31  | 4 模型     | Andrej Karpathy     | Eureka Labs 创始人                           | YouTube、X、博客           | YOUTUBE + RSS via RSSHub   |            |
| 32  | 4 模型     | Fei-Fei Li 李飞飞   | 斯坦福教授，World Labs 联创兼 CEO            | 著作、演讲、X              | RSS via RSSHub             |            |
| 33  | 4 模型     | Yoshua Bengio       | 蒙特利尔大学教授，Mila 创始人                | 论文、报告、听证           | RSS arXiv                  |            |
| 34  | 4 模型     | Geoffrey Hinton     | 多伦多大学名誉教授                           | 访谈、演讲                 | 无 feed，转实体            |            |
| 35  | 4 模型     | Richard Sutton      | 阿尔伯塔大学教授                             | 著作、论文、访谈           | RSS arXiv                  |            |
| 36  | 5 应用     | Andrew Ng 吴恩达    | DeepLearning.AI 创始人                       | 课程、X/LinkedIn、演讲     | RSS via RSSHub             |            |
| 37  | 5 应用     | Michael Truell      | Anysphere（Cursor）联创兼 CEO                | 访谈、播客                 | 无 feed，转实体            |            |
| 38  | 5 应用     | Bret Taylor         | Sierra 联创兼 CEO，OpenAI 董事长             | 访谈、专栏                 | RSS 原生 feed              |            |
| 39  | 6 分析师   | Dylan Patel         | SemiAnalysis 创始人兼首席分析师              | SemiAnalysis、X、播客      | RSS 原生 feed + RSSHub     |            |
| 40  | 6 分析师   | Ben Thompson        | Stratechery 创始人                           | Stratechery、播客          | RSS 原生 feed              |            |
| 41  | 6 分析师   | Gavin Baker         | Atreides Management 管理合伙人兼 CIO         | X、播客                    | RSS via RSSHub             |            |
| 42  | 6 分析师   | Chris Miller        | 塔夫茨副教授，《芯片战争》作者               | 著作、专栏、演讲           | RSS 原生 feed              |            |
| 43  | 6 分析师   | Lennart Heim        | RAND 研究员                                  | 报告、论文、X              | RSS via RSSHub + arXiv     |            |
| 44  | 7 中国     | 梁文锋              | DeepSeek 创始人                              | 技术报告、极少访谈         | RSS/CUSTOM 官方站          |            |
| 45  | 7 中国     | 王坚                | 中国工程院院士，阿里云创始人                 | 演讲、著作                 | 无 feed，转实体            |            |
| 46  | 7 中国     | 周靖人              | 阿里云 CTO，通义负责人                       | 峰会、技术报告             | RSS/CUSTOM 官方站          |            |
| 47  | 7 中国     | 徐直军              | 华为轮值董事长                               | HC 大会、财报发布          | CUSTOM IR                  |            |
| 48  | 7 中国     | 贾扬清              | Lepton AI 创始人，Caffe 作者                 | X、知乎、演讲              | RSS via RSSHub             |            |
| 49  | 7 中国     | 东数西算主管部门    | 国家发改委/工信部等                          | 官方政策文件               | RSS/CUSTOM 官方站          |            |
| 50  | 8 新兴     | Chris Lattner       | Modular 联创兼 CEO                           | 博客、播客、X、演讲        | RSS 原生 feed + RSSHub     |            |
| 51  | 9 新实验室 | Mira Murati         | Thinking Machines Lab 创始人兼 CEO           | 有限访谈、实验室博客       | RSS 原生 feed              |            |
| 52  | 9 新实验室 | John Schulman       | Thinking Machines Lab 联创兼首席科学家       | 论文、博客、播客           | RSS 原生 feed + arXiv      |            |
| 53  | 9 新实验室 | Elon Musk 马斯克    | xAI 创始人                                   | X、发布会、访谈            | RSS via RSSHub             |            |
| 54  | 9 新实验室 | Sergey Levine       | Physical Intelligence 联创，UC Berkeley 教授 | 论文、演讲、播客           | RSS arXiv                  |            |

源类型汇总：RSSHub/X 17 · arXiv 13 · IR/EDGAR 7 · 无 feed 7 · 官方站 5 · 原生 feed 5。

---

## 8. 分阶段实施计划

每步附可验证标准，未通过不进入下一步。

### P0 — RSSHub 部署与实测（阻塞项）

1. 部署 RSSHub 到公网域名（随现有 Railway 部署，分配独立子域）
   → verify: 从后端所在网络 `curl` 该域名返回 200，且 `assertSafeHttpUrl` 不拒绝该 hostname
2. 挑 3 个 S 级 X 账号做连续 7 天可用性实测
   → verify: 7 天成功率 ≥ 90%，且出数条目的 `pubDate` 可被 `rss-parser` 正确解析
3. 若成功率不达标 → 触发预案（§9 风险一）

**P0 不通过则整个 X 通道方案作废**，须回到 X API 付费方案重新评估。不要在 P0 未验证前批量建源。

### P1 — 最小链路验证（不依赖 P0）

1. 建 1 个 topic，接入 5 个确定可用的原生 RSS 源（SemiAnalysis、Stratechery、Interconnects 等）
2. `matchMode = "literal"`，配置该层关键词；`authorityWeight` 按 S/A/B 映射
3. 手动触发 refresh
   → verify: `sourcesFailed = 0`；`itemsFetched > 0`；至少 1 条 `accepted = true`
4. 观察连续 3 天日报
   → verify: 每日 briefing 非空；单 run 未触发额度上限（50,000 tokens）

P1 的目的是在投入身份解析人力**之前**，先证明整条链路真的产出有价值的日报。

### P2 — 身份解析（人力密集，一次性）

1. 为 47 名有 feed 的 S 级人物逐个解析 `(type, identifier, authorityWeight)` 三元组
   → verify: 每条 identifier 经人工访问确认返回有效 feed，**不接受推测填写**
2. arXiv 作者源单独处理重名歧义
   → verify: 抽样 5 个作者源，确认返回论文的作者确为目标人物
3. 产出可导入的源清单表

注意：`radar-source.controller.ts` 只有单条 `POST topics/:topicId/sources`，**无批量导入接口**。
47 条需逐条 POST 或另写一次性 seed 脚本。若走脚本，须遵守项目脚本规范并在完成后归档。

### P3 — 分层建源与调优

1. 按 §6.1 建层级 topic，导入 P2 产出
2. 配置 §6.3 的 7 名无 feed 人物为实体关键词
3. 连续观察 7 天
   → verify: 达成 §1 的 G1 / G3 / G4 / G5

### P4 — 视效果决定是否走方案 B

仅当 P3 实测显示 AI 占比仍过高时启动。**须先写 ADR**（`scoring.ts:7` 强制要求）。

---

## 9. 风险与未决项

| #   | 风险                                  | 影响                                       | 预案                                                                                          |
| --- | ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1   | RSSHub 的 X 路由不稳定或需认证 cookie | 17 个 S 级源失效，日报时效性大幅打折       | 回退到 X API 付费 BYOK，但需先补齐 `x-collector` 缺失的 API 分支代码；或放弃 X 通道           |
| 2   | arXiv 作者重名                        | 采到无关论文，污染日报                     | P2 逐条人工确认；必要时改用机构+关键词组合过滤                                                |
| 3   | 播客只能订到节目级                    | 「某人上了别人播客」订阅不到               | 依赖 S6 实体抽取兜底，接受漏采                                                                |
| 4   | `fanOut` 无并发上限                   | 单 topic 源数增长后可能打爆出站连接        | 按层拆 topic 控制单 topic 源数；若二期后仍不足，需在 `CollectorRouter` 加并发闸（需单独评估） |
| 5   | literal 关键词配置不当                | `isLiteralHit` 空关键词返回 true，节流失效 | 建 topic 时强制校验关键词非空                                                                 |

**未决项（实施前需确认）**：

- `s8-persist.stage.ts` 中 `accepted` 的实际判定逻辑（本次未读，§4.3 结论为推导）
- CUSTOM 类型的选择器抓取对 IR 页面的实际适配能力（本次未读 `custom-collector.service.ts`）
- 二期铺开后 `perUserConcurrencyLimit: 3` / `globalConcurrencyLimit: 20` 是否够用

---

## 10. 一句话总结

采集端本来就零 AI，无需改造；真正的工作量在**一次性身份解析**（把 209 个人名变成可寻址 feed）
和 **RSSHub 的 X 通道验证**。AI 用量靠 `matchMode = literal` + `authorityWeight` 两个现成配置即可压到最低，
不需要也不应该关停任何 stage。
