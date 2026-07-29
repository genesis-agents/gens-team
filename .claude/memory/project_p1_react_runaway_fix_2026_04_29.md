---
name: p1-react-runaway-fix-2026-04-29
description: agent-playground retry researcher 不收敛死循环（44min 单 dim）真因 + 7 处修复
type: project
originSessionId: 934e062b-4ec2-4c51-ab14-dd22211aa01a
---

## 问题（mission 8c7b4358 现网案例）

playground mission `美国AI宏观洞察 / depth=deep` 跑到 leader patch 阶段后 retry researcher 卡 44+ 分钟单维度，researcher#0 跑 60+ ReAct 拍始终不 finalize，最终被手动 stop（status=failed）。

**Why:** 三处叠加：

1. researcher base budget `maxIterations=5`，但 budgetMultiplier 7.28× 在 `agent-runner.scaleIters` 把它放大到 36 → LLM 永远有"再搜一轮"的余地
2. leader critique 太刚性（"补齐 5-7 一手源 + 2 州法 + 1 执行案例"）+ researcher prompt 写"Target 4-5 findings"矛盾，LLM 选服从更具体的 critique
3. ReAct 缺"逼近上限时强塞 finalize" 信号，maxIterations 才是死循环唯一兜底

## 修复（7 处，2026-04-29 已落地）

1. `agent-event.interface.ts`: 新增 `iteration_progress` 事件类型 + IIterationProgressEvent
2. `agent-spec.base.ts`: budget 加 `maxIterationsHardCap?: number` 字段
3. `agent-runner.service.ts` scaleIters: 缩放后 clamp 到 hardCap
4. `react-loop.ts`: 每轮 emit iteration_progress；iter ≥ maxIter-2 时 envelope 注入 system reminder 强制 finalize
5. `researcher.agent.ts`: `maxIterationsHardCap: 10` + critique 末尾退出闸（"3 轮后必须 finalize，质量 > 完整"）
6. `agent-invoker.service.ts`: 转发 iteration_progress → `agent-playground.iteration:progress` mission 事件
7. `s4-leader-assess-research.stage.ts`: 加 `dimension:retry-phase:started/completed` 里程碑事件

**How to apply:**

- 类似"LLM 自决退出"场景必加硬上限（multiplier 不能放大决策边界）
- 任何长链路 ReAct/ReAct-like agent 必须每轮 emit progress 事件，不能让 UI silent
- critique 模板必须含"good enough" 退出条件，否则 LLM 死磕原刚性清单
- 测试中可用 maxIterations=5 + iter=2 → approachingLimit=false 验证（5-2=3>2）

## 监控盲区教训

mission 后端 alive（events 每 GAP<60s 在产、status=running）但前端用户感知"挂了" —— 我从 DB 视角看不到 websocket 状态。今后类似监控要双指标：

- 后端事件流 GAP（DB 角度的 alive）
- 前端 socket 心跳（用户角度的 alive）

只看一边会错判。
