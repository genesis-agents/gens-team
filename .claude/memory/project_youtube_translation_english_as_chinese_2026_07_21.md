---
name: project-youtube-translation-english-as-chinese-2026-07-21
description: 'YouTube 字幕翻译失效事故——缓存查询不分语言把英文当"原生中文"返回，前端预加载后按需 AI 翻译被永久跳过'
metadata:
  node_type: memory
  type: project
  originSessionId: 950a03fc-802e-4137-8e1e-97ce326a67ed
  modified: 2026-07-21T09:59:23.432Z
---

2026-07-21 事故：explore/youtube 翻译开关打开后"译文"显示英文尾巴，AI 翻译完全不触发。

**根因链（三层叠加）**：

1. `youtube.service.getTranscript(videoId, lang)` 缓存查询只按 videoId（唯一键），`language` 列存而不查 → `getTranscript(videoId, "zh")` 命中英文缓存原样返回。
2. `youtube.controller.getSubtitles` Strategy 1 把该结果当"原生中文字幕"→ `/youtube/subtitles` 返回 `chinese=英文段落, hasTranslation=true`。
3. 前端预加载（e5f593e01 引入）把英文塞进 `translations` map；`translations.has(index)` 为真 → `translate-single` 永不调用。多段落进同一合并块时后写覆盖先写，所以 UI 显示每块**最后一条英文原始片段**——这是此类 bug 的指纹。

**次生毒化**：`saveToCache` 把"请求语言"当"实际语言"落库；旧 zh 探测在竞态下会把英文内容以 language="zh" 写库。且各免费抓取路径 `_preferredLang` 形同虚设（全部英语优先尝试所有语言）。

**修复（feat/ai-music 分支）**：

- service：`TranscriptResponse.language`（仅缓存命中时填 `cached.language`，新抓取路径语言不可知故不填）。
- controller：删掉 `getTranscript(videoId, "zh")` 探测；native 中文判定 = `language.startsWith("zh")` **且** 前 20 段含 CJK（防已毒化的 language 标签）；saved AI 翻译直接复用第一次 getTranscript 返回的 `translatedTranscript`（省 2 次冗余调用）。
- 前端 preload：只接受含 CJK 字符的段（`/[㐀-䶿一-鿿]/`），双保险。
- 防回归测试：controller spec "must NOT present cached English transcript as Chinese" + "poisoned cache row"。

**教训**：按 key 缓存的多语言资源，读取时必须校验语言维度；"请求参数"与"实际结果属性"不能混写同一列。相关：[[project-youtube-sparse-translation-wipe-2026-05-05]]（7ee0accfd，同一缓存表的稀疏翻译覆盖主字幕事故）。
