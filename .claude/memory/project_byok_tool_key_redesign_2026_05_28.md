---
name: project_byok_tool_key_redesign_2026_05_28
description: BYOK 工具 key 解析重设计 4 层计划（L0 已完成，L1-L3 待产品决策）
metadata:
  node_type: memory
  type: project
  originSessionId: 04499ded-3669-4244-9274-3298bf9f3384
---

2026-05-28 起的多阶段建设：按 (部署形态 × key 类别 × 消耗档位) 重设计 BYOK key 解析 + 工具 UI。起因：agent-playground mission 搜索全掉 DuckDuckGo 反爬风暴。

**根因（已读死代码）**：mission 用户 byokMode=STRICT → `tool-key-resolver.service.ts resolveToolKey` 抛 NoToolKeyError → `search.service.ts applyByokToolKeys`(212-239) 返回 `[]` → `getSearchConfig`(943-950) 把已加载的 admin Tavily/Serper key 抹掉 → `buildFailoverChain` 只剩免 key 的 DDG。admin 确实配了 Tavily/Serper(91k 消费),是 STRICT 设计("不烧 admin 池")拦掉的，非 bug。

**关键事实**：

- byokMode schema 默认 FALLBACK，但 resolver 查不到 user 时兜底 STRICT；该用户被显式设成 STRICT（个别状态，非系统默认）。
- `resolveToolKey` + `EXTERNAL_TOOL_SECRET_MAPPING` 只管外部工具 key（无任何 LLM provider），LLM BYOK 走另一条路 → "按 key 类别分治"结构上天然分好。
- 代码**完全不区分**云端/本地部署（0 命中 DEPLOYMENT_MODE/tenantId/org），单一模式 per-user。
- 工具**无成本档位元数据**（`external-tool-definitions.ts` 的 `pricing` 字段定义了从没用，`freeQuota` 只是字符串）；CreditRules 55-61 条只到 模块×操作 粒度，无工具级扣费。
- 工具列表 API：`GET /user/tools` → `user-tools.service.ts listForUser()`，返回 8 字段，缺 keyRequired/source/freeTier/costTier/byokMode。
- 前端两个重叠配 key 入口：`/me/api-keys`(UserApiKeysTab) + `/me/tools`(UserToolsTab，弹窗还跳回 api-keys)；config 弹窗泄露技术名 secretName。

**进度**：

- L0 止血 ✅ 完成：(1) 该用户 byokMode 改回 FALLBACK（Railway SSH+prisma 实改）；(2) `search.service.ts` 加 DDG 熔断（串行队列 ddgQueue + 最小间隔 DDG_MIN_SPACING_MS=1200 + 命中 anomaly 后 DDG_COOLDOWN_MS=60s 冷却跳过，executeDuckduckgo 拆分）。
- 另已落：guardrail bypass（`llm-executor.ts` 内部 agent 调用补 skipGuardrails:true）+ reasoning_content 兜底（`ai-api-caller.service.ts` 空内容块回收完整 JSON）。
- **加固进度纠正**：PR-1/2/3 已落（encryptEnvelope/decryptAny + EnvKekProvider + user_credentials 表 + UserCredentialsService）；**PR-4.3 resolver 通车其实 PR-3 已做**（`user-secrets.service.ts getUserSecretValue` 早已先读 user_credentials 再回退 legacy secrets，resolver 经它间接读新表）。生产现状：user_api_keys=20(全 personal)、user_credentials=0、secrets 用户行=0、系统行=46，DONATED=0。
- **`donated` = 命名债**：实为 ASSIGNED(被授权 key)，非捐赠池；getDonatedKey/donate 端点早删。残留 `apiKeySource:'donated'`(ai-chat/ai-model-config sourceMap ASSIGNED→donated/billing-adapter)+ DONATED/USER_DONATED 枚举 + DONATION_REWARD。专业决策：`donated→granted`，**不**改 personal/system(无谓 churn)；统一 KeyOwnership 枚举归 L1 MeteringService。
- **PR-4 backfill 已写**：`backend/prisma/data-migrations/backfill-envelope-v2.ts`（A=secrets 用户行→user_credentials 迁移；B=4 表 v1→v2 原地升级；幂等+逐行 decryptEnvelope 校验），接进 `deploy-migrations.ts` Step 4.6（best-effort try/catch）。类型通过（prisma/ 不在主 tsconfig，用临时 extends config 真检）。**部署门控**：下次部署随 deploy 跑→Railway 核实全 enc_version=2→才能做 PR-5(删 legacy CBC/HKDF/decryptAny 回退)+PR-4.4(secrets→系统专用 DROP secrets_name_user_key)。顺序铁律=没 backfill 完不能删 legacy 解密。
- 决策原则见 [[feedback_correct_architecture_over_low_risk]]：推正确终态，不挑安全小切片。
- L1 工具成本分档 / L2 UI 收敛 / L3 部署形态 ⏳ 待用户拍：① 工具高/低/免 key 消耗分类清单；② 部署形态(云端 vs 本地)的配置设计 = monetization §17 `GENESIS_EDITION`+`MonetizationProfile`(已设计未建)。用户明确"不同部署形态要有对应的配置设计"。

Railway 查/改库通道：`railway ssh "cd /app && echo <base64-js> | base64 -d | node"`（容器有 node+@prisma/client，无 psql；DB 内网，本地无 pg/prisma）。
