---
name: project_secret_reference_audit_2026_05_07
description: 2026-05-07 密钥引用机制 7 大架构问题诊断（基于 Screenshot_5 N:1 串号事故）
type: project
originSessionId: 88bcab33-4afa-40e3-9995-d1e247e94ef0
---

2026-05-07 修 Screenshot_5「Perplexity dialog 显示 Tavily 的 key」时发现：根因是 N:1 provider→registry 映射下 secretKey last-write-wins + bridge 反向漂染（commit `53cb299cf`），但更深层 7 类架构问题：

1. **5 重存储同时存在**：Secret / SecretKey / ToolConfig.secretKey(provider) / ToolConfig.secretKey(registry, 现部分清) / ToolConfig.config.apiKey + 5 个 legacy endpoint（search-config/extraction-config/youtube-config/tts-config/skillsmp-config）写另一组列。读时并集 OR fan-in
2. **Capability vs Provider 模型错配**：web-search 等能力级 row 物理上只有 1 个 secretKey 字段，挂 4 个 provider，被 last-write-wins 抢
3. **Provider ID / Registry ID 双命名空间双源同步表**：前端 `PROVIDER_TO_TOOL_ID` (28 项) + 后端 `TOOL_ID_ALIAS_TO_REGISTRY_ID` (21 项) 已漂移
4. **Read-time inference 而非 write-time consistency**：bridge 在读路径推理填补 → 数据不一致后患
5. **3 种 KEY 来源（system secret / direct input / BYOK）无统一 resolver**：每 tool 的执行器各自实现 fallback
6. **Secret 删除无级联**：dangling references 不清理
7. **ConfigureModal 仅按 `secret.category` 过滤**：admin 设错 category 永不出现在工具下拉

**Why:** 同一个 tool 的 secret 配置存于 5+ 处，每改一处其他不同步 → 任何"管理后台已配但运行时 401"都源于此。Screenshot_5 是冰山一角

**How to apply:**

- 用户问"密钥引用还有什么问题/再做次清理" → 直接回 7 类问题清单 + 推荐目标态 5 件套
- 接到 admin tools 相关 bug → 先确认是 5 重存储中的哪一层不一致
- 推荐目标态 5 件套：
  1. capability 行删 secretKey 语义（runtime 已跳过，schema 待清）
  2. alias map 收敛 backend 单源 + 前端 API 拉取
  3. 统一 `resolveToolApiKey(toolId, userId?)` 入口按 BYOK > secret > direct > legacy 顺序
  4. Secret 删除级联清 ToolConfig.secretKey = null
  5. 删 5 个 legacy endpoint，全走 `/admin/ai/tools/:toolId` 一条路径
- 是架构级重构（跨 schema/runtime/admin/前端 5+ 模块），不要顺手做，**立项后再动**
