# 算力 KOL 源清单（实测验证版）

> 配套文档：[compute-kol-tracking-plan-2026-07-29.md](./compute-kol-tracking-plan-2026-07-29.md)
> 验证方式：逐条 HTTP 请求，记录状态码与条目数。**未通过实测的一律不写入 identifier。**
> 验证时间：2026-07-29

---

## 1. 已验证可用（可直接入库）

全部经 `curl -L` 实测，返回 200 且解析出 `<item>` / `<entry>` 条目。
`AW` = 建议 `authorityWeight`（S→5、A→4、B→3）。

### 1.1 个人级 feed —— 精准对应清单人物

| 对应人物        | 清单 # | type    | identifier                                                                     | 实测条目 | AW  |
| --------------- | ------ | ------- | ------------------------------------------------------------------------------ | -------- | --- |
| Ben Thompson    | S-40   | RSS     | `https://stratechery.com/feed/`                                                | 10       | 5   |
| Dylan Patel     | S-39   | RSS     | `https://semianalysis.com/feed/`                                               | 10       | 5   |
| Andrej Karpathy | S-31   | RSS     | `https://karpathy.bearblog.dev/feed/`                                          | 10       | 5   |
| Andrej Karpathy | S-31   | YOUTUBE | `https://www.youtube.com/feeds/videos.xml?channel_id=UCXUPKJO5MZQN11PqgIvyuvQ` | 15       | 5   |
| Sam Altman      | S-21   | RSS     | `https://blog.samaltman.com/posts.atom`                                        | 30       | 5   |
| Chris Miller    | S-42   | RSS     | `https://chrismiller.substack.com/feed`                                        | 2        | 5   |
| Chris Lattner   | S-50   | RSS     | `https://www.modular.com/blog/rss.xml`                                         | 100      | 5   |

### 1.2 机构级 feed —— 承载对应人物的发声

**重要限制**：机构 feed ≠ 个人发声。这些源会带入大量与目标人物无关的公司公告。
必须依赖 `matchMode = "literal"` 的关键词（配置为人名 + 其核心议题）过滤，否则日报会被公关稿淹没。

| 承载人物                                 | 清单 #     | type | identifier                                | 实测条目 | AW  |
| ---------------------------------------- | ---------- | ---- | ----------------------------------------- | -------- | --- |
| Sam Altman / Jakub Pachocki / Noam Brown | S-21/22/23 | RSS  | `https://openai.com/news/rss.xml`         | 1052     | 5   |
| Demis Hassabis                           | S-26       | RSS  | `https://deepmind.google/blog/rss.xml`    | 100      | 5   |
| Mira Murati / John Schulman              | S-51/52    | RSS  | `https://thinkingmachines.ai/index.xml`   | 6        | 5   |
| Jensen Huang                             | S-05       | RSS  | `https://blogs.nvidia.com/feed/`          | 18       | 5   |
| Bill Dally                               | S-10       | RSS  | `https://developer.nvidia.com/blog/feed/` | 100      | 5   |
| Tri Dao                                  | S-20       | RSS  | `https://www.together.ai/blog/rss.xml`    | 100      | 5   |
| Ion Stoica / Sergey Levine               | S-18/54    | RSS  | `https://bair.berkeley.edu/blog/feed.xml` | 10       | 5   |
| Michael Intrator                         | S-15       | RSS  | `https://www.coreweave.com/blog/rss.xml`  | 100      | 5   |
| Andy Bechtolsheim                        | S-17       | RSS  | `https://blogs.arista.com/blog/rss.xml`   | 10       | 5   |

### 1.2b 自建 RSSHub 提供的源（2026-07-29 已部署）

RSSHub 实例已部署到 Railway 的 Gens.Team 生产项目，作为独立服务 `rsshub`，
未改动 Postgres / backend / frontend / ai-service / Redis 任何既有服务。

- 域名：`https://rsshub-production-8bb4.up.railway.app`
- 镜像：`diygod/rsshub:latest`
- 环境变量：`PORT=1200` / `NODE_ENV=production` / `CACHE_TYPE=memory` / `ACCESS_KEY=<见下>`
- **ACCESS_KEY 已启用并实测生效**：不带 key 返回 403，带 key 返回 200。
  公网实例不加保护会被他人白嫖 Railway 额度，因此强制开启。
  key 值存放于本机 `scratchpad/rsshub_key.txt`，**未写入本文档也未进 git**，
  入库时以 `?key=<ACCESS_KEY>` 拼在 identifier 末尾。

实测通过的路由：

