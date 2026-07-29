---
name: agent-playground overhaul v1.6（PR-8 系列）落地纪要
description: 2026-05-07 PR-8 v1.6 五路集体评审通过的彻底重构落地：单轴 reportScale + 派生真值 + dual-write chapters 表 + 硬合约 qualityGap + 8 RerunIntent + figure-curator + sub-section 拼接 + AI overlay + mobile redirect
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# PR-8 v1.6 agent-playground overhaul — 落地纪要

## 背景

2026-05-07 用户反复挫败：mission 报告字数偏少（目标 25K 实际 1-5K）、图文不全、重跑被乱拒、40 章太多、深档体验糟糕。要求"完整方案 + 多方评审共识"，不接受"就问题修问题"。

## 终态

**Why**：legacy 设计三轴笛卡尔积（depth × lengthProfile × budgetProfile）+ LLM 自报字数 + 单卷 LLM 调用上限，不可能满足 12-15 万字深档。重构必须从 axis / 真值 / 拆分调用 三处一起改。

**How to apply**：未来再做 agent-playground 类报告系统，先决三件事——

1. 单轴档位（quick/standard/deep/professional）替代笛卡尔积；
2. 字数派生真值（backend countCJKWords，从不信 LLM 自报 wordCount）；
3. 长章拆 N 段 LLM 调用拼接（deep 档 13K 字 = 3 段 × 4-5K，professional 档 20K 字 = 4 段 × 4.5-5.5K），每段 emit `chapter:sub-section:completed` 当 LivenessGuard 活迹。

## 关键产物（commit 待 push）

### Backend

- `scale-presets.ts`：6 档（quick/standard/deep/professional + publication/encyclopedia 实验中），单一 source（前端只用于 UI 展示）
- `services/budget/budget-guard.service.ts`：tryDeduct/tryReserve 原子 CAS（无 refund 方法防 CWE-400 死循环；prod 需 Redis Lua）
- `services/hard-contract/assert-hard-contract.ts`：6 contracts（figPerCh/wordsPerCh/dimensionsCount/totalChapters/citationsPerCh/subSectionCount）→ qualityGap[] → markCompleted（**绝不 fail mission**，让用户决定 retry/accept/contact-support）
- `services/figure-curator/figure-curator.service.ts`：scraped → image-search → AI 生成 三步降级，SSRF guard + DMCA hotlink 默认 + per-user 24h frequency + budget gate + system role lock
- `services/rerun/rerun-intent-dispatcher.service.ts` + `rerun-intent-handlers.ts`：8 意图（extend-length / add-figures / revise-chapter / extend-research / fresh-research / change-style/language/audience / publish-only），fresh-research 走 ensureMissionOwnership 不走 ensureRerunable
- `services/sub-section/sub-section-orchestrator.ts`：deep/professional 单章 N 段 LLM 调用拼接 + emit N 次活迹
- `agents/writer/sub-section-planner.agent.ts` + `chapter-writer.agent.ts.subSection mode`：planner 给章节切分大纲，writer 单段执行
- `prisma/schema/models.prisma`：3 新表（chapters / chapter_figures / chapter_citations）+ user_id（CWE-639 防越权）+ qualityGaps JSONB
- `agent-playground.events.ts`：注册新 event type `chapter:sub-section:completed`（schema in event-schemas.ts）
- 3 新 stage stub 文件（s3-5 / s7-5 / s8-5）—— RerunIntent INTENT_STAGES 路由用，主 pipeline 是 no-op（实际工作 inline 在 per-dim-pipeline）

### Frontend

- 5 新组件 in `components/agent-playground/overhaul/`：ScalePresetCardGrid / RerunIntentCardGrid / QualityGapBanner / ChapterFigureWithOverlay / MobileRedirectBanner
- `lib/agent-playground/scale-presets.ts` + `rerun-intents.ts` 常量
- `services/agent-playground/api.ts`：RunMissionInput 加 reportScale/parentMissionId/withCitations；MissionListItem 加 qualityGaps
- `app/agent-playground/layout.tsx`：MobileRedirectBanner 挂到 layout
- `components/agent-playground/DemoLauncher.tsx`：单轴 reportScale UI（默认开启） + 切回 legacy 3-axis（localStorage 持久化），dual-write 14d 期同步 legacy depth/lengthProfile
- `app/agent-playground/team/[missionId]/page.tsx`：QualityGapBanner 在 header 下条件渲染（mission completed && qualityGaps[]）

## 元教训

### 1. byte-equal contract 被改 = baseline 数组 + count 注释 + 前端 listener 三处必须同步

- 加 `chapter:sub-section:completed` 时漏改 `EVENT_BASELINE` 数组 + `70 events` 注释，触发 `playground-frontend-contract.spec` 三连红
- **教训**：每加一个 event type 必须 grep 仓内所有 EVENT_BASELINE / 70 events 字符串

### 2. 多组件 P2 不要急着深度集成进 1500 行老页面

