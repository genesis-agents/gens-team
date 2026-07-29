---
name: 2026-04-29 严苛深度审计基线
description: 三路并行审计（架构合规/安全/工程质量）+ 主审一手验证 = 综合 65/100；agent-playground 是结构性质量黑洞
type: project
originSessionId: bd93d80d-b183-4c22-8588-e37c9a24df1f
---

2026-04-29 用 arch-auditor + security-auditor + general-purpose 三路并行 subagent + 主审一手抽检的方法做了一次严苛深度审计。

**Why**: 用户要求"严苛的深度审视"。这次审计的输出是 baseline，下次再审可以做对比，且 P0 清单是可被独立闭环的整改任务。

**How to apply**: 之后用户提"项目审计 / 健康度 / 风险评估"类问题时，先核对这份 baseline 中的 P0 是否已修，再决定是做局部检查还是再来一次全量。**复用同样的三路并行方法**——单路 subagent 容易漏盲点，三路交叉验证可信度极高（这次三路对核心问题的识别一致性 > 80%）。

## 综合分数（baseline）

- 架构合规 60/100、系统安全 68/100、工程质量 72/100 → 综合 **65/100 (B-)**
- 三路审计的一致性极高，对 80 处静默 catch、agent-playground 0% 测试、Facade 边界穿透、SSRF、CORS:\* 这些都是多路独立检出

## P0 火警清单（8 条，72 小时级整改优先）

1. SQL Executor Tool 对所有 Agent 调用方开放生产 DB（`ai-engine/tools/categories/execution/sql-executor.tool.ts:229-307`）—— 黑名单可被绕过
2. MinerU CLI 命令注入（`common/content-processing/mineru.service.ts:310-316`）—— execAsync shell 模式
3. **Proxy Controller 整体 @Public() + isBlockedAddress 仅做字面 IP 匹配**（`ai-app/library/proxy/proxy.controller.ts`）—— 可被 DNS rebinding 绕过；`resources.service.ts` 多处 fetch 完全无 SSRF 过滤
4. agent-playground WebSocket `cors: { origin: "*", credentials: true }`（`gateway.ts:32`）
5. Refresh Token 派生 `jwtSecret + "-refresh"`（`auth.service.ts:334-341`）
6. `/metrics` 端点 `@Public()` 完全无鉴权（`metrics.controller.ts:11`）
7. 80 处 `.catch(() => {})` 静默吞错，31 处在 agent-playground，含 ai-chat 关键路径
8. `session-crypto.ts:51` 直接 process.env 读 SESSION_ENCRYPTION_KEY，未走 ConfigService

## 系统性根因（最重要的发现）

> **agent-playground 旗舰模块绕过了所有项目质量护栏**：80 处静默 catch 中 31 处在它，controller/gateway/12 stage/13 agent 全 0% 覆盖，CORS:\*，facade 穿透。**research/ 和 topic-insights/ 的代码在同标准下要规整可信得多**——同一个团队两套标准并行的结果。这正是 `project_agent_playground_quality_gap.md` 中"近 5 mission 全 fail"的根因之一：错误信号被吞了，failure-learner 写失败你也不知道。

## 已被验证的项目良好实践（不能在重构中破坏）

- `safeCompare` (timingSafeEqual) 在 a2a/mcp/storage 三处 guard 全部正确使用
- Prisma `$queryRaw` tagged template literals 全量参数化（仅 cleanupExportFiles + cleanupOldReportVersions 两处边缘字符串拼接）
- JWT secret fail-fast、ValidationPipe 全局 whitelist+transform、Webhook HMAC-SHA256
- `runtime-deps.tokens.ts` 抽象层让 ai-engine→ai-app 反向依赖 = 0
- 后端测试 lines 84% 覆盖率（但分布严重失衡，controller 层 0.97% 覆盖）

## 自带工具（已经存在但没人跑）

- `bash scripts/devops/check-facade-boundary.sh` —— 当场检出 12 条违规，但 CI 没跑
- `npm run check:facade` 可触发同样检查
- open-api 层缺少与 ai-app 等效的 ESLint `no-restricted-imports` 规则——这是 26 处 open-api 穿透的根因
