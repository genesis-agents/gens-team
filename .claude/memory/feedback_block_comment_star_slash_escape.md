---
name: feedback-block-comment-star-slash-escape
description: TS/JS 文件块注释里写 cron 表达式 / regex 字面含 */ 会让块注释提前结束；用单行注释 + new RegExp(...) 构造器
metadata:
  node_type: memory
  type: feedback
  originSessionId: eb9df724-2242-4336-8d27-58151c093da9
---

任何 `*.ts` / `*.tsx` 文件里写文档注释或 inline 注释**不能含字面 `*/`**，会被 TS 编译器和 IDE 都识别成块注释结束符。

**Why**：AI Radar PR-R1 `radar-topic.service.ts.assertCron` 注释里写 cron 例子 `0 */6 * * *`，块注释 `/** ... */` 在 `*/` 处提前结束，下面整段函数体被认成 stray code → tsc 报一堆 unexpected token。同样陷阱在 regex 字面 `/.../` 也存在——RegExp literal 含 `*/` 在某些上下文（如对象字面值/JSX 内）会引起 parser 噩梦。

**How to apply**：

- 块注释里写 cron / regex / glob 含 `*/` 字符时，**改用单行 `//` 注释**或用反斜杠/拆字符串 `"*" + "/"`
- regex 优先用 `new RegExp("xxx")` 构造器写而非 `/xxx/` 字面，特别是带 `*/` `?/` 的
- IDE 块注释颜色突然变了 = 提前结束的信号，立即改
- 高发场景：
  - cron 验证 service（`*/N` 表示每 N 分钟）
  - regex 注释（`/* matches */` 这种写法直接炸）
  - URL pattern 注释（`https://x.com/api/*/users`）
- 同样陷阱：JSDoc `@example` 块内写 cron 也会炸——`@example 0 */6 * * *` 必须 escape 或换单行注释
