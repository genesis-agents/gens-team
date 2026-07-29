---
name: project_tools_governance_2026_06_14
description: "AI 工具系统梳理治理:已止血禁用 6 个假数据工具+maturity 字段,P1/P2 待决策"
metadata:
  node_type: memory
  type: project
  originSessionId: 58806c0b-0e6e-46f8-bd09-4a99e0fe3393
---

2026-06-14 系统梳理了 ai-engine 工具系统(76 个:72 engine + 2 ai-app + 2 harness;`TOTAL_TOOL_COUNT`=72,旧文档"46"已过时)。实读核实 REAL 59 / PARTIAL 11 / STUB 6。

完整台账+治理方案在 `docs/architecture/ai-engine/tools/tools-governance-plan.md`。

**已执行(P0 止血,分支 `fix/tools-disable-stub-tools`,未 commit 等 review)**:

- `ITool` 加 `maturity?: "real"|"partial"|"stub"` 字段(默认 real)。
- 禁用 6 个会说谎/抛错的工具(`enabled=false`+`maturity="stub"`):video-generation、container-executor、github-integration(返回 Math.random 假数据)、calendar-integration、task-delegation、workflow-orchestration(Math.random 假步骤成功)。
- user-preferences、consensus-mechanism 标 partial 保留(内存态但不伪造)。
- 守护 spec `tools/__tests__/tool-maturity-guard.spec.ts`:断言 stub 必 enabled=false。
- 验证:type-check 0 err、verify:arch 473/473、工具单测 1826/1826 全过。

**关键架构事实**:agent 调工具走 `ai-harness/runner/tool-invoker/tool-invoker.ts`,直接 `tool.execute()` **绕过 engine `ToolPipeline` 五件套中间件**。catalog 构建(getEnabled/listByCategory)过滤 enabled,故禁用工具不被召回;但 ToolInvoker.invoke 未对 enabled 二次拦截(P1 加固项)。OpenAPI 适配器声明存在实则只有 MCP。

**已做并已合入 main**:

- P0 止血(上述)— PR #345(merge 5f1ddd0ab)
- **P1-1 乙**:tool-invoker.ts 加真超时(AbortController+Promise.race,超时→abort+TOOL_TIMEOUT)+ input 校验(validateInput 失败→TOOL_INPUT_VALIDATION_FAILED 不调 execute)+ finally 清理,7 测试 — 同 PR #345
- **P1-2**:ontology 5 工具 id 点号→kebab(ontology-upsert-object 等)+ category information→execution,14 处引用原子改名(无别名,引用全在代码)— PR #346(merge 978e1ffda)。注:OpenAI function name 不允许点号,改名也修了该隐患。

**事故教训(2026-06-14)**:治理途中工作目录被另一个并发会话(fix/ontology-knowledge-bugs,后经 PR #344 合入)清空过一次(6927 文件全删),`git restore .` 安全恢复(状态纯删除无未提交修改)。教训:**同一工作目录同时只跑一个会话,并行用 git worktree**。本仓库 main 未强制 CI 门,`gh pr merge --merge` 直接合入。

**仍待决策(P1/P2)**:① 双路径**全量**合并(甲 ToolInvoker 改调 Pipeline/丙 抽共享 core,把限流+权限中间件也接进 agent 路径;乙 已补超时+校验)④ 补 calculator/datetime/pdf-table ⑤ information 类过载(27/72)tags 子域拆分。
