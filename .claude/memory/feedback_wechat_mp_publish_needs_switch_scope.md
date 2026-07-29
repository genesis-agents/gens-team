---
name: feedback_wechat_mp_publish_needs_switch_scope
description: 'WeChat MP 公众号自动化发布需要扫码登录时勾选"允许切换"勾选项；session 缺这个 scope 时 publish API 服务端就 ret=2 拒绝，跟客户端 dialog 同义'
metadata:
  node_type: memory
  type: feedback
  originSessionId: ab227f09-46d4-4a66-ba10-a59d3ce4bdac
---

WeChat MP (公众号) 后台 puppeteer 自动化发布场景，**必须在初次扫码登录时勾选"允许切换登录我的其他公众号、服务号、小程序"复选框**才能让 session 获得 publish scope。缺这个 scope 时：

1. **客户端**：点击"发表"按钮触发 dialog "未授权使用切换账号能力，请退出后扫码登录其他账号"，根本不发出 publish API
2. **服务端**：直接绕过 UI 用 `fetch` 调 `/cgi-bin/operate_appmsg?sub=publish` 或 `sub=submit` 也返 `ret=2` (无 err_msg)，generic 拒绝。同 endpoint 调 `sub=create` (saveDraft) 却 ret=0 — 证明 publish 校验 server-side 也起作用，不是单纯 UI 拦截

测试过 8 种 endpoint / schema 变体全失败：freepublish-submit/post (404)、operate_appmsg sub=publish/submit + AppMsgId 平铺 / count + groupid + sex + tofansnum + SubmitType / item_list JSON (全 ret=2)、masssend?action=submit (ret=200009 not found)、appmsgpublish (ret=200009)。

**Why:**

- 2026-05-16 用户文章 3d2f3e5d 自动发布 16 轮迭代真相：saveDraft 已成功 (appmsgid=535769570 真返回 ✅)，但 massSend 全部失败。这是**用户 session scope 问题**不是代码 bug
- WeChat MP 一个登录账号可能管理多个子公众号 / 服务号 / 小程序，"切换登录" scope 是为了允许在多个账号间选择目标发布账号。没勾这个选项的 session 即使只想发到主账号，WeChat 也认为缺乏 "选定发布账号" 能力，整个 publish 流程被拦
- saveDraft 不需要这个 scope（草稿不指向最终账号），publish 必须明确目标账号才能发出

**How to apply:**

- 写 WeChat MP 自动化适配器前，**用户首次扫码登录时务必勾选"允许切换"**——这是单一启用开关，session cookies 会带 scope
- 如果已有 session 失败原因是这个 scope，**没有代码 workaround**，必须让用户登出后重新扫码并勾选
- review WeChat MP 适配器测试报告时，看到 "未授权使用切换账号能力" 直接判定 = session scope 问题，不要再加 schema 候选浪费迭代
- 文档化登录流程时把这个 checkbox 标红，作为 "如果发不出去先回这一步" 的诊断起点
- 类似 third-party OAuth 也有 "scope 不全" 问题（如 GitHub OAuth 缺 repo scope）——通用反模式：登录时勾选不全后必须重做

**Related:** [[feedback_prosemirror_body_not_first]] [[feedback_sniff_runtime_token_from_requests]] [[feedback_computed_var_must_be_used]]