- mission detail page 1487 行，原计划全 wire 5 个新组件 + figure renderer 替换，会引入 modal 状态机 / API 新方法 / sourceType 字段在旧 mission 缺失等多重风险
- **教训**：组件 ready 后只做"零侵入" wire（layout 挂 banner / 头部条件渲染 banner），其余靠 PR-10 dual-write 切读源后再上（创建任务 #122）

### 3. dual-write 14d 沉淀期是必须的

- 直接切单轴会让在跑 mission 数据丢字段；必须 backend 同时 read legacy（depth/lengthProfile）+ 推荐写 reportScale，前端两种 UI 共存可切换
- **教训**：任何改"主轴"的重构都按 dual-write phase 推进（W1 加双写 / W14 切读源 / W28 关 dual-write / W90 drop 旧字段）

### 4. SubSection LLM 调用拼接 N 段必须 emit N 次活迹

- LivenessGuard 5 分钟无活迹就杀 mission；deep 档单章 30+ 分钟跑 3 段，中间 emit 缺失会被误杀
- **教训**：长 stage 内部分步必须 emit business 事件（`chapter:sub-section:completed`），不只是 stage:lifecycle

### 5. 硬合约要 qualityGap 不要 fail mission

- 设计冲动是"达不到 contract 就 mission failed"——错。用户已等了 30 分钟 + 花了 budget
- 正确：markCompleted + qualityGaps[]，三种 user action（retry-budget-allowed / accept-as-is / contact-support），**绝不自动退款 + 绝不自动重跑**（CWE-400 死循环）

### 6. CWE-639 在多用户系统的 chapters 表上必出

- 3 个新表 chapters / chapter_figures / chapter_citations 都加了 user_id 列 + 双 WHERE clause（mission_id + user_id）
- **教训**：mission 衍生表都要 user_id（即使 mission 表已有）——避免被 mission 越权访问后顺藤摸瓜

## 接下来

- ✅ #121 P3 ops 已落（commit `dd9ae200a`）：runbook + 老 mission backfill SQL；PR-10/11/12 时间门控由值班按 runbook 触发
- ✅ #122 P3 follow-up 已落（commit `0b8383abe`）：单一重跑入口 + figure AI 水印 + 4 路 review 8 项 P0 收敛（zod payload / chapterIndices 真值 / submit needsConfigure / chapterIndex reset / emoji 红线清零 / zoom modal 水印 / controller 8 spec / modal 9 spec）

## 4 路集体评审血的教训（#122 后增）

**用户挑战 "你的这个方案是经过集体审视共识的？" 后才走 4 路评审**，发现 8 项 P0：

- emoji 红线（CLAUDE.md #5 hard rule）我自己都没清——评审才抓到
- `reportArtifact.sections[].index` 不存在 → revise-chapter 永远不可用（**lying assertion 真实功能 bug**）
- `chapterIndex` 关闭重置漏写
- submit 闭包陷阱（行为对但脆）
- payload 无 zod 校验（CWE-77 / CWE-639 风险）
- zoom modal 缺水印（EU AI Act 合规缺口）
- controller / modal 都缺 spec
- **rerunMission(fresh) + rerunMissionWithIntent('fresh-research') 双源端口**——用户直接喷"为什么要双路径！"，迫使我把"开始/更新"两按钮收敛为单"重跑…"按钮 + 列表快捷重跑也切单源

**Why**：实施轮（implementation）不评审 = 设计轮（design consensus）的 5 路评审被白做。Implementation 期间我自己加的字段命名 / 入口数 / 红线遵守，没人审就一定漂。

**How to apply**：未来即使是已 design-consensus 通过的方案，**实施轮的 PR 也要做最少 4 路评审**（architect / reviewer / security / tester）。不评审就 push = 一定踩 emoji 红线 / dual sources / lying assertion 三件套。判断"实施轴 vs 设计轴"很重要，但不能用"只是实施"当 review 跳过的借口。

## 时间门控关键日期（基线 T = 2026-05-07 commit `8533da47c`）

- T+7d (2026-05-14)：跑 backfill SQL（manual migration）
- T+14d (2026-05-21)：PR-10 切读源（ctx-hydrator + stage-rerun 两处 if-else）
- T+28d (2026-06-04)：PR-11 关 dual-write
- T+90d (2026-08-05)：PR-12 drop 旧表（可选）

## 未做 P1 follow-up

- dual sources 收敛（删 `sourceFigureType` 或 `watermarkOverlayRequired` 之一）
- 删 `POST missions/:id/rerun?mode=fresh|incremental` 老端点（仍兼容当前调用方，下一轮统一用 rerun-with-intent）

## 时间门控关键日期（基线 T = 2026-05-07 commit `8533da47c`）

- T+7d (2026-05-14)：跑 backfill SQL（manual migration）
- T+14d (2026-05-21)：PR-10 切读源（ctx-hydrator + stage-rerun 两处 if-else）
- T+28d (2026-06-04)：PR-11 关 dual-write
- T+90d (2026-08-05)：PR-12 drop 旧表（可选）
