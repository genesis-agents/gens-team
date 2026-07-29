---
name: feedback-search-input-disable-autofill
description: 搜索框三件套 (type=search + name + autoComplete=off) 防 Chrome 同域 autofill 注入初始值
metadata:
  node_type: memory
  type: feedback
  originSessionId: ce962b97-346a-4c98-ae26-9cff763089b3
---

通用 `<input type="text">` 搜索框在 React 受控模式下也会被 Chrome 跨页 autofill 污染：Chrome 用同域历史输入填空 unnamed input → fire input event → React onChange → state 被预填非空 → 列表被预过滤 → 用户打开页看到"莫名其妙的过滤"。

**Why:** 2026-05-11 用户截图反馈 admin 工具管理 / API 服务工具 tab 一打开就过滤 "genesis"，是同站点 `/library` 等地方打过 "genesis" 被 Chrome 同域 autofill 注入。

**How to apply:** 项目内所有搜索框（placeholder 带"搜索"或语义化筛选框）必须三件套：

```tsx
<input
  type="search"                           // 不是 "text"
  name="xxx-search-noautofill"            // 独立 name 防 Chrome 模糊匹配域内同 type 输入
  autoComplete="off"                      // 标准信号
  data-form-type="other"                  // 部分 password manager 信号
  value={search}
  onChange={...}
  ...
/>
```

适用范围：admin 表格搜索 / library 搜索 / 任何 client-side filter 入口。表单提交框（如登录用户名/密码、邮箱、地址）该用 autofill 时反而要留默认。

类似坑点：`<input>` 在 modal/drawer 里同样会被注入，autofill 不看可见性。修复粒度 = 每个具体 input，不要靠全局 CSS 或 form 包装。