| 承载人物                    | 清单 #  | identifier（需追加 `?key=<ACCESS_KEY>`） | 实测条目 | AW  |
| --------------------------- | ------- | ---------------------------------------- | -------- | --- |
| Dario Amodei / Jared Kaplan | S-24/25 | `<rsshub>/anthropic/news`                | 10       | 5   |
| Dario Amodei / Jared Kaplan | S-24/25 | `<rsshub>/anthropic/engineering`         | 20       | 5   |
| Jakub Pachocki / Noam Brown | S-22/23 | `<rsshub>/openai/research`               | 10       | 5   |
| 东数西算主管部门            | S-49    | `<rsshub>/gov/ndrc/xwdt`                 | 25       | 5   |

`gov/ndrc/xwdt` 实测返回真实发改委新闻动态（含"国家发展改革委举行专题新闻发布会"等），
解决了 §2 中 `ndrc.gov.cn/rss/xwdt.xml` 404 的缺口。

Anthropic 官方确无 RSS（`anthropic.com/rss.xml`、`/news/rss.xml`、`/news/feed.xml`、
`/engineering/rss.xml` 实测均 404），现由自建实例覆盖，不再依赖第三方公共实例。

**实测排除的 RSSHub 路由**（返回 200 但内容不对，属假阳性，勿用）：

| 路由                              | 问题                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `/deepseek/news`                  | 返回的是 **API 文档页**（"思考模式""多轮对话""对话前缀续写"），不是公司新闻，对追踪梁文锋无效 |
| `/github/repos/vllm-project/vllm` | 返回仓库列表而非发版记录                                                                      |
| `/anthropic/research`             | 503                                                                                           |
| `/huawei/*`                       | 该命名空间是"华为开发者联盟"（HarmonyOS 示例代码），非公司新闻，对徐直军无效                  |
| `/microsoft/*`                    | 仅 Edge 插件与容器镜像 tag，无公司新闻                                                        |

### 1.2c GitHub 官方 Atom（不需要 RSSHub）

| 承载人物    | 清单 # | type | identifier                                           | 实测                                            |
| ----------- | ------ | ---- | ---------------------------------------------------- | ----------------------------------------------- |
| Woosuk Kwon | S-19   | RSS  | `https://github.com/vllm-project/vllm/releases.atom` | 200，返回 vLLM 发版记录（v0.26.1rc0、v0.26.0…） |

优于 RSSHub 的 GitHub 路由，且无需 key、无限流风险。凡 GitHub 侧追踪一律走官方 `.atom`。

### 1.3 财报 / 法说会 —— SEC EDGAR 官方 Atom（免费、稳定）

实测最新文件日期均为 2026-07，feed 活跃。type 用 `RSS`（EDGAR 输出标准 Atom，`RssCollector` 可直接解析）。

| 承载人物           | 清单 # | identifier                                                                                                               | 实测                   | AW  |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --- |
| Jensen Huang       | S-05   | `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=NVDA&type=8-K&dateb=&owner=include&count=20&output=atom` | 20 条，最新 2026-07-02 | 5   |
| Lisa Su            | S-06   | 同上，`CIK=AMD&type=8-K`                                                                                                 | 20 条，最新 2026-07-01 | 5   |
| Hock Tan           | S-09   | 同上，`CIK=AVGO&type=8-K`                                                                                                | 20 条，最新 2026-07-06 | 5   |
| 魏哲家 C.C. Wei    | S-07   | 同上，`CIK=TSM&type=6-K`                                                                                                 | 20 条，最新 2026-07-24 | 5   |
| Christophe Fouquet | S-08   | 同上，`CIK=ASML&type=6-K`                                                                                                | 20 条，最新 2026-07-15 | 5   |

注意事项：

- **必须带 `type` 过滤**。不加过滤时 feed 里混入大量 Form 4（高管内部交易）与 13G（持股披露），
  实测 NVDA 不过滤时首条即为 `SCHEDULE 13G`，噪音极高。
- 美国本土公司用 `8-K`（重大事项，含财报发布）；外国发行人（TSM / ASML）用 `6-K`。
- SEC 要求 User-Agent 带真实联系方式，否则可能被封。`RssCollector` 当前固定发送
  `Mozilla/5.0 (compatible; GenesisRadar/1.0; +https://gens.team/bot)`，**不含邮箱**。
  上线前需确认 SEC 是否接受，否则要为该源单独设置 UA（涉及 collector 改动，需评估）。

### 1.4 二期可直接复用（A 级人物，本期不入库）

已顺带验证通过，二期铺开时无需重新核对：

