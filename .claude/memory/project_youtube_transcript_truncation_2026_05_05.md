---
name: youtube-transcript-truncation-2026-05-05
description: explore/youtube 字幕只剩 1 段事故根因 — saveTranslation 覆写 + getTranscript 优先返回 translatedTranscript，前端按需翻译 flush 即污染全局缓存
type: project
originSessionId: acdf2e58-962d-41b9-bf28-19d5d36e5773
---

事故：用户反馈 explore/youtube 视频 `PplmzlgE0kg`（Cat Wu 那期）右侧 Transcript 只显示 1 句话。

DB 状态确认：

- `transcript`: 2356 段（原始英文，正常）
- `translatedTranscript`: 1 段（仅 1 段，`text` 字段还有"Honold"/"Capetan"等 ASR 错拼），`translatedAt: 2026-04-29 15:59`
- 翻译语言 `zh-CN`，但前端拿到的就是这 1 段塞进 transcript

双 bug 链：

1. **`youtube.service.ts:117-120`（commit 463263254 / 2025-12-10 引入）**：cache hit 时 `hasTranslation ? translatedTranscript : transcript`，把 1 段稀疏翻译当主字幕。
2. **`youtube.service.ts:316` saveTranslation**：直接 `update({ translatedTranscript: input })` 覆写。前端 `flushPendingTranslations` 只发用户已观看的几段（debounce 后 / 切页时），所以看 2 秒就关页 = 全局缓存被减到 1 段。

修复：

- `getTranscript` 始终返回原始 `transcript`，新增 `translatedTranscript?` 副字段（commit pending）
- `saveTranslation` 改为按 `start` 时间戳 merge 而非覆写；目标语言变更时才整体替换
- `youtube.controller.ts:144` getSubtitles 改读 `translatedTranscript` 字段
- 加 2 个 regression spec：merge / target 语言变更

**Why**：原来设计 translatedTranscript 是给 bilingual export 通道用的副数据，被错误当成主通道 fallback。前端"按需翻译"是渐进填充，必然产生稀疏数组。

**How to apply**：

- 任何"主数据 vs 衍生数据"的缓存字段，主路径绝不能 fallback 到衍生字段
- 缓存的"按用户行为渐进生成的数据"必须 merge-not-overwrite（参考 vector_memory / postmortem 也是 upsert 而非覆写）

DB 清理：直接 SQL `UPDATE youtube_transcript_cache SET translated_transcript = NULL... WHERE video_id = 'PplmzlgE0kg'`，全表只这一行受影响（`translated_transcript IS NOT NULL AND len(translated) < len(transcript)` 查询返回 0）。

启动日志 `[YOUTUBEJS][Player]: Failed to extract signature decipher function` 是 youtubei.js 库针对**视频流签名解密**的报错（用于下载 mp4），与字幕通道无关。字幕走 timedtext API → youtube-transcript npm → fallback → Supadata 四级，不依赖 signature decipher。
