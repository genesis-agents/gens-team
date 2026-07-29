---
name: feedback_light_only_no_dark_mode
description: Genesis 前端永远浅色，不要给新组件加 dark: 变体；tailwind.config.ts 已 darkMode='class' 锁定
type: feedback
originSessionId: 88bcab33-4afa-40e3-9995-d1e247e94ef0
---

Genesis 前端是 **light-only 产品**。新增组件不要加 `dark:` Tailwind 变体；老组件遗留的 `dark:` 类已经被 `darkMode: 'class'` + 不挂 `dark` 类的策略静默，不要去激活它（不要往 `<html>` 加 `dark` class）。

**Why:** 2026-05-07 用户在部门电脑上反馈秘钥管理背景变深。根因：tailwind 默认 `darkMode: 'media'` 让所有 `dark:` 变体跟随 OS 偏好自动激活。用户明确说 "不需要深色，应该始终显示浅色"。当时 fix（commit `c1b7107c1`）切 `darkMode: 'class'` 锁定。profile/page.tsx 里的 `darkMode` setting 是占位 state，未接 `<html>`，本来就没真启用过深色。

**How to apply:**

- 写新 UI 时只用浅色色板（`bg-white` / `bg-gray-50` / `text-gray-900` 等），不要顺手加 `dark:` 兜底
- 评审时看到 PR 加 `dark:` 类直接打回，问"这是给谁看的，产品没暗色模式"
- 不要给 `document.documentElement` 加 `dark` class（会让所有遗留 `dark:` 重新生效，全站翻黑）
- ReaderView 内部的 `theme === 'dark'` 三元写法跟 Tailwind `dark:` 变体无关，是 reader 自己的样式，不受影响
- 看到老组件 `dark:bg-gray-800` 之类的死代码，可顺手清，但优先级低（runtime 已无效）
