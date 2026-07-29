---
name: frontend-bug-check-network-response-first
description: 前端 UI 显示异常时，第一步必须先要 Network → Response body，不要先去后端诊断
metadata:
  node_type: memory
  type: feedback
  originSessionId: 494c61c5-c748-4a7c-a8fd-f4d7cda538da
---

前端 UI 显示空 / 异常 / 错误时，**第一句话**必须是请用户打开 DevTools → Network tab → 找对应请求 → 截 Response body 截图。

**Why**: 2026-05-19 social data sources "暂无可用数据源" bug，我花了 5 次失败 commit + 几小时反复诊断后端 registry / Discovery / spread / SWR cache / Railway 部署等"上游"问题，全部跑偏。直到用户截 Response body 给我看，3 秒钟定位真实 bug —— 后端有 ResponseTransformInterceptor 把响应包成 `{success, data, metadata}` 但前端 `fetchJson` 没解包，全部读到 undefined。Response body 自己已经包含答案，但我从没看过它就开始猜。

**How to apply**:

- 前端报"空 / 显示不出来 / 数据不对"类 bug，第一步永远是要用户截 Network → Response body
- 不要先 curl 后端、不要先跑 integration test、不要先写诊断脚本
- 看到 Response body 后再判断方向：内容对 → 前端解析；内容错 → 后端逻辑
- 例外：如果用户已经截了 Response body 说"后端返回的就是 X"，那才进入后端诊断

相关：[[feedback_root_cause_before_fix]] 强成功标准 / [[project_social_intent_driven_redesign]]
