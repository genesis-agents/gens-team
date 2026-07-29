---
name: project_p0_timeout_round_2026_05_13
description: 2026-05-13 P0 timeout + key + dedup 三连修：BYOK reasoning 120s 短路 / single-key cooldown 锁死 / mission 双触发 cancel
metadata:
  node_type: memory
  type: project
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

**2026-05-13 一轮 prod log（Railway） triage 出 13 项，P0/P1 5 件已修 + 5 件回归 spec，4 个 commit 接连推完。**

**Why:** 单条用户 mission（topic 70d23f92）从 leader.plan → analyst stage 全链 fail，prod log 显示 PROVIDER_API_ERROR / "No API Key available" / reflection score=null payload validation 持续打。表面是 OpenAI 端问题，深挖全是代码层 bug。

**How to apply:**

| Commit                                  | 修复                                                                                                                                        | 关联 memory                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `0bfd4a77f` fix(ai-engine/llm)          | BYOK reasoning timeout 120s 短路 + 5 份 getTimeoutForModel 单源化（其中 ai-chat-model-config 算法已漂移：maxTimeout 600000 vs 单源 900000） | [[feedback_schema_default_blocks_short_circuit]] [[feedback_no_dual_sources]]                                       |
| `cd1ed87fa` fix(agent-playground)       | AgentReflectionSchema.score 改 nullish 接 abstain；analyst stage 区分 LLM-internal vs Provider-level 失败按 failureCode 分流                | [[feedback_zod_nullable_vs_optional]] [[feedback_no_lying_assertion]] [[feedback_fallback_must_be_self_consistent]] |
| `583a17104` fix(ai-infra/credentials)   | KeyHealthStore.filterUsable 加 degraded fallback：finite cooldown 全 cooldown 时返回最早恢复那个；DEAD / permanent cooldown 排除            | [[feedback_single_key_user_cooldown_lockout]]                                                                       |
| `d935c910f` fix(topic-insights/mission) | createMission 加 10s dedup window：existing < 10s 内幂等返回，>10s 才 cancel-and-recreate                                                   | [[feedback_create_endpoint_needs_dedup_window]]                                                                     |

**未修剩余（P2-P4 + sediment）：**

- P2 #6 reasoning 30-100s 延迟 - 与 #1 联动，timeout 提升后是否仍频发待 prod 复测
- P2 #7 HandoffCompactor 116941 tokens > 50000 - analyst.researcherResults 跨 dim 拼接过大
- P3 #8 DALL-E 3/2 测试 400 "model does not exist" - OpenAI 端下架 / DB modelId 待更
- P3 #9 Rerank 测试 405 Method Not Allowed - HTTP method 拼接错
- P4 #10 PromptSanitizer 240 字符硬截 - KG find_entity 输入过严
- P4 #11 /reports/latest 404 → AllExceptionsFilter warn - 后端改 200+null 或前端容错

**元教训：** 同一个 mission 内一次失败链路上多个 P0/P1 同时触发并不奇怪，因为代码层 bug 互相放大（timeout 不够 → key 熔断 → cooldown 锁死 → 重试又触发 cancel-recreate）。修第一个 P0 后必须沿同一调用链审第二、第三层，不要修完 1 个就当全好。
