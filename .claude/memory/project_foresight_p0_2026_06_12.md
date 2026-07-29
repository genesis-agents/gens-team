---
name: project-foresight-p0-2026-06-12
description: AI 前瞻（Foresight）P0 已上线 — 产品定位/IA 决策/P2P3 路线图，后续 session 接续供料线集成
metadata:
  node_type: memory
  type: project
  originSessionId: 3aadb414-dad0-42c4-a344-20bb00ee77c8
---

2026-06-12 AI 前瞻（判断资产/假设图谱）P0 合入 main（e9bdf8376 后端 / 86445fa95 前端）。

**产品定位**：深度洞察分组的存量资产层。供料链 = AI 雷达（信号流）→ AI 洞察（生成引擎，即 playground）→ AI 前瞻（判断沉淀）。客户价值 = 把洞察从一次性报告变成持续检验的资产。

**IA 决策（用户拍板）**：菜单"AI 洞察"指向 /agent-playground（playground 继承名字）；"AI 研究"菜单位被"AI 前瞻"(/foresight) 替换；"AI 实验场"入口移除；/ai-insights /ai-research 路由保活仅摘菜单。导航 SSOT 在 frontend/lib/constants/nav-config.ts。

**SOTA 三块板（schema 一等公民，不可退化）**：① 边权重 weight + 冲击度连乘衰减传播（阈值 0.30，防告警风暴）② foresight_conf_logs 置信度账本（裁定 adjust 真实修订 conf）③ cards.scenarios 情景条件置信度 JSONB。设计原型 docs/demos/insight-graph-demo.html（v0.4，演示用）。

**P2/P3 已落地（同日 acfc1848a，ForesightIntakeService）**：P2 = 工作台「扫描雷达信号」按钮——经 ContentSourceRegistry(AI_RADAR) 拉近期信号，LLM(deterministic) 与主题全部 falsifier 匹配，命中建候选 ForesightSignal（强/弱分级+依据档案+同名去重），注入仍需人工过档案；P3 = 「从 AI 洞察导入」——选已完成 mission(AI_PLAYGROUND)，LLM 按主题层级本体抽 3-6 张草稿卡（无 falsifier 直接丢弃），人工勾选后入库 originType=insight-mission。两条线零跨 app import。**洞察导入是分片 map-reduce**（5616ee1f9）：洞察报告常态 10 万字，单次调用截断丢 90% —— 按章节切 ~9k/片（上限 16 片）、并发 3 逐片抽取（单片失败跳过）、候选 >12 时 LLM 汇总去重；intake 所有 LLM 调用经 chatJson（JSON-only system + 空输出重试附 /no_think，防推理模型 CoT 烧光输出预算的已知坑）。后续升级方向：扫描改定时自动（cron per topic）、导入后自动建议影响边。dogfooding 检验仍有效（falsifier="Owner 三个月内放弃维护"）。

**多主题化（同日 b66646058）**：ForesightTopic = 独立洞察工作台，**层级本体（layers JSONB）随主题自定义**——算力底座的 L0-L5 是该主题本体而非产品通用本体。全域挂 topicId，传播限定主题子图，cardKey/conclKey 主题内唯一。落地页 = 主题卡片画廊（AssetCard），点卡进工作台。迁移 20260616_foresight_topics 含存量回填。

**同日附带修复（commit b66646058 内）**：playground「更新」全量重跑根因 = 同-id incremental 无 checkpoint 时静默退化 fresh → S2 重新规划生成不同维度名 → S3 按 dimension 名的持久化缓存全 miss。修复 = 无 checkpoint 时 inheritFromMissionId 指向自己（self-inherit：hydrate 自己的 plan + 逐维 research results + 章节草稿）。

**流程教训**：PowerShell 链式 `git commit ...; git push` 用 `;` 串联会吞 commit 失败（lint-staged 拦截后 push 照跑、退出码取最后一条）——曾导致两次误报"已提交"。必须逐步执行 + `git log` 验证落库。

**待办**：部署后需跑 prisma migrate deploy（20260615_foresight_init + 20260616_foresight_topics）+ 重启后端激活 radar-signal-search 工具注册。

相关：[[project-index]]
