---
name: feedback-kb-silent-429-failmodes
description: '长耗时批处理（KB 向量化等）的 429/熔断/吞错三连必须显式破除——前端要看到进度，全失败/部分失败要切 ERROR 红，否则用户看到 "0 向量已就绪" 假成功'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6f88d14d-3d90-467a-b940-ff29c27662ce
---

长耗时批处理任务（KB 向量化、批量导入、大文件抓取）有三个反复出现的反模式，**任何新批处理流程必修破除**：

## 反模式三连

### 1. 静默吞错 batch（最高频）

```ts
for batch in batches:
  try { processBatch() }
  catch (e) { logger.error(e); /* continue */ }  // ← 静默吞掉
return generatedCount; // 可能 0
```

429 限流触发熔断后，**后续每个 batch 立刻抛 circuit-open，全部被 catch**，但函数仍返回 "成功"。

### 2. 上层状态机撒谎

调用方拿到 `generatedCount=0` 但**不判断**就强切 READY/SUCCESS：

```ts
const count = await processor.run(); // 可能 0
await db.update({ status: READY, lastSyncedAt: new Date() }); // 不管 count 多少
```

UI 看到 "就绪 0 向量"，用户报 bug 才发现。

### 3. 零进度

长任务跑 5-20 分钟，UI 只有 "处理中..." spinner，**没有 X/N batch、没有 ETA、没有 cooldown 提示**。spinner 停 ≠ 成功，但用户没法区分。

## 修复必备四件套

**Why**：2026-05-12 KB "算力底座A" 155 chunks/0 向量 事件 + 此前 explore/youtube 字幕沉默失败、industry-report 调用 6.4% 都属同一族。

**How to apply**：长耗时批处理的 PR 检查四点：

1. **进度持久化**：DB 列 `progressJson JSONB` `{stage, processed, total, startedAt, cooldownUntil?, lastError?}`，每个 batch 完成后写。前端 2-3s 轮询 `/progress`，按 `progress.stage` 显示"运行中"/"限流冷却中 23s"。
2. **熔断自动恢复**：catch 错误 → 解析 `cooldown until <ISO>` → `await sleep(diff)` → 同 batch 重试一次。最多重试 1 次防死循环。
3. **结果结构化返回**：不返回 `number`，返回 `{generatedCount, totalNeeded, failedBatches, lastError?}`，让调用方能判 0/X/N 三态。
4. **上层 fail-loud**：
   - `generatedCount === 0 && totalNeeded > 0` → status = ERROR + lastError "上游限流 429..."
   - `generatedCount < totalNeeded` → status = ERROR + "部分失败 X/N"
   - 全成功才切 READY + lastSyncedAt

UI 配套：ERROR 状态显示红色横幅 + lastError + "重试" 按钮，不能只靠 spinner 隐式表达。

## 友邻规则

与 [[feedback_e2e_must_visit_ui]]、[[feedback_idempotent_backend_ui_lying_success]]、[[feedback_no_causal_inversion]] 同源——都属于"UI 状态与真实数据脱钩"的撒谎家族。
