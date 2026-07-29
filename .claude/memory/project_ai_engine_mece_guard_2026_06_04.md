---
name: project_ai_engine_mece_guard_2026_06_04
description: ai-engine 12 聚合递归子目录 MECE 审计→规则→看护 spec→W1-W6 整改全落地（PR
metadata:
  node_type: memory
  type: project
  originSessionId: 2095e9f1-8906-4d95-8427-22adc900ea49
---

# ai-engine 递归子目录 MECE 治理（2026-06-04，全部已合 main）

2026-06-04 对 `backend/src/modules/ai-engine/` 12 聚合做递归全量审计（5 并行 agent 实读每聚合），产出"规则→看护→整改"三段式，**全部 merged**。承接 [[project_ai_layer_mece_audit_2026_06_02]]。

**规则+看护（PR #274）**：`standards/16 §五·补` 加每聚合目标子目录表 + **6 条律**；新 spec `backend/src/__tests__/architecture/layer-4-vocabulary/ai-engine-structure.spec.ts`（进 verify:arch，shrink-allowlist 模式，搬一个删一行清空即焊 0）。律1 顶层 12 聚合 · 律2 禁 utils/helpers/common/misc · 律3 禁 runtime/kernel/execution/process/governance/ecosystem（tools/categories/\* 除外）· 律4 R1 engine 禁查 prisma.agentProcess/mission · 律5 LlmRerankerAdapter 单一权威 · 律6 禁 IAgentSpec/agent-spec。**现 6 律全 allowlist 清空=硬焊 0**。R2(0 controller)归 no-http-in-lower-layers.spec 不重复。

**整改 6 波（每波独立 PR，type-check+verify:arch 当 oracle）**：

- **W1 #275**：rerank 去重，**引擎版 knowledge/rerank 为权威**，删 ai-app/insight 本地副本，insight 经 ai-engine/facade 消费（DataSourceResult 走泛型 rerank<T>）。
- **W2 #278**：capability-guard.service 从 safety/security **迁回 ai-harness/guardrails/capability**（查 agentProcess=agent 状态；原 PR-X3 误置 engine）；engine `IAgentSpec`→`ISkillExecSpec`（与 harness канonical IAgentSpec 撞名+R1 词汇泄漏，spec-builder 留 engine）。
- **W3 #276**：safety/utils 拆（error-detection→reliability、figure-url-sanitizer→content/figure）；skills/runtime→**integration**、skills/ecosystem→**marketplace**。
- **W4 #279**：删死分区 facade/exports/\*（5 文件 0 引用）。
- **W5 #280**：knowledge/search（web egress：Tavily/Serper/DDG）→ **content/web-search**（与 content/fetch 同族，保 12 聚合），新 WebSearchModule，SearchResult→WebSearchResult 解与 rag 撞名。
- **W6 #281**：index.ts/module JSDoc 同步 12 聚合；routing/eval→**benchmark**；entity-health 头注释澄清=circuit-breaker 模式；Gemini 能力纠正字面量抽常量。

**accepted（已读码判定非违规，勿再 flag）**：① facade/index.ts 深穿 L1 credential 内部路径=**有意 circular-load 规避**（779-784 注释：走 platform barrel 会 export\* 拉大加载图崩，byok/admin eslint 豁免直引）② R6 `gemini-2.0-flash-exp`/`rerank-v3.5`=provider 必传 API 参数（非 TaskProfile 默认，`""` 会 break）③ planning.module DI-host 3 个 knowledge service=挪注册有 boot-DI break 风险（6-9 消费方经 @Global ai-engine.module 注入），cosmetic 收益留 accepted。

**坑**：harness invoker 深引 error-detection 是**有意**避 facade circular-load（call site 注释），迁移只改路径段勿改走 facade；改 ai-direct-key 插行后 `audit:capability` 行号 baseline 漂移需 `npm run audit:capability:update`（184→184 无新增即纯行移）；改 skills/runtime 名要同步 layer-boundaries.spec 的 engine-skill-provider adapter allowlist 路径。push 到本 remote 常被后台化且 ref 可见有延迟，建 PR 前先 git ls-remote 确认。