| 源                                           | identifier                                                  | 条目 |
| -------------------------------------------- | ----------------------------------------------------------- | ---- |
| Interconnects（Nathan Lambert）              | `https://www.interconnects.ai/feed`                         | 20   |
| Simon Willison                               | `https://simonwillison.net/atom/everything/`                | 30   |
| The Next Platform（Timothy Prickett Morgan） | `https://www.nextplatform.com/feed/`                        | 83   |
| ServeTheHome（Patrick Kennedy）              | `https://www.servethehome.com/feed/`                        | 6    |
| Latent Space（swyx）                         | `https://www.latent.space/feed`                             | 20   |
| Vertiv（Giordano Albertazzi）                | `https://www.vertiv.com/en-us/about/news-and-insights/rss/` | 303  |
| Hugging Face blog                            | `https://huggingface.co/blog/feed.xml`                      | 833  |
| AWS What's New                               | `https://aws.amazon.com/about-aws/whats-new/recent/feed/`   | 100  |
| Meta Engineering                             | `https://engineering.fb.com/feed/`                          | 9    |

---

## 2. 实测排除（不要再试）

| 目标                          | 尝试的地址                                                                         | 结果                            |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| Anthropic 官方 RSS            | `anthropic.com/rss.xml`、`/news/rss.xml`、`/news/feed.xml`、`/engineering/rss.xml` | 全部 404，官方无 RSS            |
| IEA（Fatih Birol）            | `iea.org/rss/news`、`/rss/all`、`/news.rss`                                        | 全部 404                        |
| World Labs（Fei-Fei Li）      | `worldlabs.ai/blog/rss.xml`、`/rss.xml`、`/feed.xml`                               | 全部 404                        |
| vLLM blog（Woosuk Kwon）      | `blog.vllm.ai/feed.xml`、`/rss.xml`、`/atom.xml`                                   | 全部 404                        |
| 华为（徐直军）                | `huawei.com/en/rss-feeds/news`                                                     | 404                             |
| 发改委（东数西算）            | `ndrc.gov.cn/rss/xwdt.xml`                                                         | 404                             |
| Databricks blog               | `databricks.com/blog/feed`                                                         | 404                             |
| 微软 AI blog                  | `blogs.microsoft.com/ai/feed/`                                                     | 410 Gone                        |
| Cerebras / Crusoe             | `/blog/rss.xml`                                                                    | 404                             |
| Groq                          | `groq.com/feed/`                                                                   | 200 但 **0 条目**，空 feed      |
| Karpathy YouTube（user 形式） | `youtube.com/feeds/videos.xml?user=AndrejKarpathy`                                 | 404，**必须用 channel_id 形式** |

---

## 3. X 通道：三条路全部实测失败，需要你决策

这是本次验证最重要的负面结论。X 是清单第一大渠道（70 人，S 级 17 人）。

| 方案                                 | 实测结果                                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 现有 `XCollector` 的 Nitter          | 代码库已自行判定失效（`CreatableRadarSourceTypeDto` 禁止创建 X 源，注释「Nitter 全死」）                                                                                                                                                          |
| 公共 RSSHub 的 X 路由                | `rsshub.bestblogs.dev/twitter/user/karpathy` → **503**；`rsshub.app` → 404。<br>同一实例的 `/anthropic/news` 返回 200，说明不是实例挂了，是 X 路由本身失效                                                                                        |
| 自建 RSSHub                          | **已部署并实测**：`<rsshub>/twitter/user/karpathy?key=...` 仍返回 **503**。<br>同实例的 `/anthropic/news` 返回 200，证明实例健康、是 X 路由本身需要凭证。<br>查证确认该路由必须配置 `TWITTER_AUTH_TOKEN`（真实 X 账号会话 token），社区持续报 403 |
| `syndication.twitter.com` 免鉴权端点 | 返回 122 条推文含 `full_text`/`created_at`/`favorite_count`，看似可用；<br>但**最新一条为 2025-11-13，陈旧 257 天**——是缓存快照非实时时间线，**对日更追踪无效**                                                                                   |

**结论：基础设施已就位，唯一缺口是凭证。** 三个选项：

1. **给已部署的 RSSHub 配 `TWITTER_AUTH_TOKEN`** — 边际成本为零（服务已在跑），
   只需你提供一个 X 账号的会话 token。风险：该账号可能被风控或封禁，社区反馈稳定性不佳。
   配置方式：`railway variables --service rsshub --set "TWITTER_AUTH_TOKEN=<token>"`
2. **X API 付费 BYOK** — 稳定，且能带回真实 engagement 指标（顺带解决 §4.2 engagement 恒零问题），
   但需付费 + 补齐 `x-collector` 缺失的 API 分支代码
3. **放弃 X** — 17 名 S 级人物的实时发声丢失（含 Karpathy、LeCun、Musk、Dylan Patel、Jeff Dean 等）

好消息是有部分冗余：Karpathy、Sam Altman、Dylan Patel、Ben Thompson、Chris Lattner
已通过博客/YouTube feed 覆盖（§1.1），不完全依赖 X。

---

## 4. 待完成项

