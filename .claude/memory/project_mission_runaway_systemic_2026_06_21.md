---
name: project_mission_runaway_systemic_2026_06_21
description: Mission 失控空烧事故($18/6M token/33h)+ 深度检视暴露的四大平台级系统性问题
metadata:
  node_type: memory
  type: project
  originSessionId: 5d029abb-a5d5-4709-9de4-e5b7290010c3
---

**事故**：deep 洞察 mission `dc0d2aae`（AIDC并网标准洞察）生产失控——两轮累计 ~33h、烧 **$18.16 / 6.05M token**，无断路器中途阻止，最终 thrash 到自然 completed（不是被取消）。直接症状 `RUNNER_OUTPUT_SCHEMA_MISMATCH`：每个 agent finalize 过不了 object outputSchema（`<root>: Expected object, received string` / `summary|fullMarkdown|body: Required`），撞 `MAX_FINALIZE_REJECTS=3` 强吐次优 → 维度反复 retry 永不收敛。模型 deepseek-v4-pro / gpt-5.4。

**直接机制（已确认）**：agent 不用 native function-calling/JSON mode，而是要 LLM 在文本里夹 JSON object + `extractJsonFromAIResponse` 启发式抽 + `safeParse`（`simple-loop.ts:208-246`、`agent-runner.service.ts:396-477`）。新模型吐 markdown 散文 → 抽到字符串 → schema 期望 object → 崩。

**深度检视四大系统性主题**（详见 `docs/operations/incident-2026-06-21-mission-runaway-postmortem.md`，含分级修复方案 P0/P1/P2 + file:line）：

1. **结构化输出契约全平台脆弱**：17+ agent 同模式，跨 playground / deep-insight 克隆 / writing / social。最危险 chapter-writer/writer/integrator/analyst。
2. **缺空转/成本速率断路器**：`MissionLivenessGuard` 只杀「冻死」（心跳 AND 事件双 stale），杀不了「高频出事件但不前进」的 thrash；30min stage:stalled 仅 warning；Teams/Insight 连 liveness 都没注册；全平台无成本速率告警；playground deep wallTimeCap=24h。
3. **cancel/abort 多处坏**：Teams cancel 只改 DB 零 abort（`teams/.../mission-lifecycle.service.ts:65-77` 已确认）；Insight already-cancelled 跳过 abort(CRITICAL,待复核)；Writing 委托不保证；playground:284 同坑。**`MissionAbortRegistry` 是进程内 Map（`abort-registry.ts:38`）→ 多 pod cancel 落错 pod 静默失效**；但有 `onApplicationShutdown` 钩子 → **重启 backend 能可靠止血，SQL 改状态不能**。
4. **revert `c6056e795`(6/10) 制造永久陷阱**：playground 冻成 6f59 的 deep-insight 克隆 → 双套永久漂移；抹掉 playground 自有 pipeline 终态仲裁/平价修复(`2977aa49a`/`474264d6a`/`477a37cef` 半边) → schema 失败无法 fast-fail 只能静默 thrash。prose-not-JSON 头号嫌疑=gpt-5.4/deepseek 的 `isReasoning` 误判(#382 收窄)→finalize 路径选错。

**为什么漏到生产**：revert 只验编译不验真跑 + 换模型不回归 + mock 测试假绿 + 断路器只防冻死不防空转。CLAUDE.md 反向洞察#5(断路器)是 honor-only 没自动拦截。

**排查手法实证**：用 `railway variables --service Postgres --kv` 取 `DATABASE_PUBLIC_URL`（内网 `postgres.railway.internal` 本地连不上）+ 本地 root `node_modules/pg` 直查生产；事件表 `agent_playground_mission_events`(列名 `type`/`ts` bigint)。调试脚本在 `debug/`。

**修复（commit `ddfdf0a85`，分支 `fix/mission-runaway-systemic`，未 push，自驱工作流 wf_afc54549-31e + 复核）**：

- P0 全做：MissionLivenessGuard 加"无进度/成本"断路器（kill 高频出事件但 stage 不推进还烧 token 的 thrash）；Teams/Insight 补 mission 级 liveness 注册；cancel 四处（playground/teams/insight/writing）改成先 fire abort 再 status early-return（teams 原本零 abort）；deep 档上限收紧 24h→6h / 20000→12000 credits + 堵 user override 撑大洞。
- **prose-not-JSON 真因（修正前期假设）**：isReasoning 误判**被证伪**（gpt-5.4/deepseek-v4-pro 分类都对，finalize 传输不分支于 isReasoning，catalog 经 Pass-2 provider 匹配给对了 native mode）。真因=`react-loop.ts` 只在 `approachingLimit` 才把业务 finalize schema 嵌进 native 请求，正常轮用宽松 schema→强模型提前 finalize 把 markdown 当 string 塞 action.output→宽松下合法→post-parse 才发现→reject→thrash。**修法**：触发条件扩成 `approachingLimit || finalizeAlreadyRejected`（一次 finalize 被拒后下次强制 strict schema）。reason() 加 `finalizeAlreadyRejected` 参数 + 单测。
- **残留次要隐患（建议另开 ticket）**：`base-http-caller.ts:resolveEffectiveNativeMode` 构 projection 不带 apiFormat→Pass-1 跳过，BYOK 网关别名 provider slug（custom/agnes）会 miss catalog→nativeMode="none"→散文；`byok/user-models-auto-configure.service.ts` 不写 structuredOutputStrategy/supports\*。
- 验证：type-check 0 / loop 226 测试 / arch 40 套 473 测试 全绿。

**仍待用户**：P1-2 playground 去留（forward-port 被 revert 抹掉的修复 vs 退役改用 deep-insight 能力核）——唯一不可逆决策。

承接 [[project_playground_rerun_leader_plan_2026_06_19]]（同 isReasoning 坑，本次证伪了它对 prose 的责任）、[[project_marketplace_fact_contract_constitution_2026_06_10]]（playground 冻结=1方走后门致契约腐烂的预言已应验）。
