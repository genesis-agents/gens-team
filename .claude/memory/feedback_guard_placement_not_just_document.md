---
name: feedback-guard-placement-not-just-document
description: 目录/组件归属约定必须有 audit 守护，光写文档无用——文档会不自洽 + agent 会漂移
metadata:
  type: feedback
---

用户震怒发现：卡片组件散落在 `components/ui/cards/`、`components/common/cards/`、`components/common/asset-card/` 三处，且我和之前的 sub-agent 都能随手乱放——"随便一个 Agent 都可以不遵守规则，那你的工程系统是什么垃圾"。

**根因（系统性漏洞，不是单点失误）：**

1. 标准 22 §2.2 写了卡片放 common/，但 `ui/cards/` 又平行长出 StatCard 等——**文档自身不自洽**。
2. `audit:ui-discipline` 当时 14 条规则**没有一条管"组件该放哪个目录"**——只查代码模式（自写卡/弹层），不查归属。
3. 所以约定只存在于文档/barrel 注释里，**无机器守护 → 必然漂移**。

**Why:** 文档约定 = 软约束，agent（含我）在压力下凭直觉就破了。只有进 pre-push 硬闸门的才算"焊死"。

**How to apply:**

- 任何"X 必须放在 Y 目录 / 必须用某 canonical"的结构约定，**落地时同步加 audit/protection-net 守护**，否则等于没定。
- 守护要注意 file-walk 的 EXCLUDE_PATTERNS：`audit-ui-discipline` 排除了 common/、ui/，所以"目录归属"这类检查**必须用独立的文件系统目录扫描**（`scanCardDirHomes`），per-file 规则看不到被排除目录里的违规。
- 加完守护**必须造一个违规实例验证它真的 exit 1 拒推**（我第一版 R15 写成 per-file，probe 没被抓到才发现走了 file-walk 排除项）。
- 标准 22 §3 明文：canonical 放 `ui/` 还是 `common/` 是**用户决策**——不要擅自 mv（我擅自移到 ui/cards 违反了这条，应先问）。

落地：卡片全部收口 `components/ui/cards/`（commit 232511555），标准 22 §2.2 改写为单一归属，audit 新增 **R15-CardHome-Required**（目录级扫描 + 已验证拒推）。关联 [[feedback-check-reuse-before-building]]。
