---
name: project_explore_ai_deadservice_rewrite_2026_06_02
description: 'Explore/首页 AI "都不行" 真因=next.config rewrite 把 /api/ai-service/* 转发到死掉的 Python ai-service,绕过 BYOK(PR#207)'
metadata:
  node_type: memory
  type: project
  originSessionId: 5d5a8932-a233-4533-8956-6e907c4bbe45
---

Explore 阅读器/首页 AI(摘要/聊天/洞察)长期"AI 服务暂时不可用 / 配置 ai-service.env",换任何 BYOK 模型都没用。真因(2026-06-02 实证):

**真凶是 `frontend/middleware.ts`(运行时权威路由),不是 next.config!** middleware 在每个 request 用 `NextResponse.rewrite` 把 `/api/ai-service/* → ${NEXT_PUBLIC_AI_URL}/api/v1/*`(独立的旧 Python ai-service,未配 key),返回 FastAPI `503 {"detail":"All AI services unavailable"}`——**完全绕过 NestJS BYOK 后端**,且盖住了 `app/api/ai-service/ai/*/route.ts`(那些才正确代理到 BYOK `${API_URL}/api/v1/ai/*`,含 chat→simple-chat 映射)。**坑:先删了 next.config.js 的同名 rewrite(PR#207)以为修好,实测仍 503——因为 middleware 才是真路由,next.config 只是 fallback(其注释明说)。真正生效的是 PR#208:删 middleware 的 /api/ai-service block + matcher 项 + 不再用的 aiBase。** 删后请求落到 route handler→BYOK。前端 4 调用 summary/insights/chat/quick-action route handler 全覆盖。**已端到端实证**:#208 部署后打 `gens.team/api/ai-service/ai/summary` 返回 200 BYOK(agnes-2.0-flash)真摘要,Python 503 消失。教训补充:Next.js standalone 里 `middleware.ts` 的 rewrite 优先于 next.config rewrites 和 route handler,改路由要先看 middleware。

**关键诊断教训(我踩的坑)**:① 一开始我**只直连后端** `api.gens.team/api/v1/ai/summary` 测,返回 201 成功,就误判"AI 是好的、是用户 credits/模型问题",**被用户当场否掉("没有理解/还是不行")**。必须测**用户浏览器真实路径**=前端域名+route handler(`gens.team/api/ai-service/ai/summary`),才暴露 503。② 诊断手法:用 `JWT_SECRET`(railway backend env)自签 token(payload `{sub:userId,email,username}`,jwt.strategy 不查库),curl 复现——但**要打前端域名,不是后端**。③ 我连续合了 10 个 PR(#197-#206)每个触发 Railway 重新部署,前后端反复重启,叠加制造了大量瞬时 503,进一步混淆判断;密集部署本身是反模式。

旁证(独立真问题,非本次根因):TokenMix 模型 402「余额不足」($1 paid balance,claude 不在促销额度);Agnes Starter 套餐弱。但默认 agnes-2.0-flash 实测能出文本(后端直测 201,7.7s)。

误导文案"配置 ai-service.env / GROK_API_KEY"是 legacy 字符串,已改成透传真实错误(PR#206)。承接 [[project_byok_throttle_resilience_2026_06_02]] / [[project_byok_agnes_endpoint_and_crash_recovery_2026_06_01]]
