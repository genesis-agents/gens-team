---
name: feedback-assetcard-must-carry-actions
description: '列表卡片只要用 AssetCard 默认就要携带 onEdit + onDelete + isOwner + labels；展示型卡片用户会反馈"为什么基本功能都没有"'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

## 规则

**新做"资源列表"页面用 AssetCard 时，默认必须携带 4 件套：**

```tsx
<AssetCard
  ...
  isOwner            // 触发 hover 操作按钮显示
  onEdit={...}       // 铅笔图标
  onDelete={...}     // 垃圾桶图标（颜色危险）
  labels={{          // i18n 文案
    edit: t('...edit'),
    delete: t('...delete'),
  }}
/>
```

不允许只塞 `title / description / badges / stats / onClick` 就把卡片摆出去。AssetCard 设计上就有 onEdit / onDelete 这两个内置按钮 slot，缺这两个的卡片视觉等同于"只读"。

## Why（2026-05-12 Screenshot_58）

用户看到 Wiki 库网格里每个 KB 卡片没法编辑、没法禁用，直接 quote：

> 卡片为什么不支持编辑和删除！！！不是统一风格的卡片样式吗，为什么基本功能都没有

事故根因：`WikiCardGrid` 复用了 `AssetCard` 但只传了 onClick，没传 onEdit/onDelete/isOwner——视觉上跟 KnowledgeBaseCard / TopicCard 一样的卡，行为上是只读墓碑。

修法（commit `17c725196`）：onEdit 复用现成的 WikiSettingsModal；onDelete 语义化为"禁用 Wiki on this KB"（不删 KB 实体），调 toggleWikiEnabled(false)。

## How to apply

### Case 1：卡片是用户自己创建/拥有的资源

- `isOwner` 直接 true
- onEdit → 打开 settings/编辑 modal
- onDelete → 二次确认 dialog + 调 delete API

### Case 2：卡片是"挂在共享资源上的 feature 开关"（Wiki / 类似 add-on）

- onDelete 语义 = 关闭该 feature，不是删底层资源
- 文案明确"页面保留，可恢复"，按钮 label = "禁用 X" 而不是"删除"
- 复用 toggle endpoint，不要走 destructive delete

### Case 3：纯展示型（搜索结果列表 / 推荐位）

- 显式注释 `// read-only display card, no isOwner` 并且不传 onEdit/onDelete
- 不要靠"忘了传"实现展示型——code-review 看不出意图

## Code-review checklist

新加/改 `<AssetCard ... />` 调用时必查：

1. 有没有 `isOwner`？没传 → 是不是该传？
2. 有没有 `onEdit` + `onDelete`？没传 → 是不是漏了？
3. `labels.edit` / `labels.delete` 有没有走 i18n？

## 友邻

- [[feedback_admin_byok_visual_parity.md]] — admin 与 BYOK 同概念 UI 必须视觉一致，这条是更上层原则
- [[feedback_no_hero_in_narrow_panel.md]] — 卡片样式选型的另一面（侧栏不要 hero 大图）
