---
name: feedback-tristate-segmented-not-checkbox
description: '业务"默认/开/关"三态 UI 必须用 segmented 控件而非 checkbox；HTML 标准 checkbox 仅二态，强行用 unchecked 表示 "默认" 会让用户一旦点击就回不到默认策略'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

业务有"默认 / 强制开 / 强制关"三态语义时（如 NotificationDispatcher 业务类型 × 渠道矩阵 `channelSubscriptions`），UI 必须用三按钮 Segmented 控件，**不要用 checkbox**。

**Why:** HTML checkbox 是二态原生控件（checked / unchecked）。常见做法是把 `unchecked` 偷换为 "默认"，但用户一旦点击进入 `true`，再次点击只能到 `false`，**永远回不到 null 默认状态**。后续后端调整默认策略（如 Tier3 加 webpush）也不会自动生效——用户被永久锁定在自己最后一次的覆盖值上。PR-DR1b R2 product/frontend 共同 P0。

**How to apply:**

- 三态字段 UI = `role="radiogroup"` + 3 个 `role="radio"` 按钮（默认 / 开 / 关），每个 `aria-checked` 严格等值判断。
- 写入侧：value === null 时 `delete obj[key]`，对象空了再 `delete parent[type]`，保持 `null = 不存在` 的语义不变。
- 渲染侧：`renderValue = isAvailable ? raw : null`，未启用渠道强制 null，禁止 server 残值穿透造成"未启用却显示已勾选"的视觉矛盾。
- 文案：明确"默认 = 走系统策略（推荐）·开 = 强制启用 · 关 = 强制静音"，不能让用户自行猜测三态含义。
- 全局开关与具体业务的关系必须说清楚：例如"全局 OFF 时整类静音；矩阵勾选不会越过全局开关"。

参考：[[feedback_no_lying_assertion]] 同源——UI 二态强行表达三态语义就是对用户撒谎。
