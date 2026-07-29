---
name: feedback_abort_must_have_reason
description: 'AbortController.abort() 必须传具体 reason (new DOMException(msg, name))，否则浏览器抛 "signal is aborted without reason" 用户看不懂'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

任何代码调用 `controller.abort()` 都必须传 reason — `new DOMException(msg, name)`
或 `new Error(msg)`。否则浏览器在被 abort 的 fetch 上抛
`DOMException("signal is aborted without reason")`，UI 直接显示这串英文，
用户无法区分超时 / 用户取消 / 组件卸载，只能弹"signal is aborted without reason"。

**Why**：Screenshot_62 (2026-05-12) Wiki ingest dialog 点"运行 Ingest" 后红色错误
"signal is aborted without reason"。根因 lib/api/client.ts 的 `setTimeout(() =>
controller.abort(), timeout)` 不传 reason。修复 commit `1a1bace4b` 改为
`controller.abort(new DOMException(`Request timeout after ${ms}ms`, 'TimeoutError'))`

- 调用方按 `err.name === 'TimeoutError'` 分发到 i18n 友好文案。

**How to apply**：

- 项目所有 AbortController.abort() 调用必须带具体 reason
- timeout 类的 abort → `new DOMException(msg, 'TimeoutError')`
- 用户取消类的 abort → `new DOMException(msg, 'AbortError')`
- externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason ?? new DOMException(...)))
- UI 层 catch 后按 `err.name` 分发：
  - TimeoutError → "请求超时（>Xs），请减少数据量重试"
  - AbortError → "已取消，请重试或刷新页面"
- 走 i18n key 别硬编码中文（zh.json + en.json）

关联：[[feedback_no_lying_assertion]]
