---
name: feedback_react_controlled_native_setter
description: puppeteer keyboard.type 对 React controlled input/textarea 不可靠（_valueTracker 看不到变化），必须用原生 setter + dispatch input event
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

Puppeteer 自动填 React controlled `<input>` / `<textarea>` —— 不要用 `element.click({clickCount:3}) + page.keyboard.type(...)`，必须用 **原生 setter + dispatch input event**。

**Why**: React 内部 `_valueTracker` 记录每个 controlled element 的"上一次 value"。`keyboard.type` 触发原生 input event，但 React onChange handler 读 tracker 时认为 value 没变（tracker.getValue() === element.value 两边都是新输入但 React 没识别 native change）→ React state 不同步 → 提交 form 时 state 还是空。2026-05-16 微信公众号 title fill 实测：log 显示"Title filled successfully" 但 saveDraft 后保存的 title 真的是空字符串（用户截图为证）。

**How to apply**:

```typescript
await page.evaluate((value: string) => {
  const target = document.querySelector<HTMLTextAreaElement>("selector");
  if (!target) return;
  const proto =
    target.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) return;
  target.focus();
  setter.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  target.blur();
  target.dispatchEvent(new Event("blur", { bubbles: true }));
}, value);
```

- 适用：任何 React/Vue/Angular controlled form input，包括 WeChat / Weibo / Zhihu / 公众号 backend / Notion / Linear / 任何 modern SPA
- 反模式：`await el.click({clickCount:3}); await page.keyboard.type(value);` —— silent 失败，log 看似成功
- contentEditable / ProseMirror 等富文本编辑器不适用此招（它们不是 controlled value），需要 page.evaluate 直接调编辑器 API 或 dispatch paste event
- 关联：[[feedback_no_lying_assertion.md]] —— log "Title filled successfully" 也是 lying
