---
name: feedback-test-connection-must-verify-runtime
description: '所有"测试连接"按钮必须真发一次最小操作验证 key+配额+余额+真返回数据，仅检 auth pass 等于谎报"正常"'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

所有 admin / BYOK 的"测试连接 / Test"按钮必须真发一次**最小可行操作**验证完整可用性，不能只 ping endpoint 看 auth pass。

**Why**: 2026-05-13 Serper 配额耗尽事故：admin 工具页显示 "状态正常 2m"（last test 2 分钟前），但 mission 实际跑搜索时全部 400 "Not enough credits"。根因——Serper 测试连接 endpoint 只验证 key 是否有效（200 OK），不返回配额信息；而 search 实际查询时才暴露 credit 不足。结果：admin UI 谎报"正常"误导用户以为工具可用，用户 mission 跑半天搜不到东西。

**How to apply**:

测试必须真发一次小操作，并按这 5 维度全部检查：

1. **Key 有效** —— 200 OK + auth 不报错
2. **配额 / 余额可用** —— 返回真实数据，**不是空 results / 0 papers**（test query 是 "test"/"AI"/常用词，理论应 ≥1 结果，0 结果 = degraded 状态）
3. **结果对象 success 字段** —— 工具内部包装的 `{success:false, error:"..."}` 必须当失败上报（不能只看是否 throw）
4. **HTTP status + body 错误消息** —— 失败时把真实 status + body.error.message 完整显回给 admin（不是笼统 "测试失败"）
5. **DB testStatus 同步写** —— success / failed / degraded（部分配额）三态，testedAt + lastErrorCode + lastErrorMessage 全部入库，admin UI badge 据此显示

涵盖范围（所有"test" 入口都要照此审）：

- Search tools (serper/tavily/brave/duckduckgo) — 真查 1 次
- Academic tools (semantic-scholar/arxiv/openalex/pubmed) — 真查 1 次
- LLM models (chat/embedding/image/rerank) — 已经做了完整 probe（见 ai-connection-test.service.ts）
- MCP tools — 必须真调一个轻量 tool，不只 list_tools
- RSS sources — 真 fetch 一次 feed 验证可解析 + items.length > 0

**反模式（严禁）**：

- `return {success: true}` 只要 HTTP 200 就 PASS
- 工具内部返 `{success:false}` 当 PASS（"反正没 throw"）
- 0 结果不 flag —— degraded 状态必须显式标记
- DB testStatus 永远是 last manual test 时间，不接 runtime 失败

相关：[[feedback_bridge_inmemory_health_to_db]]、[[feedback_idempotent_backend_ui_lying_success]]
