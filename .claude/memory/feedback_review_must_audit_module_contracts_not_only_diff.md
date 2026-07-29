---
name: feedback_review_must_audit_module_contracts_not_only_diff
description: '多路评审默认只审 git diff 改动文件 → latent contract bug 漏到生产；必须额外加 1 路"全模块 contract 一致性 + 真实 happy path 跑通"专项审'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

5 路评审走完全 APPROVE，1 天内仍漏掉生产 P0：iPhone 用户 7/7 候选 fail 400 + 循环重试日志风暴。bug 根因是 `confidence` 字段在 4 处定义不一致（discovery prompt 0-1 / source-curator SKILL.md 0-100 / entity-extractor SKILL.md 0-100 / DTO @IsInt @Max(100)）—— 经典 `feedback_no_dual_sources`，但 reviewer 没发现。

**Why reviewer 漏了**：

1. 评审 prompt 默认 scope = 「git diff HEAD 改动文件」，本次 diff 不含 `recommend-sources.dto.ts`、`SKILL.md`、`radar-discovery.stage.ts`，reviewer 完全不看
2. 五路分工聚焦"我新写的代码合规度"（公共复用 / 视觉 / 边界 / 回归 / 架构红线），没有任何一路"全模块横向一致性 + 真发 E2E"
3. type-check 全绿 + 单元测试全绿 = 假安全感；contract drift 不是类型问题（DTO 内部自洽），是跨文件**语义**漂移
4. 没有真在 iPhone / 浏览器走一次完整链路（违反 [[feedback_e2e_must_visit_ui]] + [[feedback_test_connection_must_verify_runtime]]）

**How to apply**：

任何 ai-app 改动 PR，5 路评审必须加 1 路「**module-contract auditor**」做下面 5 件事，与 diff scope 解耦：

| 检查                                                                                                                                          | 命令                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 全模块 grep 关键字段（confidence/score/threshold/status/budget…）在 prompt + SKILL.md + DTO + schema + 前端 type 是否一致                     | `grep -rn confidence backend/src/modules/<mod>/ frontend/services/<mod>/ frontend/types/` |
| 找消费方与生产方契约：LLM 输出（prompt 文档）→ 解析（stage）→ 入库（service）→ API 出参（DTO）→ 前端 type → UI 渲染，全链路每一跳取值范围对齐 | 顺读 6 跳，每跳贴 line:n                                                                  |
| 静态发现 DTO 与生产方契约的范围差异（@Min/@Max/@IsInt vs prompt 描述）                                                                        | grep `@Is(Int\|Number)` + 比 prompt                                                       |
| **真发一次 happy path**：选一个生产真实 payload（例如 7 个 LLM 候选）走 controller → service 全链路 spec / 或 staging URL 真发                | `jest e2e ` / `curl staging`                                                              |
| 模块内任意"AI prompt 写 X" + "DTO 校验 Y" 不等价 = P0 阻止合并                                                                                | reviewer 直接 ❌                                                                          |

并修编排：5 路 R1 评审分工里把第 5 路从「架构红线」拆为「架构红线 + module-contract」，或独立加第 6 路。`prompt scope` 里明确写："**请 grep 全模块跨文件 contract，不要只看 git diff**"。

参见 [[feedback_no_dual_sources]] / [[feedback_fallback_must_be_self_consistent]] / [[feedback_implementation_rounds_need_review_too]] / [[feedback_unitrack_audit_must_check_consumer]] / [[feedback_e2e_must_visit_ui]] / [[feedback_5_reviewer_parallel_audit]]。
