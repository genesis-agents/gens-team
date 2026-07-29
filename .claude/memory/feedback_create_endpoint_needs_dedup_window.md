---
name: feedback_create_endpoint_needs_dedup_window
description: 耗时创建型 POST（启动 mission/job）必须 ≥10s dedup window 防 frontend 双调用 cancel-and-recreate
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

**耗时创建型 POST（启动 mission / job / 后台任务）服务端必须有 dedup window，不能"找到 existing 就 cancel 重建"。frontend React StrictMode 双调用 / 用户双击 / 多组件并发 useEffect 会让同一意图 1-3s 内重复发起 2 次。**

**Why:** 2026-05-13 prod 01:11:38 用户点"启动" → mission 4b38e09f 创建+ PLANNING；01:11:41（3s 后）frontend 又 POST 同 endpoint → server 看到 existing mission 立刻 cancel + 启动 mission 307597af。白烧已发的 Leader.plan LLM token + UI 上 mission id 闪变 + 第一次的 planning 返回结果被静默丢弃。10s window 内的重复 POST 应该幂等返回 existing。

**How to apply:**

- 检查 existingMission.createdAt 与当前时间差 < window（建议 5-10s）→ 幂等返回 existing，不 cancel 不 create
- 超过 window（用户真心想重启）才走 cancel-and-recreate
- window 阈值依据：React StrictMode 双调用 <1s + 双击 debounce <500ms + 网络抖动 <2s = 至少 5s，给余量到 10s
- 配合 [[feedback_idempotent_backend_ui_lying_success]]：幂等后端 + 前端按状态过滤双管齐下
- 反例（已踩坑）：前端 disabled 按钮防双击是 client-side 单点防御，server 端没护栏一旦 disable 状态丢（页面刷新 / 多 tab）必复发
