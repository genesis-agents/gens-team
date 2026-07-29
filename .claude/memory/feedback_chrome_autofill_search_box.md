---
name: feedback-chrome-autofill-search-box
description: Chrome 忽略 autoComplete=off + type=search 会回填历史搜索词；搜索框必须用 type=text + autoComplete=new-password + 随机 name + data-lpignore/1p-ignore 全套
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6f88d14d-3d90-467a-b940-ff29c27662ce
---

Chrome 对 `<input type="search" autoComplete="off">` 的反 autofill 信号完全忽略，会把上次输入的搜索词（甚至跨页面的同 placeholder/同 class 搜索框）回填进去。用户在 admin/ai/tools 看到搜索框默认填了 "genesis" 就是这个坑。

**Why:** Chrome 把 type=search 当成"用户搜索历史"特殊对待；autoComplete=off 只对 form submission 类输入有效，对 search 无效。

**How to apply:** 搜索框五件套——

1. `type="text"`（不是 `type="search"`）
2. `autoComplete="new-password"`（chrome 强信号"这是密码字段，绝不回填普通文本"）
3. `name={Math.random()}`（每次渲染名不同，cache key 失效）
4. `data-lpignore="true"`（LastPass）
5. `data-1p-ignore="true"`（1Password）

`autoComplete="off"` 单独无效，单独换 `name` 也无效——必须组合用。
