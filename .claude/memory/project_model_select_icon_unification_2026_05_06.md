---
name: ModelSelect 图标化统一（2026-05-06 截图 40）
description: 6 处模型下拉从原生 select + 文本 "· 我的 Key / · 系统 Key" 全切到 Radix DropdownMenu + Lucide KeyRound (emerald) / Server (slate) 图标；commit 2546b571c
type: project
originSessionId: b563b5ca-9b52-4741-90db-57cabe79a67c
---

# 修复前的真相（截图 40 反馈）

`/explore/youtube/...` AI Chat 模型下拉是这样：

```
xAI (Grok 4-Reasoning) (xAI) · 我的 Key
ChatGPT (GPT 5) (OpenAI) · 系统 Key
ChatGPT (OpenAI Mini) (OpenAI) · 系统 Key
```

— 全是纯文本后缀，原生 `<select>` 的 `<option>` 不能放 React 组件。`ModelBadges`
那个绿/紫渐变 chip 只能用在自定义下拉里（ai-ask / ai-teams 等），原生 select 场景
被迫退回 `modelLabelSuffix(model)` 拿 `' · 我的 Key'` / `' · 系统 Key'` 字面拼接。

用户说："难道不能用一个更好看更专业的图标标识？？？"

# 修复后的契约

## 新组件 `components/common/ModelSelect.tsx`

基于 Radix `@radix-ui/react-dropdown-menu`（项目已用，看护体系下没新依赖）：

| 字段             | 视觉                                       |
| ---------------- | ------------------------------------------ |
| 我的 Key（BYOK） | `KeyRound` lucide-react `text-emerald-600` |
| 系统 Key         | `Server` lucide-react `text-slate-500`     |

下拉行布局：

```
[图标] 模型名（粗）         [Check ✓ 选中态]
       provider · 我的 Key/系统 Key（emerald/slate 文字）
```

触发器布局：

```
[图标] 模型名 (provider)            [▼]
```

## API

```ts
<ModelSelect
  value={aiModel}              // 同 select.value
  onChange={setAiModel}        // 同 onChange
  models={aiModels}            // 含 isUserKey 的模型数组
  valueKey="modelId"           // 默认 modelId，可切 'id'
  size="sm" | "md"
  disabled
  placeholder
/>
```

## 替换的 6 处 native select

| 文件                                                | 上下文                |
| --------------------------------------------------- | --------------------- |
| `app/page.tsx`                                      | 资源详情侧栏 AI Model |
| `app/admin/workspace/page.tsx`                      | workspace 推理模型    |
| `app/explore/youtube/page.tsx`                      | YouTube AI Chat       |
| `components/explore/components/AIModelSelector.tsx` | explore 通用          |
| `components/explore/core/ExploreContent.tsx`        | explore 详情 AI       |
| `components/ai-image/components/ControlBar.tsx`     | image 生成模型        |

## ModelBadges 同步升级

原本绿/紫渐变 chip 仅文字，现在加：

- `Multi` chip 前缀 `Layers` icon
- `My Key` chip 前缀 `KeyRound` icon

让 ai-ask / ai-teams 等已用自定义下拉的 6 处仍能保持视觉一致。

# 反向教训

**1. 原生 select 是 RN UI 死胡同**

- option 不能放 React 组件 → 任何"图标识别 / 副标题 / 状态"诉求都退化成文字后缀
- 项目又禁止 emoji，所以连 🔑 / 🏛️ 都不能 hack
- 一旦下拉需要超过纯文本（图标 / 颜色 / 描述），第一反应应该是直接上 Radix DropdownMenu

**2. modelLabelSuffix 这种"为 select 量身做的纯文本工具"应该尽早被淘汰**

- 它最早是 W4-byok 2026-05-05 引入的兼容层（i18n + 中文 fallback）
- 一旦下拉切换到自定义实现，suffix 就只剩 ModelBadges 内部用得着
- 此 commit 没删 modelLabelSuffix（防止其他地方还在引），但日后清理债时可以删

**3. 默认 i18n locale 是 en**

- I18nProvider DEFAULT_LOCALE = 'en'，写测试时不能想当然预期 '我的 Key'
- 要么 mock provider locale，要么按 en.json 'My Key' / 'System Key' 写期望
- 这个项目 i18n 上下文 locale 切换需要 useEffect + localStorage，单元测试拿不到

**4. Radix DropdownMenu 在 jsdom 测试需要 polyfill**

```ts
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    window.PointerEvent = window.MouseEvent;
  }
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
    scrollIntoView: vi.fn(),
  });
});
```

- 用 `keyDown { key: 'Enter' }` 打开比 `fireEvent.click` 稳定（click 在 jsdom 走的是 onPointerDown）

# How to apply

- 项目有任何"模型 / provider / 来源 / 状态"下拉，**首选 ModelSelect**，不要写新 native select
- 加新 KEY 来源（如未来 OAuth 来的、企业供给的）时：
  - `ModelSelectItem` 加新 flag（如 `isOAuth`）
  - `KeySourceIcon` 新增 case，挑符合语义的 lucide icon（`Shield` / `Briefcase` 等）
  - i18n key 加 `common.modelKeyLabel.{newSource}`
- 任何"原生 select 想塞图标 / 副文案"的诉求：先看看能不能切到 ModelSelect，不要再发明新文本后缀模式
