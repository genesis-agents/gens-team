---
name: feedback_prosemirror_body_not_first
description: "多 ProseMirror 编辑器并存时不能 querySelector('.ProseMirror') 取首个；用 .ProseMirror-focused / offsetHeight 最大者 / 容器路径定位"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

页面 DOM 同时存在多个 `.ProseMirror` contenteditable 时，**严禁 `querySelector('.ProseMirror')` 取首个 DOM match**。需要按以下优先级精确定位 body editor：

1. `.ProseMirror.ProseMirror-focused`（焦点指示是 body）
2. 容器路径锚定：`.rich_media_content .ProseMirror` / `.appmsg_edit_area .ProseMirror` / `[role="textbox"].ProseMirror`
3. 兜底：所有 contentEditable 的 `.ProseMirror` 按 `offsetHeight` 降序（body 视觉区域几乎总是最高）

**Why:**

- 2026-05-16 WeChat 公众号 publish 死症 14 轮真根因：fillContent 用 `querySelector('.ProseMirror')` 取首个，结果 paste/keyboard.type 全写到 DOM[6] (digest 编辑器)，body editor (DOM[14] `.ProseMirror-focused`) 一直空。下游 `keyboard.type` 兜底又落到当前 focus = title TEXTAREA，造成 **WeChat 内部 state title 字段 = body HTML** 的离奇症状。WeChat mplog 自报 "this is fail save path + terminal three: postDataReturnFun"，校验自然失败拒签 ret=200002
- 现代富文本编辑器（WeChat MP / 微博 / Notion-style 等）几乎都用同一个 ProseMirror 实例渲染多个区域（标题 / 摘要 / 正文 / 备注），DOM 顺序不固定
- "First match" 是反模式，反模式因为它静默错对 + 难以从外部观察（看 DOM 没问题，看 API 失败也猜不到是 fillContent 错位）

**How to apply:**

- Puppeteer/Playwright 操作 ProseMirror 类编辑器前，先 dump 所有 `.ProseMirror` 元素的 offsetHeight + className，确认 body 是哪个
- 验证内容长度时用同样的 pickBody 逻辑，**不要再 `querySelector('.ProseMirror')` 二次取首个**（这是 PR #100 之前的隐性 bug 模式）
- keyboard.type 兜底前必须显式 `evaluate(() => bodyEditor.focus())`，否则 cursor 留在 title/digest 等错位 input
- 单测覆盖 "页面有多个 ProseMirror 时正确选 body"，mock 多个 `.ProseMirror` DOM 节点

**Related:** [[feedback_computed_var_must_be_used]] [[feedback_sniff_runtime_token_from_requests]]
