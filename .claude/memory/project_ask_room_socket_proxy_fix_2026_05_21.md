---
name: project_ask_room_socket_proxy_fix_2026_05_21
description: AI Ask 房间代理环境 socket xhr poll error 根因 + 修复 + 故意未做的同类隐患
metadata:
  node_type: memory
  type: project
  originSessionId: 1adb6dfb-5cce-46fa-966f-91512c3454a9
---

2026-05-21：代理环境（自定义域名如 gens.team）进 AI Ask 房间报 `出错了: Socket 加入失败：connect_error: xhr poll error`。

**两个根因**（任一单独可触发）：

1. 后端 `ai-ask-room.gateway.ts` CORS 是硬编码数组，仅含 `*.up.railway.app` + FRONTEND_URL —— 自定义域名握手被拒。
2. 前端 `useAskRoomSocket.ts` 用 `NEXT_PUBLIC_API_URL?.replace('/api/v1','') || 'localhost:3001'`，既不绕 Next.js 代理（rewrites 只代理 `/api/v1/*`，不代理 `/socket.io/*`），未注入时还兜底到 localhost。

**修复**（用户选：函数式 CORS + ask-room 改 URL + 优雅降级）：

- 后端 CORS 改函数式（mirror main.ts/topic-insights）：放行无 Origin + dev localhost + CORS_ORIGINS/FRONTEND_URL/RAILWAY_FRONTEND_URL/APP_CONFIG.railway.\*。
- 前端 socket 改 `config.getBackendUrl()`（mirror radar/social/agent-playground）；`connect_error` 不再弹致命红条，仅 ack.ok===false 真 join 拒绝才报。

**部署前置**：前端域名必须在后端 `CORS_ORIGINS` 或 `FRONTEND_URL`，否则函数式 CORS 仍拒（非 `*`）。

**故意未做（用户明确缩范围，后续隐患）**：`useNotificationSocket` / `useWritingWebSocket` / `useResearchWebSocket` 仍是同款 `localhost:3001` 旧兜底；`ai-writing` / `ai-teams` 网关仍是严格白名单 CORS。同类问题随时可在这些模块复现。参见 [[feedback_socket_use_config_getbackendurl]]。

## 第二轮（真正的核心问题，commit 476620397）

socket connect 修好后用户说"团队模式没有任何输出"。我**错误地**死磕日志里的 `callXAIAPI 402` + `ModelPricingRegistry not in registry`，连续断言"没额度/key 不对/max_tokens=16000 预扣"，被用户连续打脸：有额度、同一个 key、用的 BYOK、**实际上过了一会回复了，只是代理电脑上看不到**。

真因 = 用户从第一句就说的：**代理环境实时送达**。房间 100% 依赖 socket 显示流式输出；代理缓冲/掐断 socket.io 长连接 → AI 回复已生成且落库，代理机却永远看不到（我前面把 connect_error 静默后更像"什么都没有"）。402 是支线（deepseek 成员失败兜底，grok 成员正常出，截图可见输出确实在）。

**修复**：镜像单聊 `ai-ask-stream.ts` 的 `reconcileAfterStreamCut` 对账轮询——

- `ask-room.store.ts` 加 `reconcileMessages(messages)`：按 id 去重合并已落库消息 + 清 stale pending。
- `RoomChatPage.tsx`：发送后轮询 `getRoom`（先给 socket 1.5s，之后每 3s，~3min 上限），直到该 turn 在 recentTurns 终态。socket 能用时冗余无害（同 messageId 去重），代理掐 socket 时是唯一生路。
- 关键：runtime `persistMessages` 在 `finalizeTurn` 之前，故 turn 终态时消息必已落库，轮询拿得到。

教训见 [[feedback_dont_double_down_on_theory_when_user_pushes_back]]。
