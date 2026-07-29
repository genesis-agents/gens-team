---
name: feedback_wechat_type77_drops_title
description: WeChat type=77 小绿书编辑器对 type=10 schema saveDraft 返回 ret=0 但 silently drop title/cover；自动选 type 是反模式
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

WeChat MP 文章 type 不要按 contentLength 自动切，永远用 **type=10**（普通图文）。

**Why**: 2026-05-16 用户实测（screenshot Screenshot_20.png）—— 短内容（846 char）被自动切到 type=77 小绿书编辑器，saveDraft API 返回 ret=0 + appMsgId 看似成功，但保存后 title 空白、无封面。helper.ts 三个 schema 候选都是 type=10 字段名（title / title0 / content / content0），WeChat 对 type=77 编辑器 accept 但 silently drop 它不认识的字段。"appmsgid 在 URL 上"≠"字段都写进去了"。

**How to apply**:

- backend/src/modules/ai-app/social/adapters/wechat.adapter.ts line 47 类逻辑：const articleType = "10"; 写死，不再 ternary
- type=10 无字数限制，短内容也完全支持；不要被"小绿书适合短文"宣传带偏，质量保真度优先
- saveDraft API ret=0 不能直接判定成功，必须看 saved 后 article 状态（用户截图 / 真实页面读取）
- 类似的"server accept 但 silently drop"模式适用于任何 platform：response 不 echo 输入字段时要警惕
- 关联：[[feedback_test_connection_must_verify_runtime.md]]（只检 auth 就报 OK 是反模式）
