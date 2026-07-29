---
name: 自定义 Agent 三件套 + mission 通知 404 修复（2026-05-06）
description: /custom-agents/{id} ErrorBoundary 真因——本项目是 Next.js 14，params 是同步对象不是 Promise；i18n 缺 myAgents/myAgentsViewAll/myAgentsManage 3 key；wizard 加一键填默认；mission completed actionUrl 双错 /playground→/agent-playground + /missions→/team
type: project
originSessionId: 88bcab33-4afa-40e3-9995-d1e247e94ef0
---

# 截图反馈 4 件修复

## 1. ErrorBoundary 真因：params 不是 Promise（Next.js 14）

**症状**：进 `/custom-agents/{id}` 直接 ErrorBoundary "出错了"。

**真因**（更正）：本项目 frontend 是 **Next.js 14.2.35 + React 18.3**，
dynamic route 的 `params` 是**同步对象** `{id: string}`，不是 Promise。

- 旧代码 `use(params)`：React 18 没有 `use()`；即便垫片处理，内部会调 `.then()` → 抛
- commit `0246c804f` 的"修复" `void params.then((p) => ...)`：直接 `.then` 同步对象 → 抛 **"c.then is not a function"**，整页落 ErrorBoundary

> ⚠️ memory 早期写的"React 19 use(params) hydration #438/#418/#423"是错诊断；
> 浏览器堆栈里的 `use` 调用只是因为 use 内部去 unwrap 一个不是 promise 的 params 才挂的。
> 真因是错把 Next 15 的 `params: Promise<>` 约定套到 Next 14 上。

**修复**（commit 待落，2026-05-06 二次修）：

```ts
// ❌ 旧 v1：use(params)            —— React 18 没 use
// ❌ 旧 v2：void params.then(...)  —— params 不是 Promise，运行时炸 c.then is not a function
// ✅ 现在：直接同步取
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  // ...
}
```

附加修：

- 404 时友好 not-found UI（防 Sidebar stale 缓存死链）
- MissionCard 防 `mission.depth.toUpperCase()` null 崩

**Why**：dynamic route 的 `params` 类型在 Next 14（同步对象） vs Next 15（Promise）之间断代变更。`package.json` 是判定权威——别凭印象写。

**How to apply**：

- 改 `app/**/[*]/page.tsx` 前先 `grep '"next"' frontend/package.json` 确认主版本
- Next.js 14 → `params: { id: string }`，直接 `const { id } = params`
- Next.js 15 → `params: Promise<{ id: string }>`，server component 用 `await params`，client component 用 `use(params)` 或 useEffect 异步解
- 跨版本逻辑差异：升级 Next 14→15 时全量 grep `app/**` 的 `params:` 类型

**反向教训**：诊断 ErrorBoundary 时不能把浏览器堆栈里出现 `use` 就当 React 19 hydration——先看 package.json，别让"先入为主的根因"覆盖证据。

## 2. Sidebar i18n 3 个 key missing

**症状**：截图里 Sidebar "我的 Agent" 区只显示 displayName + "+"，**没有分组标题**。

**真因**：`zh.json` / `en.json` 缺 3 个 key：

- `nav.sections.myAgents`
- `nav.myAgentsViewAll`
- `nav.myAgentsManage`

代码 `Sidebar.tsx:706` 已经写了 `t('nav.sections.myAgents')`，但翻译没加，i18n fallback 返回空字符串。

**修复**：zh + en 都加（zh: "专属 Agent" / "查看全部" / "管理 Agent"）。

## 3. 创建 Agent 表单加"一键填默认"

**实现**：`CustomAgentWizard.tsx` 加 `fillDefaults()` 函数 + create 模式 stepper 上方按钮。预填 4 步（basicInfo / topicSchema / pipeline / integration.default\*），skills + allowedModels 仍由用户挑（业务白名单不预填）。

**Why 不预填 skills/models**：白名单是业务相关，不同用户场景需要不同 skill 组合；预填可能误导用户用错。

## 4. Mission completed 通知点击 404

**真因**：DB 实测 `action_url = '/playground/missions/{id}'`，但前端真实路由 `/agent-playground/team/{id}`——双错。

**修复**（commit `3752df9ec`）：

- `NotificationBroadcastAdapter:114` appBasePath `/playground` → `/agent-playground`
- `NotificationPresetsService:130` 拼 `/missions/` → `/team/`
- prod DB 用 `UPDATE notifications SET action_url = REPLACE(...)` 修 1 行旧 url

**spec 假绿陷阱**（再次出现）：spec 字面值断言 `'/playground/missions/m1'` 跟错代码"对照"通过 → 同 useNotifications.test 同模式。`feedback_e2e_must_visit_ui` 教训重申。

# Commits

| commit      | 范围                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------ |
| `0246c804f` | custom-agents 三件套（ErrorBoundary + i18n + 一键配置）+ MissionCard 防御，6 文件 163+ 18- |
| `3752df9ec` | mission 通知 actionUrl 双错修复，4 文件 10+ 5-                                             |

# How to apply

- **client component 内 `params: Promise<>` 永远用 useEffect 异步解**，不用 React 19 `use()` API
- **i18n 加 t('xxx.yyy') 时必须同时在 zh.json + en.json 加 key**，否则 silent fallback 显示空字符串
- **path 类字面值断言 spec 必须用真实 endpoint 测**（或抽生成器函数做单一权威），不能"spec 字面值与生产代码字面值互相对照通过"
- **前端路由 ↔ 后端 actionUrl 约定**必须有单一权威（共享常量 / 生成器函数），不能两边各自硬编码
