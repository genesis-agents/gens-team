---
name: feedback_wechat_new_editor_schema_overhaul
description: WeChat 公众号 2024+ 新版编辑器 saveDraft schema 颠覆 thumb_media_id 旧模型；封面靠 6 cdn_url + crop_list0；正文图 schema 必须含完整属性 [PR #111 真发验证 ✓]
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

**2026-05-16 PR #111 (`3ab9eb203`) 真发验证通过 ✓** —— 草稿箱封面 + 正文图均正常渲染。彻底解掉 PR #97-110 撞墙 14 轮的问题。

WeChat 公众号编辑器 schema 在 2024+ 版本整体改造，PR #97-110 一直走错的方向直到 HAR 15.6MB 实证才反推清楚。

**真鼠标 saveDraft 字段（POST `/cgi-bin/operate_appmsg?t=ajax-response&sub=update&type=77&token=...`）核心 30 字段（multi-suffixed index 0）**：

封面（HAR 实证 6 字段 + JSON）：

- `cdn_url0` = 2.35:1 cover cdnurl（来自 crop_multi result[0].cdnurl）
- `cdn_235_1_url0` = 同 2.35:1
- `cdn_3_4_url0` = 2.35:1 兜底（HAR 实证用同 url）
- `cdn_1_1_url0` = 1:1 小卡 cdnurl（来自 crop_multi result[1].cdnurl）
- `cdn_16_9_url0` = "" (HAR 实测为空)
- `cdn_url_back0` = upload 原图 cdn_url（upload_material 直接返回）
- `crop_list0` = JSON `{crop_list:[{ratio:"2.35_1",x1:0,y1:0,x2:0,y2:0,file_id:N},{ratio:"1_1",...}], crop_list_percent:[...]}`

正文 `<img>` 内嵌（content0 里的图）：

```html
<img
  class="rich_pages wxw-img js_insertlocalimg"
  data-s="300,640"
  data-type="png"
  type="block"
  data-imgfileid="535769586"
  ←
  upload
  response.content
  (file_id)
  data-upload="1"
  data-aistatus="1"
  ←
  upload
  response.ai_status
  data-src="https://mmbiz.qpic.cn/..."
/>
```

**字段不用了**：`thumb_media_id`、`cdn_url_1_1`、`cdn_url_1_10`、`thumb_media_id0` —— 旧版 schema，PR #97-110 一直在传，新版编辑器忽略 → 草稿无封面。

**Why:**

- 上传 endpoint `filetransfer?action=upload_material&scene=8` 拿到的 file_id 是"图文文件夹"分类，不是 cover-合法。location 字段（bizfile vs wxmaterial）跟 cover 合法性无关。
- WeChat 服务端在 saveDraft 时按 crop_list0 几何描述 + 4 个 cdn_url 字段重渲染封面缩略图，旧 thumb_media_id 路径已弃用。
- HAR 实证 URL 含 type=77 但跟"小绿书"无关，是新版编辑器的 sub-type 标记。

**How to apply:**

1. 上传图（任何外部 URL）→ `filetransfer?action=upload_material&scene=8` 拿 cdn_url + content (file_id) + ai_status
2. 调 `cropimage?action=crop_multi` 把 cdn_url 按 2.35:1 + 1:1 两个比例剪 → 拿 result[0].file_id + result[1].file_id + 各自 cdnurl
3. saveDraft body 用 6 个 cdn_url 字段 + crop_list0 JSON，**不要**传 thumb_media_id
4. 正文 `<img>` 必须用 `class="rich_pages wxw-img js_insertlocalimg"` + 完整 data-\* 属性

诊断手段：抓 HAR 时**同时录"本地上传"+"封面 crop"+"saveDraft 自动触发"完整 30s+** 三段，对比真鼠标 postData 字段集合。

相关：[[feedback_wechat_filetransfer_content_is_mediaid]]、[[feedback_wechat_type77_drops_title]]、[[feedback_sniff_runtime_token_from_requests]]、[[feedback_react_controlled_native_setter]]。
