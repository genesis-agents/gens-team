---
name: 取消遮蔽派生错误 + Reflexion 低分阈值
description: 2026-04-30 mission 8e77271d 实证 — cancel-ghost + reflexion 75/100 阈值导致 60-74 partial output 反复 fail，已落 commit f955b9ae1
type: project
originSessionId: 1eeec69c-2d84-4aa2-bd93-d546b59ca998
---

P0-LIVE-CANCEL-GHOST + P0-LIVE-REFLEXION-LOW-SCORE — 2026-04-30 mission 8e77271d 真因 + 修复

**Why**: mission 8e77271d 用户 13:49:43 点取消 → abortController.abort("user_cancelled")，
但 mission 主流程没立即退出，下游 stage（reconciler/analyst）继续跑：每个 agent 入口
signal.aborted 即退出但 wallTimeMs=2-5ms iterations=0 未产 output → schema_mismatch
派生错误 → s6 throw → 顶部 banner 显示"Analyst 综合阶段连续 2 次未产出"，"用户取消"
真因被彻底遮蔽。同一 mission outline/chapter-writer 评分 62-67/100 < 75 阈值反复 fail，
但都是已经写出 draft 的 partial output，"差强人意"比"整章重写到死循环或空"好得多。

**How to apply**:

- runMissionBody 关键 stage 边界要 checkAbort()，aborted 直接 throw 跳出（不再跑后续 stage 制造假错误）
- catch 检测 wasCancelled 时**不**发 mission:failed，cancel 真因由 abortRegistry.abort()
  调用方（controller / wallTimer）emit 的 mission:cancelled 承担
- ReflexionLoop 默认 passThreshold = 60（不是 75），让 60-74 内容通过；
  agent-runner 标 degraded，per-dim-pipeline / role services 已修过接受 degraded
- caller 显式覆盖 passThreshold > 60 默认（高质量场景仍可 75/85）
- 测试要点：mock MissionAbortRegistry 必须包含 isAborted/getSignal；
  cancel 路径单测断言 "no mission:failed event emitted"，不再断言 failureCode
