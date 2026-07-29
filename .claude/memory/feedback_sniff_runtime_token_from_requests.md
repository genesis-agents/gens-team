---
name: feedback_sniff_runtime_token_from_requests
description: "JS-runtime 计算值（fingerprint/CSRF/nonce）不在 window 公开时，从 page.on('request') 真请求里 sniff，不要靠 window/HTML scrape"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

写浏览器自动化（puppeteer/playwright）需要把 JS 运行时计算出来的反爬 token（fingerprint hash / CSRF / nonce / signed payload）放进自己发的 API 请求时，**必须 `page.on('request')` 拦截页面自身的真请求 sniff 出来**，不要靠 `page.evaluate(() => window.xxx)` 或扫描 inline `<script>` 取值。

**Why:**

- 2026-05-16 WeChat MP saveDraft API 直发链路：fingerprint 是浏览器侧 JS 算出来的 32-hex（疑似 device fingerprint + cookies hash），WeChat 把它塞进每个出站请求的 URL/body。代码先尝试 `window.wx.commonData.fingerprint` / `window.wx.fp` / inline `<script>` 正则匹配 → 全空。结果 API 直发 body 里 `fingerprint=` 是空串，WeChat 拒签 `ret=200002 "参数错误"`。原因：WeChat 把它做成 closure 私有变量，不挂到 window。
- 同类反爬/反 CSRF token 的设计模式：值只在某个 IIFE/module 里活，仅在出站请求构造时使用，window 不可见
- 浏览器侧 evaluate 拿不到 = 把所有 scrape fallback 都堆上也是空 (window 兜底 / `cgiData` / `<script>` regex / `document.documentElement.outerHTML`)；越堆越像绝望表演

**How to apply:**

- 流程：`publish()` 顶部装一个 `page.on('request', handler)`，监听同域出站，从 URL（query string）和 `request.postData()` 都 grep 目标 token 正则（如 `/[?&]fingerprint=([a-f0-9]{32})/i`）
- 用闭包变量存 sniffed 值，短路 `if (state.token) return;` 避免重复处理
- 编辑器若是新 tab（targetcreated），新 page 也要 attach 同一份 handler
- 把 sniffed 值作为参数传到下游 API 直发函数，而不是再 evaluate 一次（fingerprint 可能在 evaluate 时间点都没生成）
- 给"如果还没 sniff 到"补 2s 等待时间，给页面慢请求（spellcheck / pre_load / auto-save）漏网
- 仍想保留 window scrape fallback 链 → OK，但只作为兜底优先级最低；不要颠倒顺序

**红线**：

- 不要"我先 evaluate window，找不到再 sniff"。evaluate 永远 lose race；先装 listener 再触发会让页面发请求的动作
- 不要靠 fixed string scraping inline script —— 反爬 token 现代实现都不写进 script 文本

**Related:** [[feedback_computed_var_must_be_used]] [[project_grade_cascade_real_root_cause_2026_05_13]]
