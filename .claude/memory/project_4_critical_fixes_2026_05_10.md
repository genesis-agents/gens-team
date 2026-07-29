---
name: 4 致命问题修复 2026-05-10
description: 用户报告 4 个致命系统问题（BYOK 双源 / BYOK 测试失败 / Playground 模型坍缩 / AI Ask 慢）的根因 + 4 commit 修复方案 + 关键 commit hash
type: project
originSessionId: ae254a5c-ed31-4a19-a1a9-3e170bc3d7c0
---

2026-05-10 用户报告 4 个致命问题（截图 13/14/15）：

**§1 BYOK 双源（commit c729639de）**

- 症状：AI Ask 模型下拉显示 DeepSeek R1，但 BYOK"我的模型"页面没有
- 根因：`ai-model-config.service.ts:1188-1245` 在用户有 provider key
  但 AIModel 表无对应行时，从 `BYOK_DEFAULT_MODELS` 硬编码合成"虚拟
  模型"并打 `isUserKey=true`。AI Ask 走该路径，BYOK 我的模型走 KeyAssignment
  直查 → 双源
- 修复：删 BYOK_DEFAULT_MODELS 常量（135 行）+ 合成分支 + mapByokModel
- 翻转 3 处 spec：合成 → 不合成

**§2 BYOK 测试按钮失败（commit 74a41f35b）**

- 症状：BYOK 我的模型测试按钮几乎全部失败
- 根因：`ai-connection-test.service.ts:387` 在 OpenAI-compatible 一族
  （deepseek/qwen/groq/doubao/zhipu/kimi/moonshot 等）直接 POST 到
  apiEndpoint，没有 `|| default` fallback。endpoint 为空时 POST 空字符串崩
- 用户重要纠正："为什么都是硬编码？？？应该是动态获取的模型ID"——指出
  应走 DB ai_providers 真源，不是 TS 常量字典
- 修复：UserApiKeysService.resolveProviderDefaults 提到 public + AiConnectionTestService
  注入它走 DB 单源 + 新 SQL migration `20260510b_seed_extra_providers`
  补 7 个国内 provider（doubao/bytedance/zhipu/glm/moonshot/kimi/perplexity）

**§4 AI Ask 极慢（commit d07826c6d）**

- 症状：AI Ask 任何模型响应都极慢，5-30s 白屏
- 根因：`ai-ask.service.ts:sendMessage` 完全同步阻塞 await chatFacade.chat()，
  controller 等整个 LLM stream 收完才 return JSON
- 修复：保留旧端点向后兼容 + 新增 SSE 端点 POST /messages/stream
  - 后端 sendMessageStream() AsyncGenerator yields { status / sources / chunk / done / error }
  - 走已存在的 chatFacade.chatStream（内置 billing）
  - 仅覆盖非 tool 路径
  - 前端 fetch.body.getReader() + TextDecoder 增量解析 SSE，setMessages 打字机效果
  - 顺手清理 suggestedActions 死代码（2026-04-30 后端已删，前端继续消费）

**§3 多模型 election 坍缩（commits fee84a4be → fea9f8a67）**

- 症状：Playground 11 个 agent 全选 Grok，DeepSeek/其他完全没用
- 用户纠正："我说的是系统多模型，不是要 UI 选择器" + "应该是通用机制"
- 根因（4 层叠加）：
  1. 候选池硬过滤合理（用户只配 xai+deepseek）
  2. classifyModelTier 把 grok-3 / deepseek-r1 都归 STRONG（同 tier）
  3. role→tier 映射把 leader/writer/reviewer 全映射 STRONG
  4. **关键塌点**：scoreRole 在 STRONG 内不区分 reasoning，writer/reviewer
     给所有 STRONG 同样 +15 → priority 决胜 → admin priority 高的 grok 11 连胜
  - **更深层根因**：elect() 是无状态纯函数，11 次同 shape 调用 → 11 次同结果。
    不是 score 维度调一调能根治的，必须加 mission-scoped 状态
- 修复 fee84a4be（patchwork，先落）：writer 反偏 reasoning（叙事型 STRONG +18，reasoning +8），
  reviewer 偏 reasoning（reasoning STRONG +18，非 reasoning +12）
- 修复 fea9f8a67（**通用机制**）：score 加第 7 维 diversityScore = -10 × occurrences，
  新服务 MissionElectionTracker（in-memory Map<missionId, modelId[]> + 6h TTL + LRU），
  SpecBasedAgent 通过 KernelContext.missionId 读 tracker → 传 previouslyElected → elect 完记录回去

**Commit hash 速查**：

- §1: c729639de（fix(byok): 删除 BYOK_DEFAULT_MODELS 兜底逻辑根治双源）
- §2: 74a41f35b（fix(byok): connection-test 走 DB ai_providers 真源解析 endpoint）
- §4: d07826c6d（feat(ai-ask): 添加 SSE 流式端点根治响应慢白屏）
- §3 patch: fee84a4be（fix(election): writer/reviewer 在 STRONG tier 内按 reasoning 区分）
- §3 通用: fea9f8a67（feat(election): mission-scoped 通用多样性机制根治多模型坍缩）

**新沉淀的 feedback 红线**：

- feedback_no_hardcoded_provider_metadata.md（provider 元数据走 DB 不走 TS 常量字典）
- feedback_election_mechanism_must_be_general.md（选举机制必须做通用，不靠 patchwork）

**遗留风险**：

- §3 default role（如 researcher）的 scoreRole 仍返回 0，主要靠 priority + diversity
  决胜。如果用户期望 researcher 也参与多 provider 分布，需要给 default 加一档语义偏好
- §4 tool 路径（dto.enableTools=true）仍走旧同步 sendMessage，未流式化
- §1 BYOK 测试 prod 验证：还需确认 21k 行的 ai_providers 行 + 用户实际 provider 列表
