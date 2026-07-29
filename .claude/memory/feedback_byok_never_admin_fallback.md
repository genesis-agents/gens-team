---
name: feedback-byok-never-admin-fallback
description: "BYOK/任何请求绝不静默回退 admin key/model;授权走既有 ASSIGNED 路径(需 userId),不要造新 env 开关,不做用户 UI"
metadata:
  node_type: memory
  type: feedback
  originSessionId: aa7b8f6c-d97e-4b52-a56e-ff61bfd4e543
---

平台是严格 BYOK:任何 AI 调用**绝不静默使用 admin 的 key / DB 配置的
provider model 兜底**。用户原话:「BYOK 就是 BYOK,不要搞 UI」「BYOK 不要到
admin,除非授权」。

**Why:** 2026-05-25 事故链里发现,登录用户路径早已严格(2026-05-05 key-resolver
删 SYSTEM fallback、2026-05-12 model-config 严格 BYOK),但**无 userId 的后台/
系统任务**仍会回退 admin AIModel + SYSTEM secret(`getDefaultModelByType` /
`pickBYOKModelForUser` / `getAllEnabledModelsByType` 三处),这是平台被静默烧钱
的最后入口。配合后台调度默认关([[feedback-background-spenders-default-off]])
一起收口。

**How to apply:**

1. "授权"用**既有的「用户向系统申请」ASSIGNED(KeyAssignment)路径**——它本就
   算在 BYOK 范围内(用户向 admin 申请到某 admin model),且**必须带 userId**。
   不要为此新造 env 开关 / DB 配置 / 用户 UI 开关(用户明确否决了这些)。
2. 无 userId(background cron/health-check/系统任务)= 无法授权 → 选模型返回
   `null`/`[]`,让任务优雅失败/跳过,绝不静默用 admin key。后台要跑 AI 必须在
   带授权用户上下文(PERSONAL/ASSIGNED)下运行。
3. 真正无人值守的系统基础设施(如 embedding 系统索引)可走**显式 env key**
   (如 `OPENAI_API_KEY`)兜底——那是运维显式授权,不是偷用 admin BYOK。
4. 控制面是**运维/Admin 层(env / admin 配置)**,**不做面向终端用户的 UI 开关**。
5. admin 自己的配置展示端点(`admin.service` 直查 `aIModel`)与选模型无关,不受
   这条约束影响。
