---
name: project_secret_audit_three_principles_2026_05_12
description: 2026-05-12 4 路秘钥管理深度审视——三条原则（BYOK 单源/系统授权归 BYOK/消费在 BYOK）整体 5.9/10，最严重是 chat+image+teams 三大入口绕过 BYOK + 工具层完全在 BYOK 体系外
metadata:
  node_type: memory
  type: project
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

# 三条用户原则

1. 用户 API KEY 必须 BYOK
2. 用户向系统申请 KEY/模型，admin 审批后这部分配额也归属 BYOK（管理员授予用户）
3. 系统管理员秘钥管理用于池化 + 向用户授权，**真正的消费都在 BYOK**

# 综合合规度：5.9/10

| 维度               | 合规度 | 简评                                                                                  |
| ------------------ | ------ | ------------------------------------------------------------------------------------- |
| P1 数据模型层      | 7.5/10 | KeyAssignment.modelDbId FK 已落，但 AIModel.apiKey 明文列 + Secret/SecretKey 双源残留 |
| P2 消费路径（LLM） | 5.5/10 | chat 主路径/image/teams 三大入口绕过 pickBYOKModelForUser → 违反原则 3                |
| P3 授权工单流      | 8.5/10 | 最健康；端到端闭环 + 统一入口；STALE→ACTIVE 反向恢复未实现                            |
| P4 工具 Secret 层  | 2.0/10 | 工具 KEY 完全在 BYOK 体系外（admin 池化 + 系统消费），违反原则 1+3                    |

# P0 必修（违反原则 3，最直接）

1. **chat 主路径接入 pickBYOKModelForUser**（ai-chat.service.ts:1622-1697）—— 当前选模型自走 findUserDefaultByType + getDefaultModelByType，未调 BYOK 单源函数；memory feedback_unified_byok_single_function 声明的 ✅ 名不副实
2. **image 生成接入 BYOK**（image-generation.service.ts:67-79）—— getApiKeyForModel 只读 model.secretKey/model.apiKey，所有 AI Image 全吃 SYSTEM key
3. **teams function-calling 接入 BYOK**（function-calling-llm.adapter.ts:431-471）—— prisma.aIModel.findFirst + secretsService.getValueInternal + aiModel.apiKey 三件套绕过；AI Teams 辩论高频消费

# P1 重要

4. **AIModel.apiKey 明文列废弃收尾**（schema:2520-2521）—— 仍被 6 处生产代码消费（quota.service.ts:266 / key-assignments.service.ts:662 / admin.service.ts:895 等），双源残留
5. **Secret 删除级联补 ToolConfig.secretKey**（secrets.service.ts:561 getReferences 仅查 aIModel.apiKey）—— 删 Secret 后工具直接 fail
6. **STALE→ACTIVE 反向恢复**（byok-maintenance.scheduler.ts:69 注释承诺但 admin enableModel 未触发）

# P2 体系级缺口（违反原则 1）

7. **工具层完全无 BYOK**：UserApiKey schema 无 toolId/keyType 字段；KeyAssignment.modelDbId FK→AIModel 物理上无法授权工具 KEY；用户不能自配 Tavily/SerpApi
   - 候选方案：UserApiKey 加 keyType=LLM|TOOL 维度 + KeyAssignment 加 toolId 多态 FK
8. **统一 resolveToolApiKey(toolId, userId?) 不存在**：LLM 走 KeyResolver、工具走 PolicyDataService、search 走 SecretsService 直查；3 路 fallback 各自实现
9. **工具消费无 userId 维度**：PolicyDataService.markKeyFailed/getApiKey 入参均无 userId；admin 池配额耗尽 = 全员断供，无用户归属

# 元教训

1. **"声明"≠"落地"**：memory feedback_unified_byok_single_function 列 6 个 ✅ 实际只有 2 个真走单源；声明完必须真 grep 验证
2. **原则 3 在 LLM 层落了一半，工具层完全没落**：项目主要精力花在 LLM Key，忘了 secret 还有第二个大类（工具 API）
3. **AIModel.apiKey 明文列是双源温床**：每次新功能都"图方便"读它，最终成 6 处消费方；废弃迁移要彻底+pre-push 拦
4. **入口 ≠ 消费方**：admin 看到"配置入口已收敛"不等于"运行时消费已收敛"；下次审视必须从消费侧反查

# How to apply

- 用户问"秘钥管理还有什么问题"→ 回三条原则对照表 + P0/P1/P2 分级
- 接到任何 BYOK 相关 PR → 必查"是否走 pickBYOKModelForUser / KeyResolver / 是否记 userSpendCents"
- 接到工具相关 bug → 警觉是否要立项把工具层接入 BYOK（架构级重构）
- 推荐先做 P0（3 个 LLM 入口），P1 同 PR 收尾 AIModel.apiKey 废弃，P2 立项工具层 BYOK 化（跨 schema + 10+ tool executor）
