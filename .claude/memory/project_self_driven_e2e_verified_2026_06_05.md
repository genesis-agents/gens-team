---
name: project_self_driven_e2e_verified_2026_06_05
description: Self-Driven Agent Team strict end-to-end API verification + 3 runtime fixes (model-failover / team_built attribution / HITL race)
metadata:
  node_type: memory
  type: project
  originSessionId: 1192a7bc-0e81-42f9-9a96-bf85e85b7a6e
---

Self-Driven Agent Team 严格端到端 API 验证（用户指控"自我防水"后要求真跑确认）。

**怎么自驱测的**：写 `debug/self-driven-e2e.mjs`（仓库根，未入 git），`railway run node debug/self-driven-e2e.mjs` 注入生产 `JWT_SECRET` 自签短期 JWT（jwt.strategy 只验 sub/email/username 不查库→自签即过），驱动 `POST /ask/self-driven/run`→轮询 `GET /replay/:id?since=`（解 `{success,data}` 信封）→对每个 `awaiting_approval` 网关 POST `/missions/:id/approve`。严判 PASS=done 终态+无 error+所有 step ok=true+deliverable>500 字符。

**实测结论：链路真能用**。中→`深度洞察算力基础设施2030` 7/7 步 ok、27.5K 字真·深研报告（chiplet/HBM/ASIC/DPU/液冷/CXL/光互连+置信度表）；英→45K/31.8K 字同等质量。`$P$G` 只在首跑（冷启）出现一次，**不可复现**，非系统 bug。

**3 个运行时真 bug（均已修+合 main+部署验证）**：

1. **模型择优选到的模型挂了不恢复**（最重要）。`AiChatService.chat()` 只在**不显式传 model** 时才走引擎级 model-failover（`runChatWithModelFailover`，见 ai-chat.service.ts §统一 chat 入口 1288-1303 注释：显式 model=caller 自管 failover 如 ReAct loop→单次 chatOnce 不 failover）。runner 显式传每角色 elected model→failover 被关→`minimax/minimax-m3` 命中用户 OpenRouter BYOK 配额耗尽 402 QUOTA_EXCEEDED→整步 ok=false。**修**：runner 的 chat() 兜底**丢掉 elected model**（不传 model）让引擎 failover 退到健康默认（deepseek-v4-flash）。验证：writer 又被选中 minimax 但 ok=true。复用既有能力非手搓重试。commit bad6ac161。
2. **team_built 模型属性骗人**：DynamicTeamBuilder/TeamFactory.createFromConfig 只有单一 defaultModel（无 per-role 槽），team_built 给所有角色播同一 default，但每步实际跑各自 elected model。改为从 `plan.roleAssignments` 发 team_built（真·执行所用）。同 commit。
3. **HITL approve 抢跑 404**：runner 先 emit `awaiting_approval` 再由 `hitlGate.open()` 落 missionId→requestId 映射；owner approve 靠该映射解析→秒级 approve 抢在落库前→spurious 404（且事件恒发 requestId=""）。**修**：网关拆 `prepareGate()`（落库+返真 requestId）+`awaitGate()`（阻塞等结果），runner 先 prepare→emit（带真 requestId）→await。`open()` 保留为兼容 delegator。commit c391f537c。真前端人点审批慢于落库故从不触发，但快客户端/未来 API 消费方会中招。

坑：driver 必须审批**每个**网关（plan_confirm + deliver_confirm），只审第一个会让第二个等满 10min auto-approve；Bash 工具 cwd 会被 `cd backend` 带跑偏导致 `railway run node debug/..` 找不到脚本（要回仓库根）；`railway logs` 是流式不退出，`| grep | tail` 会挂住要 TaskStop。承接 [[project_self_driven_durable_transport_2026_06_04]]
