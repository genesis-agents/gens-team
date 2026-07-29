---
name: project_c195035f_data_wipe_2026_05_07
description: 2026-05-07 cascade rerun reset-before-cascade 数据废墟事件 + 治本 + 集体审视为什么 4 路评审漏了
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# c195035f 数据废墟事件复盘（2026-05-07）

## 事件链

1. mission c195035f 跑了 7h（2026-05-07T07:13:28 → 14:00 postlude 完成），原本应该是已完成的 deep mission
2. S11 chapter_content_incomplete guard 拒签 → status=failed
3. 用户 3 次点 S11 重跑：每次 reopen → cascade 第一个 stage rerun-failed → liveness markFailed
4. 第 1-3 次重跑后用户打开 mission 详情页，**任务列表空白**

## 真因

`stage-rerun.dispatcher.runFromStageWithCascade:256`（commit `271318b32`）在 cascade rerun 之前调
`resetFieldsForCascade(missionId, userId, cascadeChain)` —— 把 cascade 链上**所有 stage 的
resetFields 并集** SET NULL（dimensions / theme_summary / outline_plan / analyst_output /
reconciliation_report / report_full / leader_signed / ...）。

cascade 跑失败时**没有任何回滚机制**——主行字段永久 NULL。但子表
`agent_playground_chapter_drafts`（30 行）+ `agent_playground_research_results`（10 行）保留。
前端 mission 详情页从主行读 dimensions=NULL → 渲染"任务列表为空"。

设计文档 v1.2 §3.3 原文："失败 best-effort partial：**已成 patch 保留，未跑下游不动**"
—— 实现完全反着做。

## 治本（commit `608ed7f8e`，2026-05-07）

1. 删 dispatcher 内 `resetFieldsForCascade` 调用 + private 方法（保留
   `collectResetFieldsForCascade` export 给将来按需用）
2. 补 3 个 stage 主动持久化（PR-R4 模式覆盖度补全）：
   - **s2-leader-plan**: 写 dimensions + themeSummary
   - **s5-reconciler**: 写 reconciliationReport
   - **s10-leader-foreword-signoff**: 写 leaderSigned/leaderOverallScore/leaderVerdict
   - 每处加 `typeof deps.store?.markIntermediateState === "function"` 防御 mock 缺漏
3. 反向 spec：cascade 起点 stage 立即抛错 → resetFields/markIntermediateState 都不调 + emit cascade-aborted
4. dispatcher 类 doc 修正 + local-rerun hydrate 注释升级

## 数据救援

从 chapter_drafts(30 行) + dimension:research:started events(10) 反推 dimensions[10] +
themeSummary，UPDATE c195035f 主行恢复任务列表渲染。

## 集体审视：为什么 PR-R1 + PR-R5 4 路评审两轮都漏

**PR-R1 (commit `d0383aec9`) 引入 `resetFields` 字段 + `collectResetFieldsForCascade` 函数**
**PR-R5 (commit `271318b32`) 引入 dispatcher 调 `resetFieldsForCascade`**

R1+R2 集体评审 4 路（architect/security/reviewer/tester）都给过 approved，但**没人发现**：

- reset-before-rerun 模式的失败回滚机制完全缺失
- 设计文档 v1.2 §3.3 写"已成 patch 保留"，实现却"先全清再跑"

### 为什么漏了（4 路各自 blind spot）

1. **architect**：审视了 cascade chain 计算 + state machine 5×5 矩阵，但**没把"破坏性 SQL 操作 + 失败回滚"作为必查项**。reset 看起来"无害"是因为单测 mock 跑成功，没演 cascade 失败 + reset 已生效场景
2. **security**：聚焦 user_id 隔离 / pod 重入 / event order，**没把"数据完整性"当 security 维度**。但数据丢失其实是 P0 安全问题
3. **reviewer**：spec 完全过 — 因为 spec 用"`expect(store.resetFields).toHaveBeenCalledTimes(1)`" positive assertion，**没要求 spec 验证"reset 后有回滚 / cascade 失败时主行字段保留"** 这种 invariant
4. **tester**：盖率断言 reset **被调用** 了，但没盖率断言 reset **失败时数据保留**这种反向证据。spec 测调用，不测语义

### 元教训（必入 review checklist）

1. **任何 `update SET X=NULL` / `delete` / `truncate` 操作必须配对 review "失败时谁恢复 / 事务边界在哪"**。reset/clear/wipe 关键词必触发 backup-restore 拷问
2. **设计文档 v.s. 实现的字面对账**：v1.2 §3.3 写了"已成 patch 保留"但实现"先 reset"——评审时必须把设计文档的 invariant 名字 grep 实现验证。"best-effort partial" 这种关键词出现在设计里时，spec 必须有反向证据 case
3. **跨 PR 落地的依赖必须有 invariant 测试**：PR-R4 (markIntermediateState) 是 PR-R5 (reset-before-cascade) 的安全前提。但 PR-R5 评审时没有 spec 断言 "11 个 stage 全部 markIntermediateState"。该断言可作为 architecture spec 自动对账（grep dbWrites vs markIntermediateState 调用）
4. **数据丢失是 P0**：所有 mutation 路径必有反向证据 spec —— "失败时主行字段保持原值"
5. **architect 评审必读 dbWrites + resetFields 列表**：cascade 改动必须人工对照 dbWrites 与 markIntermediateState 调用矩阵
6. **dispatcher 内任何 destructive operation 在 try 外做的**都是危险信号：try 内失败无法回滚 = 数据丢失

### 这次评审为什么发现了（R1 + R2）

- 用户 prod 真出事 → 给 4 路评审具体的"想象失败场景"，不再是抽象
- architect 主动 grep 了 dbWrites vs markIntermediateState 调用矩阵（10 stage × 1 个表），发现 7/12 缺失
- tester 强调反向证据（"调用 0 次"+"主行字段保留"双重断言）
- security 看 markFailed 字段范围，确认数据保留路径
- reviewer 注意 collectResetFieldsForCascade 的 dead-export 状态

## 落地约束（必须）

未来 cascade 类改动 PR 必须：

1. 设计文档 invariant 关键词 → 反向证据 spec
2. 所有 destructive SQL → 配对 backup-restore 或事务回滚审视
3. dbWrites 声明 + markIntermediateState 实现 → architecture spec 自动对账（建议加 boot-time 校验脚本）

## 关联

- 引入 commit: `d0383aec9` (PR-R1) + `271318b32` (PR-R5)
- 治本 commit: `608ed7f8e` (cascade reset 删除 + s2/s5/s10 主动持久化)
- 关联 memory:
  - `project_per_task_rerun_R0_R8_complete_2026_05_07.md` (PR-R0~R8 全 8 commit 落地)
  - `project_pr_r5b_full_2026_05_07.md` (PR-R5b-FULL 11 stage 真 handler)
  - `feedback_consensus_must_iterate_to_all_yes.md` (4/4 共识规则)
