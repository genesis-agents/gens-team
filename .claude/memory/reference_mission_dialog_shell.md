---
name: MissionDialogShell 共享外壳
description: AI App 创建 Mission 对话框的统一外壳（components/common/dialogs/MissionDialogShell.tsx），承载头/必填区/Advanced 折叠/Footer
type: reference
originSessionId: 6b5e5edc-9fec-4da6-a18a-afe7f61e93b4
---

# MissionDialogShell

**位置**：`frontend/components/common/dialogs/MissionDialogShell.tsx`

## 决策背景

各 AI App「创建 Mission」对话框历史上各写各的：

- Topic Insight：1017 行 modal（CreateTopicDialog）— 干净的业务款
- Playground：912 行**全页 hero**（DemoLauncher + team/page.tsx）— 渐变 / stat 卡 / 配置摘要 / metric 卡，装饰大于决策（2026-05-10 用户截图反馈"非常花哨，一点也不商务"）
- AI Teams：306 行 modal
- AI Research：80 行 modal

统一全 DTO 不现实（字段差异大），统一**视觉壳**值得做。

## Shell 提供什么

只负责 chrome：

- 黑半透遮罩 `bg-black/50` + `max-w-3xl` 圆角白卡 `rounded-xl shadow-xl`
- Header：`h2` title + `p` subtitle，无渐变 logo
- Body：`max-h-[70vh] overflow-y-auto px-6 py-4`，渲染 `primary` slot
- 可选 `advanced` slot：折叠按钮 + 展开区，`defaultAdvancedOpen` 控制初始展开（已自定义任意值时应 true）
- Footer：左槽位（恢复默认 / 返回上一步等）+ 右侧 Cancel/Submit；submit 按钮是 `bg-blue-600`

## Shell 不提供什么

- **不预设字段** —— 各 App 在 `primary` / `advanced` slot 里塞自己的表单
- **不预设 DTO** —— 各 App 自己拼 payload + 自己 `onSubmit`
- **不预设状态持久化** —— 偏好用 localStorage 由各 App 自管（如 `playground:depth`）

## 接入清单（迁移 / 新建模板）

1. 必填区 `primary`：name/topic + 1-2 个核心选择（深度、类型）
2. 高级区 `advanced`：剩余字段（频率、时效、可见性、KB 等）—— 阈值参考"如果 ≥ 5 个字段，必须折叠"
3. `defaultAdvancedOpen`：用 `useMemo` 计算 `isCustomProfile`，用户已偏离默认 → true
4. footerLeftSlot：可选"恢复默认"按钮（仅 `isCustomProfile` 时显示）
5. submitDisabled：必填字段 trim 为空时禁用
6. error：`useState<string|null>`，提交失败设置；红条出现在 footer 上方

## 已迁移

- 2026-05-10：Playground 从全页 DemoLauncher 迁到 `PlaygroundMissionDialog`（commit 待 push）

## 后续可迁移

- Topic Insight `CreateTopicDialog.tsx`（1017 行 → ~700 行可拆出）—— 它的两步式可以加 `header` slot 自定义
- AI Teams `CreateMissionDialog.tsx`
- AI Research `CreateProjectDialog.tsx`
- Custom Agents `LaunchMissionModal.tsx`
- 这些目前都是独立 modal，下一波 PR 再迁，本次只动 Playground

## 反模式（不要再写）

- **创建 Mission 不要做全页 hero** —— 用户 2026-05-10 明确反馈"非常花哨，一点也不商务"
- **不要把 stat/metric 卡塞进对话框** —— 装饰大于决策，注意力被 chrome 抢走
- **不要给 modal 加渐变 / 阴影投光 / 渐变 logo box** —— light-only / 业务气质，参考 Topic Insight 写法
