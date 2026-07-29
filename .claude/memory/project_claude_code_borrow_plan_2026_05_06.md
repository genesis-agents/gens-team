---
name: Claude Code → Genesis 借鉴清单（2026-05-06 调研）
description: 2026-05-06 4 路并行调研 d:/projects/codes/claude-code-build（Claude Code v2.1.88 还原源码）后产出的 Genesis ai-harness/engine 可借鉴清单，分 P0/P1/P2 三档
type: project
originSessionId: 88bcab33-4afa-40e3-9995-d1e247e94ef0
---

# 调研基线

2026-05-06，对照 d:/projects/codes/claude-code-build 与 Genesis backend/src/modules/{ai-harness,ai-engine,ai-infra} 现状，4 个 sub-agent 并行深读 query loop / Tool / skills+hooks+memory / SDK+IPC，整合产出。

**Why**: Anthropic 官方 Claude Code 是迄今最权威的工业级 agent harness 参考实现，其规模化运维教训（注释里的"1,279 sessions wasted 250K API calls/day" 类断路器）是 Genesis 长跑 mission 类问题（agent-playground / topic-insights）的最直接参照。

**How to apply**: 任何涉及 ai-harness/runner/loop、ai-engine/tools、agents/hooks、memory/context、open-api SDK 形态的工程决策，先翻这份清单看是否已有现成对齐方案。

# Genesis 已对齐 ✅

1. 4 层架构 L4/L3/L2.5/L2/L1 单向依赖（比单仓 Claude Code 更工程化）
2. MECE 强制（tools 在 engine 不在 harness）—— Claude Code 内部也是这个划分
3. 6 种 loop 形态分离（react/reflexion/plan-act/leader-worker/simple）
4. AgentRegistry / TeamRegistry / ToolRegistry 三 Registry 注册模式
5. tool-concurrency.service.ts 显式 inspired by Claude Code isConcurrencySafe
6. skill loader 已有 frontmatter 解析（loader/parsing/loading/caching）
7. hook-registry.ts 已有 PreToolUse/PostToolUse/SessionStart/Stop 4 事件
8. 三层架构看护（ESLint + spec 测试 + pre-push hook）

# P0（必抄，高 ROI/低改动）

## P0-1 microcompact 走 cache_edits API ⭐⭐⭐

- 来源：microCompact.ts:305-399 + claude.ts:3052-3211
- 收益：长 mission token 成本 -40~60%（autocompact 用 secondary LLM call vs cache_edits 零 token）
- 落地：runner/context/cache-control-planner.ts + ai-engine/llm/services/ai-api-caller.service.ts
- 关键：pinnedEdits 必须每轮重发同位置（claude.ts:3127）；OpenAI/Gemini 走 inline fallback
- 工作量：2w

## P0-2 退出信号用 needsFollowUp 不信 stop_reason ⭐⭐⭐

- 来源：query.ts:553-557（明文注释"stop_reason 不可靠"）
- 落地：6 个 loop 全部改用 "assistant content 含 tool_use block" 判定终止
- 修哪个痛点：project_stage_emit_missing_2026_05_06.md 的"stage 漏 emit 卡死"
- 工作量：3-5d

## P0-3 Tool maxResultSizeChars 自动落盘 + preview ⭐⭐⭐

- 来源：Tool.ts:466 + processToolResultBlock
- 落地：tool.interface.ts 加字段；tools/middleware 加 output-truncator；落 infra/storage
- 修哪个痛点：project_prod_observed_issues_2026_05_04.md 的 axios 50MB 撑爆 turn
- 工作量：1w

## P0-4 Read-before-Edit 守门（fileStateCache 时间戳）⭐⭐⭐

- 来源：FileEditTool.ts:275,452,520
- 机制：未读过/盘上 mtime > 缓存 mtime → 拒写
- 推广：fs / DB row / external API state 全部 read-modify-write 场景
- 修哪个痛点：feedback_no_lying_assertion.md / feedback_lint_staged_pulled_other_session
- 工作量：1w

## P0-5 SKILL.md frontmatter-only 注入 + 1% context budget 硬限 ⭐⭐⭐

- 来源：SkillTool/prompt.ts:21-29,92-110 + loadSkillsDir.ts:100-105
- 机制：Leader prompt 只放 name + description + whenToUse ≤ 250 字符；正文调 Skill 工具时才 attach
- 修哪个痛点：project_skill_sediment_2026_05_01.md 的"内联 prompt 删不掉"
- 工作量：1-2w（需新增 SkillInvokeTool）

## P0-6 Hook 18 事件 + 退出码 2=block + JSON 协议 ⭐⭐

- 来源：hooksConfigManager.ts:26-260 + types/hooks.ts:28-176
- 18 事件：PreToolUse / PostToolUse / PostToolUseFailure / PermissionDenied / PermissionRequest / SessionStart(startup|resume|clear|compact) / SessionEnd / Stop / StopFailure / SubagentStart / SubagentStop / PreCompact / PostCompact / TaskCreated / TaskCompleted / Elicitation / FileChanged
- JSON 输出：{decision: approve|block, updatedInput, additionalContext, async:true, asyncTimeout}
- 重要：API error 不跑 stop hook（query.ts:1262-1264，防死循环）
- 工作量：1.5w

