---
name: citation-audit
description: Per-citation verification method — judge URL form, domain reputation, quote/topic consistency, and flag contradictions
version: "1.0.0"
tags:
  - verification
  - citations
  - quality
  - fact-checking
# ★ 2026-08-03：原写 [fetch, web-search]，与唯一消费方矛盾 ——
# verifier.agent.ts 是 loop="simple" + toolCategories=[]（playground 与 marketplace
# 两份 agent 均如此），结构上拿不到任何工具。本字段在 skill-activator 路径上不授予
# 工具（只注入 body），留着假工具名等于给后人一个假前提。真要开工具核验，先改
# agent 的 loop/toolCategories，再回来改这里。
allowedTools: []
activateFor:
  - verifier
  - citation-auditor
  - fact-checker
---

# Citation Audit Protocol

Your job is **per-citation verification**：对送进来的每一条 citation 单独下判断，
说明判断依据。

> ★ 2026-08-03（生产实证修正）：本文档此前通篇写"call `fetch` / 拉取真实网页"，
> 而消费方 agent 结构上没有任何工具。模型照文档做 → 要么幻觉出"我已拉取"的
> evidence，要么试图发不存在的 action。**能不能调工具由消费方 agent 的运行时
> 配置决定，不由本文档决定**；当前 verifier 无工具，只能做静态启发式判断。
> 具体可用状态、条数口径、evidence 长度下限，一律**以系统提示词为准**。

## Per-citation checks

### 1. URL 形态与可信度

- scheme / host 是否完整合法，有无明显畸形（拼接残留、占位符、明显编造的路径）
- URL 结构是否与所声称的内容类型相符（如声称是统计公报却指向站点首页 / 搜索结果页）
- **有工具的运行模式下**才谈 HTTP 状态、重定向、paywall；无工具时不得声称自己访问过

### 2. inlineQuote 与主题一致性（当 `inlineQuote` 提供时）

> 输入字段名以 Input schema 为准：每条 citation 只有 `index` / `url` / `inlineQuote`。

- quote 的主体、领域、口径是否与 topic 对得上，有无张冠李戴（换了主体 / 换了年份 / 换了口径）
- quote 内部是否自相矛盾，或与常识性事实明显冲突
- **逐字比对原文**只在有工具的模式下成立；无工具时缺乏原文，不能据此认定"匹配"

### 3. 时效合理性

- Input 里没有 publishedDate 字段；只能从 URL 路径 / quote 文本里推断年份，推断不出就说推断不出
- 明显的未来日期、与 topic 时间窗明显不符的年份要标出
- 具体"多久算过时"的年限口径以系统提示词为准，不要在这里自造一个数字

### 4. 域名信誉（本技能最有价值的部分）

- 偏可信：政府 / 教研机构 / 同行评议 / 官方企业站 / 有编辑部的老牌媒体
- 偏可疑：内容农场、聚合站、SEO 垃圾站、AI 批量生成站、无署名个人页
- 个人博客 / Substack / Medium 视作末位来源：除非该作者本人就是一手信源，否则不足以支撑硬结论
- 二手转引不等于原始出处：博客转述政府数据，只能算指向了转述方，不能当作原始来源认定

## Verdict statuses（语义参考）

> 状态**枚举取值**以 harness 自动注入的 `outputSchema` 为准；**当前运行 mode 下
> 哪些状态可用**以系统提示词为准（例如无工具模式下 `verified` 是被禁用的）。
> 下表只解释各状态的语义，不定义可用性。

| Status                     | 语义                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `verified`                 | 真的取到了原文，且引用措辞 / 数字与原文一致（需工具能力）  |
| `unverified-but-plausible` | 没能取到原文，但 URL 形态、域名、与 topic 的一致性都合理   |
| `unverified-suspicious`    | 没能取到原文，且 URL 异常 / 域名可疑 / quote 与 topic 不搭 |
| `contradicted`             | 引用内容与 topic 或与可核实事实直接冲突                    |

## Hard rules (never violate)

- **不得声称自己做了做不到的事**：没有工具就不要写"我已访问 / 已抓取 / HTTP 200"，
  evidence 里老实写清楚判断是启发式的
- **不得凭 LLM 记忆认定"已核实"**：记忆不是证据；能否标 `verified` 见系统提示词
- `evidence` 必须给出**具体判断依据**（哪个域名、哪段 quote、哪处不一致），
  不接受"看起来没问题"这类空话；长度下限以系统提示词为准
- `contradicted` 必须同时写出：引用自己说了什么、它与什么冲突（topic 口径 / 已知事实 / 同批其他引用）
- 绝不编造 URL、来源标题或引文文本——核不动就说核不动，把不确定性写进 evidence
- 数字要抠精确：引用写 50% 而可核实口径是 47.3%，属冲突，不要四舍五入成"一致"

## What this skill is NOT

- Not for evaluating overall report quality (that's the meta-critic's job)
- Not for finding new sources (that's the researcher's job)
- Not for stylistic / structural review (that's the reviewer's job)

This skill is a **per-citation verification gate** — it operates on what the
report already cites, and either certifies or flags each one.
