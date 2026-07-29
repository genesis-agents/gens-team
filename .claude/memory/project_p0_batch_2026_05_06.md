---
name: project_p0_batch_2026_05_06
description: 2026-05-06 audit 报告 10 项 P0 批量修复落地状态（含每项 file:line + 验证结论）
type: project
originSessionId: 0466edf1-314f-494e-bc8e-163445d754ad
---

2026-05-06 sub-agent 4 路并行审计回 8.2/10 maturity 报告，列 10 P0 风险（playground 业务链 corner case），分批闭环。

**P0 修复全表（含验证）**：

| #     | 风险                                                            | 修复点                                                                                                                                           | 状态    |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| P0-1  | wall-timer 内 emit 抛异常吞掉 abort 调用，mission 失去看门狗    | mission-runtime-shell.service.ts:69-100 try-finally 包 emit + abort                                                                              | ✓       |
| P0-2  | fire-and-forget emit 无 catch，emit 失败时 Railway 看不到日志   | sub-agent a3d268ae 同类清零（per-dim-pipeline + dispatcher + stages 全扫，每个 emit 加 .catch + log.warn）                                       | ✓       |
| P0-3  | S10 没 return leaderSignOff，担心 S11 拿不到                    | 实际通过 ctx.leaderSignOff mutation → dispatcher entry.lastLeaderSignOff (line 1778) → S11 result.leaderSignOff (line 1826) 链路完整。**无需改** | 验证 OK |
| P0-4  | lengthProfile 承诺 25K 字但实际 5K，leader signoff 阈值过严     | s10:HARD_FLOOR_WORDS=500 + Math.max(targetWords \* MIN_RATIO, HARD_FLOOR_WORDS)                                                                  | ✓       |
| P0-5a | S3 Phase B Promise.all 一个 dim 同步 throw 全 dim 丢结果        | s3 line 141-162 Promise.all → Promise.allSettled，rejected dim 回退到 Phase A research 结果                                                      | ✓       |
| P0-6  | reflexion remediation 无 hard cap 风险                          | per-dim-pipeline line 656 已有 MAX_REVISION_ATTEMPTS cap，s8 line 354 已有 MAX_WRITER_ATTEMPTS cap。**无需改**                                   | 验证 OK |
| P0-7  | dispatcher errorMessage 对非 Error 对象 silent                  | playground-pipeline-dispatcher line 1187 JSON.stringify 兜底（最多 2000 字）                                                                     | ✓       |
| P0-8  | leaderSignOff 拒签缺 refusalReason 字段，前端不知原因           | s10:46 forcedUnsigned() 强制收 refusalReason 参数 + 5 路径全传 + insufficient_content path 显式赋                                                | ✓       |
| P0-9  | markStageComplete 并发 race 把 status='failed' 改回 'completed' | mission-store updateMany where status='running' 守护                                                                                             | ✓       |
| P0-10 | leaderOverallScore != null 误判为拒签，写脏 leaderSigned=false  | mission-store isLeadRefusal 改 `data.leaderSigned === false` only + s11 path 1 删 leaderSigned/leaderVerdict 让走 markFailed 而非 quality-failed | ✓       |

**验证策略**：

- typecheck + jest 关键 spec（s3/s10/s11/per-dim-pipeline）确保不退化
- 全 80 events 已 zod schema 化（emit 入口校验）
- contract drift spec + ErrorBoundary + lying assertion lint 三层防护

**Why**: 2026-05-06 用户明确指令"持续循环迭代直到所有问题都解决"，audit 8.2/10 mature 不能松懈。

**How to apply**: 后续 playground 修改如再触发同类风险，先查这张表是否已闭，避免重复修。
