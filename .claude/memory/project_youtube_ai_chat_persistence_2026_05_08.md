---
name: project_youtube_ai_chat_persistence_2026_05_08
description: 2026-05-08 YouTube 视频页 AI Chat 全链持久化（user × videoId）3 PR 落地，字幕/翻译已早就持久化无需改
type: project
originSessionId: 54c18056-7ea3-468e-afdd-91622f116738
---

## 背景与决策

用户反馈："字幕和翻译要保存持久化 / AI 聊天记录要保存持久化"
（截图：/explore/youtube?videoId=xxx 页面 Transcript 和 AI Chat 标签）。

实际现状（确认而非猜测）：

- **字幕 + 翻译**：早就持久化（`youtube_transcript_cache` 表，1 年 TTL，全局共享）
  - 写入：`uploadTranscriptToCache` / `saveTranslationToCache`
  - 读取：`fetchTranscriptSmart` / `fetchSavedTranslation`
  - 翻译合并 by start 时间戳（修过截短 bug 见 project_youtube_transcript_truncation_2026_05_05.md）
  - 用户确认"现状已 OK 无需改动"，不动它
- **AI Chat**：之前完全在 `useState`，刷新即丢，从零加上持久化

## 范围决策（用户多选确认后）

- 维度：**user × videoId**，不同用户互不可见，同一用户同一视频持续追加
- 不分会话/不分对话窗口（最简方案），切换视频另起一段
- 提交策略：连续推 3 个 commit 到 main，分多个"PR"

## 落地（commit 链）

| PR   | commit      | 内容                                                                                  |
| ---- | ----------- | ------------------------------------------------------------------------------------- |
| PR-1 | `8a2aa0877` | schema + migration `20260508e_youtube_ai_chat_messages`                               |
| PR-2 | `2fd049aec` | backend `youtube-ai-chat/` 子目录 service + controller + DTO + 接 explore.module      |
| PR-3 | `1a5109b99` | frontend `app/explore/youtube/page.tsx` 加 load on mount + persist on send + 清空按钮 |

## 关键非显然实现细节

1. **Assistant 内容持久化时机**：用 **本地 `assistantContent` 累积变量**，stream 正常结束（finally 且无错误）后一次写库；不要每个 SSE chunk 写一次。
2. **AbortError 分支也持久化部分内容**：用户主动 stop 但已收到内容时，把 `assistantContent` 写库，保留对话连续性；errored 占位文案（"AI 服务暂时不可用..."）**不入库**避免污染。
3. **streamFailed 标志**：catch 第一行设 `true`，AbortError 路径在 `return` 前自己 persist；finally 用 `!streamFailed` 守护避免重复写。
4. **匿名用户**：无 accessToken 即不读不写，纯内存行为不变；page.tsx 里 `if (!accessToken) setAiMessages([])` 切换用户/登出时清空。
5. **`fire-and-forget` 写法**：`void persistAiChatMessage(...)`，写库失败不阻塞 UI。

## 后端结构

- 路由：`GET / POST /api/v1/youtube/ai-chat` + `DELETE /:videoId`
- `@UseGuards(JwtAuthGuard)` 类级别全锁，userId 从 JWT 取**前端不传**
- DTO：`AppendChatMessageDto` - role IsIn(['user','assistant'])、content MaxLength(50_000)
- service 三方法：`listMessages` / `appendMessage` / `clearMessages`，全部 (userId, videoId) 维度

## DB

- 表 `youtube_ai_chat_messages` (user_id, video_id, role, content, model_id?, created_at)
- 索引 `(user_id, video_id, created_at)` 列表查询直接命中
- FK 用户级 ON DELETE CASCADE，用户注销自动清
- migration 用普通 `CREATE INDEX`，**不用 CONCURRENTLY**（reference_prisma_concurrently_pitfall.md）
- migration 直接 push 后 Railway 自动 prisma migrate deploy，本地手动 `prisma db execute` 是双保险

## 元教训

- **用户说"要持久化"≠ 还没做** — 必须先 grep / 读代码确认现状再问；本次字幕翻译早就持久化了，凭名字猜会错判工作量。
- **多 session 并发期 lint-staged stash 会污染暂存区** — 推 PR-2 后 git status 看到 stale staged controller.ts，是另一个 session 的 lint-staged stash 残留；用 pathspec `git commit -m "..." -- file/path` 安全提交，不要 `git add .` 也不要 `git checkout -- .`（feedback_multi_session_must_use_pathspec_commit + feedback_lint_staged_stash_safety）。
