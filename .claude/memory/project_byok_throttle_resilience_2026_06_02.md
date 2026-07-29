---
name: project_byok_throttle_resilience_2026_06_02
description: "研究 mission 章节大面积阵亡根因=弱 provider 节流 401 被当永久失败；智能401重试+rpmLimit 限流（PR#197）"
metadata:
  node_type: memory
  type: project
  originSessionId: 5d5a8932-a233-4533-8956-6e907c4bbe45
---

agent-playground 多维度研究 mission 章节"兜底落地/复审0/100"、per-dim pipeline 异常终止（`[chapter-integrity] expected 4, got 1, ratio 75% > 30%`）的彻底根因（Railway 产线日志实证，2026-06-02）：

**根因链**：chapter-writer 走 TaskProfile 路由到用户 BYOK 默认模型 `agnes-2.0-flash`（Agnes **Starter 套餐 1500 请求/5h、~50 TPS**）。mission 并行峰值 ~6 调用（CHAPTER_CONCURRENCY=2 × 维度 pLimit）打爆弱网关 → 间歇返回 **HTTP 401「无效的令牌」瞬时节流**（铁证：同一把 key 几秒内还成功 tokens=628）。但 `error-classifier.ts:229` 把**任何 401 无条件判 INVALID_API_KEY**，而 `isRetryable()` 不含它 → 调用当场死 → writer-failed/0分 → 缺章 >30%（`chapterToleranceRatio`）→ `validateWrittenChapters` throw 终止 per-dim。**TPS=tokens/sec=生成速度（决定 10-29s 高延迟，成功但慢）≠ 请求配额（1500/5h≈5rpm，才是 401 节流来源）**。15 次 429 是 openalex 取证工具被并行打限流，与章节无关。

**诊断要点**：① writer-failed 路径（`chapter-pipeline.helper.ts:279`）丢弃了 `writerRes.events` 里真实失败码，UI 只见 0/100（诊断盲点）。② **rpmLimit/tpmLimit 是死配置**——UserModelConfig 存了、UI 能填、`getModelConfig` 读得出，但 LLM 调用链（ai-api-caller/ai-chat/failover-caller）一次都不读 → 形同虚设。③ 用 `railway logs --lines N`（已 login，linked Gens.Team/production/backend）拉日志，grep `INVALID_API_KEY|agnes|429|failover` 是定位钥匙。

**修复两层（均在 main）**：

- key-health 侧（另一并发 session 已合 main，commit 6905229d2）：单次 401 不再永久标 DEAD（AUTH_DEAD_THRESHOLD=3 + 60s 有限冷却 + 单 key 兜底 + Test forceHealthy 恢复）。
- 调用+限流侧（本次 **PR#197 = 8ad96fa0e**，作者 gens.teams）：①智能 401 重试——`AiChatRetryService.withExponentialBackoff` 加 opt-in `retryTransient401`，failover caller 在 key 近 15min 成功过（新增 `KeyExecutor.isKeyRecentlyHealthy` 复用 KeyHealthStore）时把 401 当瞬时节流退避重试。②rpmLimit 真正生效——failover caller `paceByConfiguredRpm` 按 `AiModelConfigService.getRateLimitForUserModel(userId,modelId)`（新增，60s 缓存）均匀放行，并发安全时隙预订；严格 opt-in（null/<=0 → no-op）。

**用户侧收尾**：部署 main + 给 agnes-2.0-flash 配 rpmLimit≈5（匹配 Starter 1500/5h）。但 5rpm 对几百次调用的 mission 极慢，建议升套餐或换更快模型当 mission 默认。

**协作踩坑**：① 多 Claude session 共享主工作目录——另一 session 的 BYOK key-health 修复已合 main，建分支时基线已含，勿误判为并发写本分支（`git branch -r --contains <sha>` 验证在不在 origin/main）。② lint-staged ESLint **V8 OOM**（`node::OnFatalError`）→ commit/push 必带 `NODE_OPTIONS=--max-old-space-size=8192`（见 [[feedback_lint_staged_stash_safety]]）。③ 插代码致 capability 基线行号漂移→`node backend/scripts/audit-capability-anti-patterns.cjs --write` re-anchor（count 不变=纯漂移）。承接 [[project_byok_agnes_endpoint_and_crash_recovery_2026_06_01]]
