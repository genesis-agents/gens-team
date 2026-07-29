---
name: feedback_wechat_filetransfer_content_is_mediaid
description: WeChat filetransfer-upload-material 把 file_id 塞在 data.content（数字字符串），不在 file_id/media_id 字段；解析器必须按 URL 形态判别
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

WeChat MP `/cgi-bin/filetransfer?action=upload_material` 真实响应 shape：

```json
{
  "base_resp": { "ret": 0, "err_msg": "ok" },
  "location": "bizfile",
  "type": "image",
  "content": "535769576",
  "cdn_url": "https://mmbiz.qpic.cn/...",
  "ai_status": ...
}
```

**`media_id` 在 `data.content` 字段**，且是**纯数字字符串**，不在常规 `file_id / media_id / mediaid / id / mid` 任何一个 key。

**Why:** 不同 WeChat endpoint 用不同 response shape：`upload_img` 给 `url`，`upload_material` 给 `content`+`cdn_url`。同一字段名 `content` 在另一些 endpoint 里又可能是 URL。如果解析器只列常规字段或盲目当 `content` 是 URL，就会出现 `mediaId=null` → saveDraft 走 `thumb_media_id="0"` 兜底 → WeChat 草稿箱无封面。

**How to apply:** 任何 WeChat upload 类 endpoint 的 parser 都按 _URL 形态判别_：

- `data.content` 以 `http://` / `https://` 开头 → 当 `cdnUrl` 兜底
- 否则 → 当 `mediaId/file_id` 候选注入到字段链尾部

诊断手段：response keys + body 前 400 字符必须打 log（`keys=[base_resp,location,type,content,cdn_url] body=...`），否则下次又要靠拍脑袋猜字段。

相关：[[feedback_wechat_type77_drops_title]]、[[feedback_react_controlled_native_setter]]。
