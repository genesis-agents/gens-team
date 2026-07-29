---
name: Claude Code v2.1.88 还原源码（架构借鉴金矿）
description: d:/projects/codes/claude-code-build 是从 Anthropic 泄露 sourcemap 还原的 Claude Code v2.1.88 源码（1916 TS 文件），含官方 query loop / Tool / skills / hooks / SDK / coordinator 全套实现，是 Genesis ai-harness/engine 借鉴的最权威参考
type: reference
originSessionId: 88bcab33-4afa-40e3-9995-d1e247e94ef0
---

# 路径

`d:/projects/codes/claude-code-build/` —— 1916 TS 文件，从 cli.js.map 泄露 sourcemap 还原（2026-03-31 incident），ESM bundle，1325 单测。

# 关键模块与对应位置

| 主题                                                                  | 位置                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 主 agent loop（AsyncGenerator + while-true + immutable state）        | `src/query.ts:241-1729`                                                       |
| 上下文压缩 4 层金字塔                                                 | `src/services/compact/microCompact.ts:253-530` + `autoCompact.ts:160-269`     |
| `cache_edits` API（删旧 tool_result 仍命中 prompt cache，最值钱设计） | `src/services/api/claude.ts:3052-3211`                                        |
| Streaming-time tool execution + sibling abort                         | `src/services/tools/StreamingToolExecutor.ts:40-519`                          |
| Tool 并发分批 partition                                               | `src/services/tools/toolOrchestration.ts:91-116`                              |
| Tool 大接口（60+ 字段 + capability flags 矩阵）                       | `src/Tool.ts:362-695`                                                         |
| buildTool fail-closed 工厂                                            | `src/Tool.ts:783`                                                             |
| MCP → Tool 映射（annotations）                                        | `src/services/mcp/client.ts:1766-2000` + `src/tools/MCPTool/MCPTool.ts`       |
| AgentTool 多 spawn 形态（subagent/fork/teammate/worktree/remote）     | `src/tools/AgentTool/runAgent.ts:248-973` + `AgentTool.tsx:196`               |
| coordinator 协议 `<task-notification>` user-role XML                  | `src/coordinator/coordinatorMode.ts:80-369`                                   |
| BashTool sandbox + AST parseForSecurity                               | `src/tools/BashTool/BashTool.tsx:33,445-468`                                  |
| Skills 加载（4 优先级 + frontmatter）                                 | `src/skills/loadSkillsDir.ts:638-714`                                         |
| Skills 注入 budget（1% context window 硬限）                          | `src/tools/SkillTool/prompt.ts:21-29,92-110`                                  |
| Bundled skills                                                        | `src/skills/bundled/{index,loop,remember}.ts`                                 |
| Conditional skills（frontmatter `paths:` glob 激活）                  | `src/skills/loadSkillsDir.ts:997-1058`                                        |
| Hooks 配置（18 事件 + 退出码协议 + JSON 输出）                        | `src/utils/hooks/hooksConfigManager.ts:26-260` + `src/types/hooks.ts:28-176`  |
| Memory 目录（MEMORY.md 200 行 + 25KB 硬截断）                         | `src/memdir/{memdir,paths}.ts:34-103`                                         |
| CLAUDE.md 多层加载 + `@path` include 5 层深度                         | `src/utils/claudemd.ts:1-26`                                                  |
| AbortController WeakRef 双弱引用                                      | `src/utils/abortController.ts:68-99`                                          |
| SDK 公开门面（11 函数）                                               | `src/entrypoints/agentSdkTypes.ts:1-443`                                      |
| NDJSON 控制协议（20 subtype）                                         | `src/cli/structuredIO.ts:1-80` + `src/services/sdk/controlSchemas.ts:552-663` |
| ReplBridgeTransport 接口（v1/v2/direct 三套 wire）                    | `src/bridge/replBridgeTransport.ts:23-70`                                     |
| Cron + PID lock                                                       | `src/utils/{cronScheduler,cronTasks,cronTasksLock}.ts`                        |
| UpstreamProxy CONNECT-over-WS + 子进程凭据注入                        | `src/upstreamproxy/upstreamproxy.ts:1-286` + `relay.ts:1-120`                 |
| 错误恢复（withhold-then-retry + 断路器）                              | `src/query.ts:1085-1255`                                                      |
| FileEditTool readFileState 强制 Read-before-Edit                      | `src/tools/FileEditTool/*.ts:275,452,520`                                     |

# Anthropic 自己注释里的"血的教训"（不要忘）

1. `query.ts:553` —— "stop_reason === 'tool_use' 不可靠"，退出信号必须用 `needsFollowUp`（assistant content 含 tool_use block）
2. `query.ts:262` —— `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`，注释明写"否则 1,279 sessions 浪费 250K API calls/day"
3. `query.ts:1262-1264` —— API error 跳过 stop hook，否则 hook 注 token → PTL → retry → 死循环
4. `query.ts:742-787` —— assistantMessages.push 用原对象、yield 用 clone（否则改原对象破 prompt cache）
5. `query.ts:925-929` —— fallback 时 strip thinking signature（signature 与模型绑定，跨模型 400）
6. `microCompact.ts:272-285` —— sub-agent 默认禁用 cached microcompact（写 module-level state 会跨 thread 污染）
7. `claude.ts:3127` —— pinnedEdits 必须每轮重发同位置（否则前缀字节漂移，cache 0 命中）
8. `Tool.ts:466` —— 每 tool 自带 `maxResultSizeChars`，超限自动落盘 preview

# 注意陷阱

- `src/buddy/` 不是 agent 系统，是 UI 装饰品（动画鸭子 sprite）
- `src/sdk/runtimeTypes.ts` 是 12 行 stub；真正 SDK 类型在 `src/entrypoints/sdk/`
- `src/server/` 不是 HTTP server，只是 client schema；本地无 `app.listen(port)`
- `src/cachedMicrocompact.ts` 公开构建是 `export default {}` stub（实现走 dynamic import，仅 ant 内部构建可用）
- `protectedNamespace.ts` 公开构建永远 return false
