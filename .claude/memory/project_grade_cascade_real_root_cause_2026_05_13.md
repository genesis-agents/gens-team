---
name: project-grade-cascade-real-root-cause-2026-05-13
description: 'mission f1d9fee0 "AI生成的网络攻击新类型" grade 阶段 state=failed 四层根因（budget exhaust → simple-loop 误报 failed → react-loop log 误报 PROVIDER_API_ERROR → KB source 被 validator 拒触发重试爆 budget）'
metadata:
  node_type: memory
  type: project
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

## Mission f1d9fee0 "AI生成的网络攻击新类型" grade 阶段 state=failed 根因（2026-05-13 Railway prod 日志实证）

**用户报错**："grade 阶段失败（state=failed），无 5 轴评分"

**Railway 日志 smoking gun**（5:34:15）：

```
[MissionAbortRegistry] [abort] mission=f1d9fee0 reason=budget_exhausted
[ReActLoop] iter=1 PROVIDER_API_ERROR — ReAct loop aborted by signal   ← 误导日志
[JudgeService] [judge:self] evaluation failed (abstain): AiChatService.chat aborted
[PlaygroundPipelineDispatcher] mission f1d9fee0 cancelled (abort signal aborted) — skipping mission:failed
```

### 真正的 4 层根因（fix 全部落 commit 待 push）

1. **资源根因（mission-level）**：`MissionBudgetPool.isExhausted()` 在 5:34:15 触发 `abortRegistry.abort(missionId, "budget_exhausted")` —— mission 在 grade 阶段开始前预算耗尽。

2. **代码 bug #1（simple-loop 误报 failed）**：`backend/src/modules/ai-harness/runner/loop/simple-loop.ts:113-121` chat() 抛 abort 异常时直接 `terminated{reason: "error"}` → `drainEvents` 推 state="failed" → `per-dim-pipeline.util.ts:1552` 误报 "grade 阶段失败 state=failed"。
   - **Fix**: catch 内先判 `signal?.aborted || /abort/i.test(message)`，true 时 emit `terminated{reason: "cancelled"}`。

3. **代码 bug #2（log 误导运维）**：`react-loop.ts:866-867` `failureCode` 默认 "PROVIDER_API_ERROR"，即便 aborted=true 也写 log，造成"以为 provider 故障"的误诊。
   - **Fix**: log 内 `loggedCode = aborted ? "CANCELLED" : failureCode`（emit 事件层已用 UNKNOWN/cancelled，只 log 漏过）。

4. **结构性 bug #3（researcher source validator 太严，烧 budget）**：`researcher.agent.ts:391` validator 用 `^https?:|^doi:|^arxiv:|\.` 拒掉 rag-search 返回的 `wiki-page:UUID` 类 KB source → ReAct 反复 reject 重试 → mission 每个 dim 多烧 3× LLM 调用 → budget 提前耗尽。
   - **Fix**: 把 `wiki-page:` / `kb-doc:` / `kb:` 加入 source scheme 白名单。

### 配套观察（未来 fix）

- 第 89 行 ModelPricingRegistry warning: `modelId="grok-3-mini" not in pricing registry` —— admin 必须 seed grok-3-mini 价格行，否则 BudgetAccountant 把 grok-3-mini 调用算作 $0，预算账面失真（不在 budget 失败链路上，但影响 cost 真实性）。
- Mission 跑了 ~8min（5:26 → 5:34）100+ LLM 调用，单 mission 默认 budget 对网络安全这类深度题目过紧 —— 建议 BudgetEstimator 把 "cyber-attack" / "网络攻击" 等关键词识别为 high-complexity tier，提高 cap。

### 关联 memory

- [[feedback_abort_must_have_reason]] —— abort 必须传 reason，否则 UI 看到 "aborted without reason"
- [[project_p1_react_runaway_fix_2026_04_29]] —— retry runaway 与本次"validation reject → 重试爆 budget"同一类
- [[feedback_no_lying_assertion]] —— log "PROVIDER_API_ERROR — ... aborted by signal" 就是 lying log（事件层已是 UNKNOWN，log 层漏修）
