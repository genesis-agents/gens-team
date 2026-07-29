---
name: project-monetization-design-2026-05-28
description: 商业化系统设计方向（订阅制为主 + Free-tier BYOK + 统一 Credit 计量），含待 Owner 拍板的 strict-BYOK 反转决策
metadata:
  node_type: memory
  type: project
  originSessionId: 9ec0f893-2ab7-467e-9a48-4dfc106b5c4c
---

2026-05-28 与 Owner 敲定商业化方向，设计文档 `docs/architecture/monetization/subscription-byok-credit-system-design.md`（v1.1）。

**⏸ 状态：暂挂，待 BYOK 凭据加固后刷新**。

**BYOK 工具/技能全量化重构已合并主干（`ef3ef60a7`，2026-05-28）**：用户模型/工具/技能改用自己的资源（search/finance/academic/extraction/youtube/tts 运行时都接了 `ToolKeyResolverService`）。我读码评审后的结论：

- **变现刷新结论已明确**：credit 判定从"能力类型(LLM/tool/skill)"翻转为"**key 归属**"——`ToolKeyResolver.source=user`（自带 key）免费（用户自付 provider），`granted`/`admin-fallback`/`system`（平台掏钱）才扣 credit。MeteringService 挂这两个分支即可，不另造。D3/§6/§8/O1 待据此改写。
- **但先做 BYOK 凭据加固**（Owner 2026-05-28 拍板"加固方案先行"）。原因：实现虽合理但低于业界 BP——AES-CBC（非 GCM）、env 主密钥无 KMS/信封加密、无轮换、**用户工具 BYOK 混在 admin `secrets` 表**（Owner 强烈要求 BYOK/admin 分离）、admin 路径 16 字节熵冒充 AES-256。这些是存储层债，代价随已存 key 数指数增长，趁 key≈0 + 卖企业本地部署（必过安全评审）现在改最便宜。
- 加固方案：[[reference-byok-credential-hardening-plan]]（docs/architecture/ai-app/byok/byok-credential-hardening-plan-2026-05-28.md，v0.3）。要点 + 已锁决策：
  - **H1=Sep-A（终态）**：工具/其它类 BYOK 移出 admin `secrets` → 新 `user_credentials` 表；**LLM 留 `user_api_keys`**；`secrets` 纯系统。曾考虑 Sep-B(并 LLM)但否决——少一张表的收益不值重写能用的 LLM 解析器(多 key/模型钉选/KeyExecutor 熔断)，且 LLM/工具 key 语义异质。
  - **H6=退役捐赠池**（Owner 2026-05-28 确认，无存量 DONATED 数据、无前端入口）：`getDonatedKey` 无生产调用方(测试注释明示已废弃)，被 strict BYOK + AuthorizationGrant 取代，subscription-first 下"捐 key 赚 credit"失意义，且共享 key 服务他人=计费归属 liability。PR-0 删 getDonatedKey/donate 端点/mode!=DONATED 过滤/停产 DONATION_REWARD。
  - 加密 BP：AES-CBC→GCM + 信封(DEK/KEK，IKekProvider 可插拔：onprem EnvKekProvider 客户自管、cloud AwsKmsKekProvider) + kekVersion 轮换接口(轮换作业 P6 后置)；H2 双读+backfill；H3 纳入遗留 ai_models.api_key；admin 16字节熵随 backfill 修。
  - 实施 PR-0(退役捐赠池)→1(加密内核)→2(schema)→3(接入+新写v2)→4(分离迁移+backfill)→5(清 legacy)→6(KMS+轮换)。
- 加密爆炸半径：4 表(secrets/secret_keys/secret_versions/user_api_keys)+ 遗留 ai_models.api_key；5 服务调 EncryptionService。
- 次序：加固落地 → 刷新 monetization(D3/§6/§8) → 接 MeteringService。O1/O9 仍待拍板但 O1 已被 byokMode+grant 机制部分承载。

**已定**：①订阅制为主，credit 降级为"订阅内月度配额阀门"非主要收钱手段 ②Free tier 也开放 BYOK ③BYOK 只换 LLM token 成本免费、平台资源(搜索/绘图/编排)照计费 ④credit 锚定真实 USD×毛利率 ⑤LLM/tools/skills 统一计入同一 credit。

**Why**：卖产品(编排/agents/UI)不是转售 token；BYOK 是获客钩子+成本调节阀，不抵扣订阅价。

**How to apply**：

- 核心架构=统一计量 chokepoint（UsageEvent → ai-harness/guardrails/billing MeteringService → 同时驱动 credit 扣减 + cost-attribution + AIUsageLog）。计量编排放 harness 层（engine 禁 import harness）。
- **已知漏损**：tools/skills 完全没计量，`logCapabilityUsage()`（ai-capability-resolver.service.ts）是死代码、全项目无人调用 → W4 接线。验证前先 grep 确认是否已接通。
- **待 Owner 拍板的关键反转 O1**：是否重启"计量版 SYSTEM key"路径，让无 BYOK 用户也能用平台 key（按 credit 计量）。这反转了 2026-05-05 strict-BYOK 的"无 SYSTEM fallback"。我建议启用——订阅制下平台收了订阅费、提供平台 key 计量正是变现，与"不免费垫钱"不冲突。**W5 起依赖此拍板**。
- 其它待拍板：O2 tier 价格/配额数字、O3 是否滚存、O4 支付网关选型、O5 是否对用户暴露 USD。
- 真实基线字段已核对：User.subscriptionTier(default "free")/subscriptionExpiresAt 仅占位；CreditAccount/CreditTransaction/CreditRule/AIUsageLog/AIEngineMetric 见文档 §2.1。

**部署模式区分（v1.1 §17，关键）**：Genesis 同时有 Cloud(SaaS) 和 On-Prem(本地) 两种形态，变现逻辑根本不同。Cloud=厂商持 key/垫钱/收订阅+credit(真钱)；On-Prem=客户自持 key/自付 LLM/厂商收 License(合同制)，credit 当真钱无意义。设计准则=**计量共享、结算分流**：统一计量 chokepoint 两端都开（成本可观测对 onprem 也有用），只有结算层分叉。实现=一个 `GENESIS_EDITION`(cloud/onprem) 开关 + `MonetizationProfile` 配置对象（非插件框架）+ 条件装载模块（订阅/支付仅 cloud，License 仅 onprem）。entitlement 来源可插拔：cloud→SubscriptionPlan，onprem→LicenseService。**现状：backend 代码+app.config 无任何 edition/部署模式开关（已 grep 确认），需新引入**。Roadmap W1-W4 计量基建 edition 无关两端都要。**已定（2026-05-28）：O7=On-Prem per-instance 固定年费（不限席位，license 只卡版本 feature flag + 到期 + 可选实例绑定，无 seatLimit）；O8=On-Prem 保留 credit 但默认关闭（creditBillingMode 默认 off，org admin 可切 internal 做部门 chargeback，永不与厂商结算）**。待拍板 O9(license 机制，建议签名离线文件+实例绑定+宽限期)、O1(计量版 SYSTEM key 反转 strict-BYOK)、O2-O6(cloud tier 数字/滚存/支付/USD暴露)。On-prem 发布栈见 [[project_onprem_ghcr_org_namespace_2026_05_13]]。

关联现有：BYOK 设计 [[reference-byok-system-design]]（docs/architecture/ai-app/byok/system-design.md）。
