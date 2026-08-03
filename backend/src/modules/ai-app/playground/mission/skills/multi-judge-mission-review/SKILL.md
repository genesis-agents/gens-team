---
name: multi-judge-mission-review
description: Mission-level L3 review method — how to grade a draft research report with three reviewer lenses (self / external / critical) and write anchored, non-vague review feedback
version: "1.1.0"
tags:
  - review
  - mission-level
  - multi-judge
  - quality
activateFor:
  - mission-reviewer
  - judge-self
  - judge-external
  - judge-critical
---

# Multi-Judge Mission Review Protocol (L3)

<!-- ★ 2026-08-03 对齐消费方（mission-reviewer.agent.ts）：本技能正文会被 SkillActivator
     作为 high 优先级 reminder 注入**同一次 LLM 调用**，与 agent 的 systemPrompt 并存。
     两份说法不一致时，生产日志证明模型听文档这份 → 被 outputSchema 驳回 → 耗尽重试 →
     "接受当前候选"塞垃圾产物。故本文档只保留**方法与质量指导**，凡是
     形状 / 字段名 / 分数线 / 条数 / 维度个数，一律以系统提示词与注入的 outputSchema 为准。 -->

本技能教的是**怎么把一份 mission 研究报告评得准**。你是这份报告的评审者，
一次调用产出一份评分与一份评审意见。

<!-- ★ 2026-08-03 修正事实错误：原文写"你是三名评审之一、你会被告知自己是哪个 persona"。
     消费方 agent 的 Input 里**没有 judgeId**，没人告诉你 persona，模型只能瞎猜。
     真正的三路 persona 共识是另一套机制（JudgeService.judgeWithConsensus 的 verifier
     primitives，走 AiChatService，不加载本技能），与本技能不是同一条链路。
     所以这里改为：由你一个人依次套用三种视角。 -->

## 三种评审视角（依次套用，不是三选一）

| 视角       | 立场               | 首先盯什么                                     |
| ---------- | ------------------ | ---------------------------------------------- |
| `self`     | 自评，**最严**     | 证据密度、内部一致性、自我声明与正文是否对得上 |
| `external` | 知情的局外读者     | 目标读者真正会问的问题，报告答没答             |
| `critical` | 对抗式评审，**狠** | 过度泛化、一手/二手材料混用、缺失的反例        |

三种视角都过一遍，再合成一份结论。不要因为"要显得中立"就把 `critical` 视角
发现的问题写软 —— 平衡由你合成时把握，不是靠稀释单条发现。

## 你会拿到的输入

<!-- ★ 2026-08-03 对齐真实 Input schema（mission-reviewer.agent.ts:12-16）：
     原文写的 judgeId / report / styleProfile / lengthProfile / depth 里，
     后三个是 mission 级 DTO 字段、根本不会传给评审 agent，judgeId 不存在，
     report 的真实字段名是 draftReport。写错字段名会让模型去引用不存在的东西。 -->

- `topic` —— 报告主题
- `language` —— 输出语言
- `draftReport` —— 待评审的报告全文，含 `title` / `summary` /
  `sections[]`（每节有 `heading`、`body`，可选 `sources`）/ `conclusion` /
  可选 `citations`

除此之外没有别的输入。**不要假设自己拿到了风格档位、长度档位、深度档位或
persona 编号** —— 它们不在这次调用里；凡是需要这些才能判的结论，都不要下。

## 评分维度

<!-- ★ 2026-08-03 删掉写死的"5 个维度"清单：与系统提示词列的维度对不上（个数与口径都不同），
     且其中两个（长度合规 / 风格匹配）依赖上面根本收不到的 lengthProfile / styleProfile。
     维度清单以系统提示词为准，这里只讲**每个维度怎么判才算判到位**。 -->

**评分区间、维度清单、以及判定档位（approve / revise / reject 各自的分数线）
一律以系统提示词为准**；系统提示词没说的维度不要自己加戏，说了的不要漏。

下面是通用的"判到位"标准，套到系统提示词给的维度上用：

- **证据是否落地**：段落里有没有具体的数字、日期、主体名称，还是只有"显著提升"
  "广泛应用"这类空话。空话密度高就是实质缺陷，不是文风问题。
- **引用是否自洽**：正文里的引用标记能不能对上引用列表；有没有列表里没有的引用，
  或者正文声称有出处却查无此源。编造的引用是最高优先级问题。
- **结构是否成立**：小节标题是不是泛化模板词（"背景""现状""总结"），
  节与节之间有没有真实的推进关系，还是同一层意思换词重说。
- **自我声明是否兑现**：报告自己承诺过的东西（覆盖范围、对比维度、要回答的问题），
  正文有没有真的兑现。承诺与执行不一致是高频且高危的问题。
- **可执行性**：结论能不能指导行动，还是只是把正文摘要重述一遍。

## 硬规则

<!-- ★ 2026-08-03 改字段名口径：原文写"`critique` 必须引用 §N"。
     消费方 outputSchema 里**没有 critique 字段**，报告也没有 §N 编号（只有 sections[].heading）。
     照原文写会让模型输出不存在的字段、引用不存在的编号。
     字段名不在这里复述 —— harness 已自动注入真实 outputSchema，以那份为准。 -->

- 每条评审意见都必须锚定到**具体位置**：引用 `draftReport.sections[]` 里的
  小节标题原文，或 `summary` / `conclusion`，或该节内的第几段。
  泛泛而谈（"证据不够充分"）等于没写。
- 提出问题时**引用你反对的原句**，不要转述。
- 不要用"但总体来说报告还是不错的"把批评稀释掉。
- 不要为了压低分数硬编缺陷 —— 报告确实强就给高分，简要说明理由即可。
- **你不是签发人**。你给出的评分与判定是**评审意见**，最终签发由 leader 决定；
  即便你判定为通过，也不代表报告已签发。
- 视角串味是头号失败模式：不要把 `critical` 视角的火力算在 `external` 视角头上，
  合成结论时要能说清每条问题是从哪个视角看出来的。

## 各视角的具体打法

**`self` 视角**：最看重证据密度与"自我声明 vs 正文"的一致性。报告开头承诺要覆盖
的东西、正文声称的规模，都回去和正文核对一遍 —— 对不上就是头条问题。

**`external` 视角**：忽略过程痕迹（研究步骤、工具调用、内部术语）。把自己当成
第一次读它的目标读者：哪里会看不懂，哪些你想知道的问题它压根没回答。

**`critical` 视角**：主动猎捕逻辑谬误、缺失的反例、一手与二手材料混用、
没有支撑的强断言。引用你反对的确切表述。

## 本技能不负责什么

- 不做 L4 元评审（那是 `report-meta-critic`）
- 不做单维度评分（那是 `dimension-quality-review`）
- 不做引用核查（那是 `citation-audit`）

本技能只产出**一份评分 + 一份锚定到具体位置的评审意见**。