## P0-7 AbortController WeakRef 双弱引用 ⭐⭐

- 来源：abortController.ts:68-99
- 修哪个痛点：长 mission listener 累积 → MaxListenersExceededWarning
- 工作量：0.5w

# P1（值得抄，中改动）

## P1-1 Tool capability flags 矩阵 + buildTool fail-closed 工厂

- Tool.ts:402-437,783
- isReadOnly / isConcurrencySafe / isDestructive / isOpenWorld / isSearchOrReadCommand / interruptBehavior
- 升级 tool-concurrency 从 category 级到 input 级

## P1-2 Conditional skills（paths glob 激活）

- loadSkillsDir.ts:997-1058
- duty.md 加 paths: ['backend/**/*.ts']

## P1-3 Streaming-time tool execution + sibling abort

- StreamingToolExecutor.ts:40-519
- 延迟 -30~50%；单 react-loop 试点；3-4w

## P1-4 Withhold-then-retry 错误协议

- query.ts:1085-1255
- PTL/413/Media/MaxOutput 先 withhold 再 collapse → reactiveCompact → resume，全失败才暴露
- MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES=3 / MAX_OUTPUT_TOKENS_RECOVERY_LIMIT=3 断路器

## P1-5 ToolSearch + shouldDefer + alwaysLoad

- tools/ToolSearchTool/prompt.ts + Tool.ts:442
- MCP tool 默认 deferred，prompt 不放 schema，模型按需拉

## P1-6 MCP annotations → capability flags 标准映射

- services/mcp/client.ts:1766
- readOnlyHint / destructiveHint / openWorldHint 直接喂 flags
- inputJSONSchema 跳过 Zod 转换

## P1-7 MEMORY.md 200 行 + 25KB 硬截断

- memdir/memdir.ts:34-103
- 写入端守护：超限拒写引导拆 topic 文件

## P1-8 @path include + 5 层深度 + 循环检测

- claudemd.ts
- duty.md 之间互相 @./shared-rubric.md 避免重复

## P1-9 Settings 多源合并 + managed-only 锁

- settings/types.ts:472-499
- 6 source（cliArg/policy/project/user/session/local）+ allowManagedHooksOnly

# P2（高远 / 战略级）

| #    | 机制                                             | 位置                                |
| ---- | ------------------------------------------------ | ----------------------------------- |
| P2-1 | 窄面 SDK + NDJSON 控制协议（20 subtype）         | controlSchemas.ts:552-663           |
| P2-2 | 三段权限流（control_request can_use_tool）       | structuredIO.ts                     |
| P2-3 | Cron PID-lock + watchScheduledTasks daemon API   | cronScheduler.ts + cronTasksLock.ts |
| P2-4 | UpstreamProxy CONNECT-over-WS + 子进程凭据注入   | upstreamproxy.ts:160-199            |
| P2-5 | Sub-agent 协议 user-role <task-notification> XML | coordinatorMode.ts:148-160          |
| P2-6 | Bash AST parseForSecurity 拆 && 后逐段匹配规则   | BashTool.tsx:445-468                |

# 落地手册（Agent 可执行）

`docs/architecture/claude-code-borrow/agent-execution-guide.md` —— 主文档，含 P0×6 + P1×10 + P2×6 任务卡，每张含：白名单 / 必读上下文 / 实施步骤 / DoD / 回滚预案 / sub-agent prompt 模板。后续派 sub-agent 直接 attach 对应任务卡 + prompt 模板。

`docs/architecture/claude-code-borrow/README.md` —— 索引导航。

# 落地排序建议

```
W1:  P0-2 needsFollowUp 改造 + P0-6 stop hook skip on API error
W2:  P0-3 maxResultSizeChars
W3:  P0-5 SKILL.md frontmatter-only
W4-5: P0-1 microcompact cache_edits（最大省钱单点）
W6:  P0-4 Read-before-Edit + P0-7 WeakRef
W7+: P1-3 streaming-time tool（3-4w，单 react-loop 试点）
后续: P1-1/2/4-9 + P2 看产品节奏
```

# 反向洞察（Anthropic 踩出来的坑列表）

| 坑                                            | 后果                             | 对应 Genesis 教训                        |
| --------------------------------------------- | -------------------------------- | ---------------------------------------- |
| stop_reason 不可靠                            | 偶发漏判终止                     | project_stage_emit_missing_2026_05_06.md |
| stop_reason 在 message_delta 才到             | content_block_stop 时永远是 null | —                                        |
| assistantMessages 用原 message yield 用 clone | 改原对象破 prompt cache          | —                                        |
| fallback 不 yield 配对 tool_result 占位       | invalid_request                  | —                                        |
| pinnedEdits 不每轮重插                        | cache 命中率 90→0                | —                                        |
| thinking signature 跨模型                     | 400                              | —                                        |
| Sub-agent 启用 cached microcompact            | 全局 state 污染                  | feedback_lint_staged_stash_safety        |
| stop hook 在 API error 时仍跑                 | 死循环                           | project_p1_react_runaway_fix_2026_04_29  |
