---
name: project_pr_r5b_a6a7a8_consensus_2026_05_07
description: PR-R5b + A6/A7/A8 单批落地 + 3 轮 4 路集体评审共识达成 commit f8075a1c3 push 成功（s11 真 handler / 前端 rehype-sanitize / legacy fuzzy / sanitizer metrics）
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# PR-R5b + A6/A7/A8 单批共识落地（2026-05-07 commit f8075a1c3）

## 范围（一气呵成）

**PR-R5b**：让 c195035f 类 mission（status=failed + reportFull=null + chapter_drafts 有 13/14 章节 'failed-finalized'）能就地入库

- mission-store.markCompleted 加 userId 第三参
- handleS11Persist 真 handler（ctx.reportArtifact 优先 / fallback rebuildArtifactFromDrafts）
- rebuildArtifactFromDrafts.where.status.in 含 'failed-finalized'
- saveReportVersion(triggerType='todo-rerun') fire-and-forget
- LEADER_VERDICT_AUTO_RERUN_RECOVERED 抽到 types/leader-verdict.types.ts + frontend/lib/types/leader-verdict.ts 镜像
- recoveryDegraded + recoveryMode='chapter_drafts_rebuild' 显式降级标记

**PR-A6**：前端 rehype-sanitize + per-workspace feature flag

- ArtifactMarkdown 顺序：[rehypeKatex, rehypeSanitize]（sanitize 必须放最后）
- katexAwareSchema：'style' 从 `'*'` 移除，仅 KATEX_TAG_NAMES + svg/path 上放行
- FeatureFlagService（@Global）+ audit log + grant/revoke

**PR-A7**：legacy assembler invariant fallback

- buildSectionTree 改 exact match → fuzzyMatchDimension（exact / includes 启发式 / LCS DP）
- missing-dim zero-width 占位 + 严格单调虚拟 offset (eofOffset+i+1)

**PR-A8**：sanitizer metrics 监控

- SanitizerMetricsService（in-memory record/snapshot/reset）
- StructuralReportAssembler @Optional 注入 + segmentName='dim:${sanitizeMetricsLabel(dim.id)}'
- sanitizeMetricsLabel 含 base64url fallback（中文不撞库 — 全 ASCII 直接用，含特殊字符走 b64\_）

## 共识三轮迭代（4 路：architect / security / reviewer / tester）

**R1**：5 P0 / 11 P1 — 部分 APPROVED with conditions
**R2**：3 新 P0（leaderVerdict union 缺值 / styleProfile-audienceProfile 非法 enum / 中文 metrics 撞库） + 4 新 P1
**R3**：4/4 全 YES → push

## 关键反向洞察

1. **rehype-sanitize 顺序**：rehype-sanitize 官方 README "put it last in the list" — 反过来跑会让 KaTeX 输出的 SVG/MathML 完全绕过 sanitize（CVE 时 XSS 直接落地）
2. **缺省字面量必须用合法 union 值**：`?? "analytical"` / `?? "professional"` 不在 ArtifactMetadata.styleProfile/audienceProfile 的 union 中 — TS `??` 不针对右侧字面量做 narrow 校验，靠运行时数据完整性 spec 才能发现
3. **base64url 保唯一性**：纯字符 sanitize（`[^a-zA-Z0-9_\-]/g, "_"`）会让"宏观环境"和"微观经济"撞同一 metrics label；改用 ASCII pass-through + base64url fallback 既保唯一又 Prometheus 兼容
4. **contract drift 单一源**：LEADER_VERDICT_AUTO_RERUN_RECOVERED 必须前后端各有一份 types 文件 + 字面量同步（参考 feedback_unitrack_audit_must_check_consumer.md），不能在 dispatcher.ts 内联

## How to apply

下次涉及"前端枚举 union + 后端字面量写入"组合改动时：

1. 后端字面量 → 抽 const 到 types/\*.types.ts 单一源
2. 前端镜像同名常量 + 同名 union（lib/types/\*.ts）
3. 改任何一边时立即跑 `npx tsc --noEmit` 双侧验证

下次涉及"fallback 缺省字面量"时：

1. grep DTO 里同名字段的 union 值 → 缺省必须从 union 选
2. 不要凭直觉写 `?? "analytical"` — TS 类型推断不查右侧字面量合法性

下次涉及"用户输入做 metrics label"时：

1. ASCII safe 用 pass-through + slice(64)
2. 含非 ASCII 字符 → base64url（`+` → `-` / `/` → `_` / `=` → 删 / 加 `b64_` 前缀）
