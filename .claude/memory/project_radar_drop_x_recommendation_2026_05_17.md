---
name: project-radar-drop-x-recommendation-2026-05-17
description: AI 雷达 source-curator 不再推 type=X，业务策略对齐 Feedly/Inoreader 业界（X→等价 RSS/YouTube/Newsletter）；commit 3cfbcbddd on main 2026-05-17
metadata:
  node_type: memory
  type: project
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

AI 雷达 source-curator stage 业务策略调整：**LLM 不再推 type=X 候选**，
碰到 X handle/KOL/公司主题自动转换为等价**官博 RSS / YouTube / Newsletter**
一手信源。

**Why:** Nitter 公共代理全死（nitter.net/poast.org/privacydev.net 全 down）+
X 官方 API $200/mo 性价比低 + 业界主流 RSS reader（Feedly / Inoreader /
Substack）已淡化 X 集成 + 一手内容真正在官博而非 X 段子。继续推 X 用户
确认入库 → collector 必失败 → dead source 噪音。

**How to apply:**

- `RadarSourceType` enum 仍含 X（兼容旧数据 + admin 手动 X collector 用例）
- prompt + UI 推荐路径全剔除：source-curator SKILL.md v2.0 / discovery
  stage prompt / RadarSourceList AddSourceForm
- 防御 filter 在 discovery.stage.ts 把 LLM 仍吐 type=X 的 candidate drop
  掉（prompt 失守入库变 dead source 的最后一道闸）
- 业界映射示例（SKILL.md 第 ## 关键原则 表）：Elon→Tesla RSS+YouTube；
  OpenAI→openai.com/blog RSS + OpenAI YouTube；任意 X handle→优先该对象
  的官方一手信源，找不到再用同领域权威媒体 RSS
- 主页 subtitle 同步：「X / YouTube / RSS」→「官博 / YouTube / RSS 一手
  信源 + 评分去噪 + 信号洞察」

commits:

- 3cfbcbddd — R1 落地（被用户问"有没有 5 路共识"后才发现没走评审）
- 54b96fb99 — R2 整改：拆 CreatableRadarSourceType 写侧 enum + KOL 兜底层
  v2.1（个人 Substack / 长访谈播客 > 公司公关稿）+ filter 大小写防御
  （X_ALIASES + normalizeType trim+toUpperCase）+ legacy X notice banner
  - 16 个新 spec case；5/5 YES 共识达成

相关 feedback: [[feedback-no-dual-sources]] [[feedback-contract-fix-must-touch-both-sides]]
[[feedback-must-run-consensus-before-push]] [[feedback-consensus-must-iterate-to-all-yes]]
