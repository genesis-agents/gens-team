---
name: project_ui_discipline_hardzero_2026_05_20
description: UI-discipline audit 规则焊死 HARD_ZERO（2026-05-20）；R2 后发现有盲区，已加固并改棘轮冻结 baseline=9
metadata:
  node_type: memory
  type: project
  originSessionId: e234e058-6f7c-42f0-837c-b4394332c29f
---

`scripts/utils/audit-ui-discipline.ts` 2026-05-20 收口到真 0 并全部焊死（pushed `77acf2484`）。

- **TOTAL 562/历史 → 0**，R1–R11 全部进 `HARD_ZERO_RULES`（原仅 R8）。任一规则新增违规即 exit 1，pre-push 步骤4 拒推；正式退出 warn-only 灰度。
- **新增检测器（本会话）**：R7 Signal B（≥2 处 `xxxTab===字面量` + onClick，排除纯 state-holder 如 ExploreContext）；R9 DIY 环形 spinner（`animate-spin`+`rounded-full`+`border-N`，不碰内联图标 spinner）。
- **大迁移**：62 DIY spinner→LoadingState/LoadingInline、tab 栏→ui/tabs/Tabs、空态→EmptyState、错误→ErrorState、弹层→Modal（含 ai-radar）。
- **R11 基线改对**（非豁免）：通用基线 = `onEdit + onDelete`。可见性切换**不入通用基线**——全应用仅 Topic 有真可切换可见性（`TopicVisibility` enum）；plans/scenarios/KB/wiki 后端无可见性字段/接口，强制 toggle 只会造死开关。`R11_BESPOKE_OK` 清空。
- **bespoke allowlist（canonical 真不适配，逐源留痕）**：R4/R5/R6/R7/R9/R2/R3 各有 `R*_BESPOKE_OK`（按钮/装饰环、缩略图遮罩、布局骨架、命令面板、移动端导航、admin 内联告警、统计/CTA 卡、流水线表等）。
- **新 canonical**：`PageHeaderHero` 加可选 `onBack`（详情页复用）。

## 卡片设计系统标准化（2026-05-20，pushed `9235711bc`；用户要求"每类卡标准化"）

卡 canonical 中心 = `components/ui/cards/`（新卡 primitive 落 ui/；composite AssetCard 留 common/ 避 ui→common 倒置）。7 类卡 + 对应 canonical：

1. 资源/管理卡 → `common/asset-card/AssetCard`（TemplateCard 收编；ResourceCard=社交内容卡/Connector=配置/GoogleDriveFileCard=选择行，核验后不强迁）
2. 统计卡 → `ui/cards/StatCard`【新】（迁 CapabilityMeters/ComputeUsagePanel/ComputeUsageTab/AISkillsTab/TrendReport/MissionProgressPanel/StageTaskDrawer）
3. 消息卡 → `ui/cards/MessageCardShell`【新】（迁 message-cards/ 6 卡）
4. 简报卡 → radar `RadarBriefingCard` 家族（已内部一致，无需迁）
5. 内容展示卡 → `ui/cards/SectionPanelCard`【新，含 subtitle 槽】（迁 explore 3 + StructuredAISummary 5）
6. 配置卡 → `common/cards/SettingsSectionCard`（5 adopter + UserModelsManagement）
7. 引用卡 → `common/citations/CitationListItem`（explore/report + library/rag 迁完）

**规则焊死到 12 条 HARD_ZERO**：R1–R9 + R11 + R12（CitationListItem）+ R13（MessageCardShell，message-cards 目录精确检测）。
**未硬零（实事求是，精度不够会误拦）**：统计卡（text-2xl 噪声大）、内容卡（渐变头与 Modal/面板共用特征）→ 作"文档约定 + 已迁清晰用例"治理，不进 HARD_ZERO。

详见 [[feedback_ui_governance_no_fake_exceptions]]。多会话协作（exec 写 R11/R1/R2、radar 管 ai-radar 子树）见 [[feedback_lint_staged_stash_safety]]。

## R2 检测器有盲区 → 加固 + 改棘轮（2026-05-20，用户发现「为什么之前违反也硬0通过」）

用户质疑后核实：旧 `checkR2AssetCard` 的「TOTAL 0」是**假绿**，有 4 个盲区，自写资产卡能整片绕过：

1. **抽成 `*Card` 组件即免疫**——R2 只数「内联在 `.map` 旁、≥3 次」的卡 className；卡被抽成独立组件后 className 在组件定义里、离 `.map` 远 → 命中 0。library bookmarks 的自写 `ResourceCard` 就是这样常年漏检（本会话已迁成 `AssetCard`）。
2. **阈值 ≥3**——单个列表只有 1 个卡模板 → 永远 < 3。
3. **顺序依赖 + 仅 `bg-white`**——正则要求 `rounded→border→bg-white` 固定顺序；换序或用 `bg-gray-50` 即绕过。
4. **文件级 import 豁免**——`hasImport(AssetCard)` 整文件 early-return。

**加固版**（`scripts/utils/audit-ui-discipline.ts`）：lookahead 顺序无关；形态 A=内联 `.map` 卡(bg-white+标题信号,≥3)；形态 B=命名 `*Card` 且根节点自写卡(无 `<AssetCard`)+「标题信号」；用**跨文件 `.map` 列表项组件名索引** `collectMapRenderedComponents` 把 B 收敛到真·列表卡（排除 config/summary/insight 等域内卡，22→9）。

**棘轮过渡**：R2 先移出 `HARD_ZERO_RULES`、进 `RATCHET_RULES`，**默认即强制「不劣化」**(cur>baseline 即 exit 1，已实测)。baseline 临时锁 9。

**多卡型修正 + 逐源核验归 0（用户指出「该为 explore 专门定义卡，别强塞 AssetCard」）**：

- R2 旧模型「一切列表卡→AssetCard」是错的——本项目是**多卡型设计系统**。新增 `CANONICAL_CARD_USE`（AssetCard/StatCard/MessageCardShell/SectionPanelCard/SettingsSectionCard/FeedCard/CitationListItem），组件体内用其一即非自写卡。
- **新增 canonical `FeedCard`**（`components/common/cards/FeedCard.tsx`，**卡设计系统第 8 类**：横版信息流卡，左缩略图+右内容+底部带文字动作条，slot: thumbnail/meta/title/description/actions）。explore `ResourceCard` 改为其领域包装（零回归），不再被误判。
- 加固后浮现的 9 张**逐源核验 = 0 真债务**：explore 迁 FeedCard；其余 7 张（CreateKnowledgeBaseCard=新建CTA磁贴 / WikiLogCard=日志行 / TrendCard=可展开趋势卡 / InsightCard×2=可折叠洞察面板 / AgentCard=实时agent状态 / admin StatCard）都是**合法独立卡型，AssetCard 不适配** → 进 `R2_BESPOKE_OK` 留痕。
- **棘轮 baseline 锁 0**（`--ratchet`），新自写实体卡仍即拒。

**教训**：①「audit TOTAL 0」≠「无自写卡」，启发式 lint 不是证明。②强制复用 ≠ 万物归一卡——要认设计系统的多卡型，缺型就**新建该型 canonical**（FeedCard），别硬塞别的卡型。详见 [[feedback_check_reuse_before_building]]。