| 项                                 | 状态           | 备注                                                                                                                                                             |
| ---------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| arXiv 作者 feed（13 人）           | **被限流阻塞** | 详见 §4.1                                                                                                                                                        |
| X handle（17 人）                  | **未验证**     | syndication 端点在批量请求后返回 20 字节（限流），本轮结果作废。待 X 方案定了再解析                                                                              |
| CoreWeave EDGAR                    | 未解析         | ticker `CRWV` 查询返回 0 条，需按 CIK 号重查                                                                                                                     |
| 梁文锋 / 周靖人 / 徐直军           | 未解决         | 3 个中国源无标准 RSS 且 RSSHub 无对应路由（`/deepseek/news` 与 `/huawei/*` 均为假阳性），需 `CUSTOM` 选择器抓取，须先读 `custom-collector.service.ts` 评估可行性 |
| 东数西算                           | **已解决**     | 走自建 RSSHub 的 `/gov/ndrc/xwdt`，见 §1.2b                                                                                                                      |
| Fatih Birol / Fei-Fei Li 机构 feed | 未解决         | IEA 与 World Labs 均无 RSS，RSSHub 也无对应命名空间（1686 个命名空间中无 `iea` / `worldlabs`），只能 `CUSTOM` 抓取                                               |

### 4.1 arXiv：作者查询被限流，且分类 feed 替代方案不可行

**现状**：`export.arxiv.org/api/query?search_query=au:"..."` 从本环境持续返回 **429**。
同一时刻简单查询（`all:electron`）返回 200，说明是针对性限流而非服务不可用。
已尝试 20s 间隔 + 四级退避重试，仍未突破，后台任务已终止以免持续冲击对方服务。

**评估过的替代方案：arXiv 分类 RSS + 人名做 literal 关键词** —— 实测后判定**不可行**。

结构上本来成立：`rss.arxiv.org/rss/<cat>` 实测均可用且无限流，每个 `<item>` 都带
`<dc:creator>` 作者字段，而 `RssCollector` 的 `customFields` 已经把 `dc:creator` 映射为
`creator`，落到 `RawCollectedItem.author`。理论上订阅分类 feed + 用作者名做 literal 匹配即可。

**但日更量级与 `perSourceItemLimit` 冲突**：

| 分类  | 单日条目 |
| ----- | -------- |
| cs.AI | 340      |
| cs.LG | 245      |
| cs.CL | 115      |
| cs.DC | 20       |
| cs.AR | 15       |

`RADAR_PIPELINE_DEFAULTS.perSourceItemLimit = 20`，`RssCollector.fetch()` 取满 20 条即 `break`。
按默认 6h cron（4 次/天）计算，cs.LG 单日最多采到 80 条，而实际有 245 条，**漏采超过 65%**；
cs.AI 漏采超过 75%。目标学者的论文极可能正好落在被截断的部分。

调高 `perSourceItemLimit` 并不能解决——那会把 735 条/天的全量论文灌进 S4/S5/S6，
与「少用 AI」的目标直接冲突，成本反而失控。

**结论**：arXiv 仍须走按作者查询，只是需要换一个未被限流的出口 IP 重试（例如从后端服务器
或本地网络执行），并逐条人工确认重名歧义——`Patterson_D`、`Kaplan_J`、`Sutton_R`、`Levine_S`
都是高风险重名，必须看论文标题与合著者才能判定。

复现命令（换网络环境后可直接跑）：

```bash
curl -A "gens.team-radar/1.0 (你的邮箱)" \
  'https://export.arxiv.org/api/query?search_query=au:%22Dao_T%22&sortBy=submittedDate&sortOrder=descending&max_results=5'
```

请求间隔不低于 3 秒（arXiv 官方要求），建议 20 秒以规避突发限流。

---

## 5. 当前覆盖率

S 级 54 名唯一人物中：

- **已有可用 feed：24 人**
  - §1.1 个人级 7 条 → 6 人
  - §1.2 机构级 10 条 → 13 人
  - §1.2b 自建 RSSHub 4 条 → 新增覆盖东数西算（S-49）
  - §1.2c GitHub Atom 1 条 → 新增覆盖 Woosuk Kwon（S-19）
  - §1.3 EDGAR 5 条 → 5 人
- 待 arXiv 验证：13 人（部分与上面重叠）
- 依赖 X 凭证决策：17 人（其中 5 人已被博客/YouTube 覆盖）
- 明确无 feed 转实体追踪：7 人
- 中国源待定：3 人（梁文锋 / 周靖人 / 徐直军）

**在完全不解决 X、不依赖 arXiv 的情况下，已可立即启动 24 名 S 级人物的追踪**，
共 27 条已实测通过的 identifier，足以支撑计划文档 P1 阶段的最小链路验证。
