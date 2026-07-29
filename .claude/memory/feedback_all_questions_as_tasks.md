---
name: 所有用户问题/请求必须记录为任务
description: 用户每提一个问题/需求/截图反馈，必须先 TaskCreate 记录，再处理；不能口头答复完就过
type: feedback
originSessionId: ccbd980d-4dd8-4cfe-819e-c57149f57eb0
---

**规则**：用户给我的所有问题（含截图反馈、临时需求、附带说一句的请求），都必须 TaskCreate 记录成任务来处理，不能只口头答复就过。

**Why**：用户 2026-04-30 mission 监控期间穿插提了 2 个问题（"参考 TI 加 KB 选择" + "工具空结果还存在"），我用文字处理但没建任务，用户明确指示"我给你的所有问题，都要记录成任务处理"。监控 / 排查 / 设计这种多步任务，没有 task 列表会丢。

**How to apply**：

- 用户每发一条新需求/问题/截图反馈 → 立即 TaskCreate（一条问题对应一条 task）
- 用户的反馈（feedback memory）也要 TaskCreate 标记沉淀任务，不能只 Write 文件就完事
- 当一轮多个问题穿插进来 → 一个 TaskCreate 块批量建，不要漏
- TaskCreate 之后才开始 Bash/Read/Agent 等动作
- 每个任务 in_progress / completed 状态要随实际进度更新
- 完成后回复时，一句话提一下"在 task #N"，让用户知道追踪到了
