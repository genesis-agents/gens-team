---
name: feedback_login_page_is_canonical_entry
description: "未登录态按钮不要直接调 loginWithGoogle() 弹 Google OAuth；统一 router.push('/login') 让用户先到登录页选 Google or 本地账号"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

未登录态在业务页面（ai-ask / ai-office / ai-social / feedback/history / explore 等）的"登录"按钮，**禁止**直接 `onClick={loginWithGoogle}` 直跳 Google OAuth 弹窗；必须 `router.push('/login')` 走规范登录页。

**Why:**

- 用户 2026-05-15 截图反馈："这个登录界面太他妈的难看了！！！点击页面的都无法跳转到这个页面！！！"
- /login 才是 canonical entry，同时支持 email+password 本地账号、Google OAuth、admin BYOK 后续接入 SSO；业务页绕过 = 用户被强制 Google、本地账号入口永远到不了
- /login 已 SOTA 化（单栏 400px 居中卡）；继续直跳 Google 等于把整条登录路径架空

**How to apply:**

- 业务页 `if (!user)` 分支按钮只允许 `router.push('/login')`
- 检查清单：grep `onClick={loginWithGoogle}` / `loginWithGoogle()` 出现在 page.tsx 全部要修
- /login 自己的 Google 按钮 OK 保留，那是用户主动选 Google 的入口
- AuthContext.loginWithGoogle 函数本身保留（/login 内部用），不要 export 给业务页

**Related:** [[feedback_admin_workflow_must_match_intuition]] [[feedback_screenshot_first_then_diagnose]]
