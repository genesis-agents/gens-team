---
name: 2026-04-30 Railway pod 心跳回收造成 mission 系统性失败
description: 6 个 PR 连推后所有 mission 在 14-138s 死于 pod 心跳丢失 > 2min；buildSha 卡在 PR-D 不前进；与 PR 内容无关，是 Railway 基础设施问题
type: project
originSessionId: ccbd980d-4dd8-4cfe-819e-c57149f57eb0
---

# Railway pod heartbeat recycle (2026-04-30)

## 现场

时间：2026-04-30 23:30 - 2026-05-01 03:15 UTC

**Why:** 用户要求"触发新 mission 监控验证报告质量"，但触发 5 次都被 pod
回收杀死（duration 11-138s），无法产出报告做质量审计。

**How to apply:** 短时间内连推多个 PR 后避免立即触发 mission；先确认
buildSha 推进到 HEAD + 等 5+ 分钟再触发。如果 buildSha 不前进，可能是
Railway 构建失败回滚，需要查看 Railway 控制台日志。

## 症状

- 5 个 mission 连续失败：cec69a3b / 4e681540 / 874c9e43 / b0499c6a / 1872f10f
- 全部死于 "Mission 进程在执行过程中被回收（pod 心跳丢失 > 2min）"
- Duration 仅 11-138s（远短于 standard 25min wall-time）
- last_event 多为 `agent-playground.iteration:progress` —— mission 在跑但
  没等到 finalize 就被杀
- `/health` 200 OK，buildSha 卡在 `6bd22338b8` (PR-D)，未推进到 HEAD
  `0bc075661` (PR-F)
- 上一次成功 mission 是 4fd5efa1（执行 4341s = 72min），churn 从此后开始

## 推测原因（无 Railway 日志，只能推测）

1. 我连推 6 个 PR (a4b5b0e62 → 0bc075661) 中某个的 build 失败
   → Railway 进入 retry 循环
   → web pod 上 health 还能响应（旧 build 还在），但 worker pod 被反复
   重启，杀掉所有运行中的 mission
2. 或者：某个 PR 引入了 OOM / process exit，pod 跑一会就崩
3. heartbeat 阈值（2min）对 reasoning 模型 LLM 调用太紧 —— 单次 call
   60-120s 时心跳没机会更新

## 之前的同类记忆

参考 `project_harness_stateless_phase9_2026_04_30.md` —— Phase 1 已把
内存 Map 外置到 Redis + heartbeat-based orphan 检测。但当前现象暗示
heartbeat 实现可能仍有 race condition（pod 仍在跑但 watchdog 误判
orphan）。

## Action items

- [ ] 检查 Railway 控制台看哪个 commit deploy 失败
- [ ] heartbeat orphan 检测：放宽阈值 2min → 5min（reasoning 模型单次
      调用可达 232s/162s/156s，2min 必然误杀）
- [ ] heartbeat 写入应该在 LLM call 中途也定期更新，不只是 iteration
      边界（防长 LLM call 期间 watchdog 误杀）

## 影响 monitoring 验证

PR-A ~ PR-F (6 个报告质量整改) **代码已上线 PR-D 部分**，但无法通过
新 mission 完成验证（pod 一直死）。质量审计脚本 ready 在
`debug/audit-mission-cec69a3b.js`，等 pod 稳定后用任何成功 mission ID
跑即可。
