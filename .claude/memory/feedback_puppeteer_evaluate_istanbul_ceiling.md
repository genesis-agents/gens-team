---
name: feedback_puppeteer_evaluate_istanbul_ceiling
description: "Puppeteer page.evaluate(() => {...}) 闭包内代码 Istanbul (Node 端) 无法 instrument；含 5+ 个 evaluate 的 adapter 文件 line coverage 天花板 ~75%"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7c275681-3745-4c0b-b722-fbe6b75dc9e0
---

含大量 `page.evaluate(() => { ... })` 调用的 adapter 文件，line coverage 天花板约 70-75%，不能用 90% 标尺评判。

**Why**：Puppeteer 把 evaluate 内闭包源码序列化字符串发送到 browser context 执行，Node 端 V8 coverage hook 永远捕捉不到。`wechat.adapter.ts` 2328 行里 ~500 行在 evaluate 闭包内，COV-A 单测攻坚后仍只到 71% line / 56% branch / 41% func（已是 Node 可达上限）。

**How to apply**：

1. 估算 adapter 文件覆盖率目标前 grep `page.evaluate` 数量；多 evaluate 闭包的文件应用"Node 可达 line"分母而非"全文件 lines"
2. 排除分析时把这类文件单列：例如 ai-social 整体 88.69% lines 但排除 wechat.adapter 后为 92.91%（[[project_north_star_anthropic_managed_agent]] 类模块的真实质量水位）
3. 修法不是写更多 spec —— 是把 evaluate 闭包**外提**到 `wechat-save-draft.helper.ts` 类 pure module，让闭包变成有名函数引用（COV-F 在 wechat-image-uploader 这么做了，passthrough mock 让 helper 在 Node 直接跑，57% → 99% lines）

参考 reviewer 见 [[feedback_5_reviewer_parallel_audit]]：REV-ε 报"branch 71%"前应核 architectural ceiling，否则误报。
