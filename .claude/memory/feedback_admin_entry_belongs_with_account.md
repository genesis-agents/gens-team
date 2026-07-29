---
name: chrome-admin-entry-userprofilebutton
description: 'Sidebar/MobileNav 等全局 chrome 中"管理后台/系统"入口不要混在业务 nav 里，必须放到 UserProfileButton 同一区块（账户元操作语义中心）'
metadata:
  node_type: memory
  type: feedback
  originSessionId: a67ed222-b220-4885-9230-033fd6d1e8ea
---

在 Sidebar / MobileNav / AppShell 等全局 chrome 里，admin 入口（管理后台 / 系统 / 后台管理）必须紧贴 UserProfileButton，不要和"AI 写作 / AI 问答 / 探索"这些业务 nav 并列。同时入口名称用"系统"而不是"管理后台"——后者听上去像独立产品，前者是元层语义。

**Why：** 2026-05-12 截图反馈（Screenshot_57）：admin 入口原本与业务功能并列时被反复误点 / 错把它视作一个业务模块；改名"系统"并下沉到用户名下方后，admin 立刻被识别为"我这个账号的元操作"，与登出 / 个人资料 / 语言切换天然成组。这与 [[feedback_admin_workflow_must_match_intuition.md]] 在 admin 内部页面的"操作语义中心"原则同根：admin 是账户能力，不是业务能力。

**How to apply：**

- 任何全局导航条加 admin / 系统管理 / 后台 入口时，强制放进 UserProfileButton 下方或同卡片，不与业务条目同列
- 中文用"系统"，英文用"System"——不要 "Admin"（产品感）或"管理后台"（独立模块感）
- Sidebar + MobileNav 必须双对称改：桌面端改了的话移动端立刻镜像，永远不要让两端 admin 入口位置不一致
- 仅当 `isAdmin` 为真时才渲染该入口（避免普通用户感知到系统里还有"另一个隐藏的 app"）
- 改完后 grep `nav.admin` 看是否还有遗留消费方（用户菜单 dropdown 里可能也有重复入口，要去重）
