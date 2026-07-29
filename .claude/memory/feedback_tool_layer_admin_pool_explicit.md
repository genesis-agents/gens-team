---
name: feedback-tool-layer-admin-pool-explicit
description: 工具层 (Tavily/SerpApi/YouTube/etc 第三方 API KEY) 显式保持 admin 池化 + 系统消费，不纳入 BYOK；用户配置体验代价过大
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

## 规则

**原则 3「真正消费在 BYOK」仅适用 LLM 层；工具层（第三方 API KEY）显式例外，继续 admin 池化 + 系统消费。**

**Why:** 2026-05-12 用户拍板——"工具层配置过于复杂，交给用户会导致体验很差"。Tavily/SerpApi/Google Search/YouTube API 等工具凭证：

- 用户自己注册账号 + 拿 KEY + 填 endpoint + 维护配额 = 远比 LLM provider 重
- 大多数用户不会去做这些
- 强 BYOK 会导致工具不可用 / 用户配置失败 / 服务降级

LLM 层不一样：用户用 ChatGPT/Claude/Gemini 已是常态，配 BYOK 的认知和操作成本低。

## How to apply

- 下次秘钥管理审视时，**不要把工具层 admin 池化判为"违反 BYOK 原则"**——这是显式例外
- 工具 KEY 的存储/池化/统一 resolver 仍可优化（清理双源、加 resolveToolApiKey 单函数、Secret 删除级联），但**消费侧维持 admin**
- 用户视角："admin 给我池化的工具能力" ≠ "需要我自己配工具 KEY"
- 工具消费的 cost attribution 维度（userSpendCents）可选实现，但**不要求**工具 KEY 走 BYOK 三层

## 相关

- [[project_secret_audit_three_principles_2026_05_12]] — 审视报告 P4 工具层 2/10 实际不算违反，是显式架构选择
- [[feedback_unified_byok_single_function]] — BYOK 单函数原则只覆盖 LLM 入口
