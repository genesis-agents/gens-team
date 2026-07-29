---
name: React 闪烁/重挂载常见诱因 (Playground / TI 报告渲染)
description: ReactMarkdown + 父级 setNow 500ms tick 触发 next/Image 反复 unmount → loading=true 初始态闪烁的根因清单 + 修法
type: reference
originSessionId: ccbd980d-4dd8-4cfe-819e-c57149f57eb0
---

# React 闪烁 / 重挂载排查清单

**典型现场**：报告 tab 内 next/Image 一闪一闪（看起来像 reload）。
**触发条件**：父级（page.tsx）有 `setInterval(setNow, 500)` 之类的 ticker，每 500ms re-render 一次。

## 根因 — 单纯 useMemo 父级 prop 不够

仅在父层 `useMemo(reportArtifact, deps)` 把 artifact 引用稳定下来 **不够**。
ArtifactMarkdown 内部如果每次渲染都重建 `components` / `processText` / `cleaned`，ReactMarkdown 会把整树视作"每次都是新的元素树"重新 reconcile，next/Image 会按 React 行为表现为 unmount → remount → useState(true) → opacity-0 闪一下。

## 三层加固（缺一不可）

1. **页面层**：`reportArtifact = useMemo(...)` 依赖 contents 字段（不含 now / wallTimeMs）
2. **组件内部**：`processText`, `baseComponents`, `components`, `cleaned` 全 `useMemo`，依赖最小化
3. **占位符渲染抽出来 + React.memo**：把 `#fig-` 占位符的 `<FigureRenderer>` 包成独立 `StableFigureBlock` + `React.memo`，比较函数只看 `figure.id / imageUrl / title / caption / citation.uuid`
4. **整体兜底**：`export default React.memo(Component, propsEqual)` 拦下父级 setNow 引发的无效 render

## ReactMarkdown 关键陷阱

- `components` prop 是 `{...baseComponents, img: ...}` 这种内联 spread → 每次 render 都是新引用 → 全树 reconcile
- 解法：`useMemo(() => ({ ...base, img: ... }), [base, deps])`
- 同理 `cleaned` 字符串虽然内容一致，但 `stripProseBullets(preprocessLatex(md))` 每次返回新 string 是新引用，对 ReactMarkdown 影响小但仍建议 memo

## next/Image 闪烁额外坑

- `unoptimized` 模式下 src 不变也可能在 unmount/remount 时重新发 HTTP（取决于浏览器缓存）
- `imageLoading: useState(true)` 初始态 + `opacity-0` → 重挂载就有黑暗闪
- 修法只有一条：让组件别 unmount。父子链上每一层都不能给它新的 props 引用 → React.memo 比较

## 触发器盘点（Playground 这条产品线）

- `setNow` 每 500ms tick（用于显示运行时长）
- `events` WebSocket 流入（mission 跑动期间每秒数次）
- `view = useMemo(deriveView(events), [events])` 每次 events 变都返回新 view + 新 dimensionPipelines Map
- LeadJournalPanel poll
- `persisted` poll（mission 详情）

任何一条触发，没做 React.memo 就会一路传到 ArtifactMarkdown → ReactMarkdown → 内部 figure。

## Commit 锚点

- 2026-04-30 (#50): 页面层 useMemo 兜底 → 缓解但没消除
- 2026-04-30 (#64) commit `7a71ba31d`: 三层加固 + StableFigureBlock + 整体 React.memo → 彻底消除
