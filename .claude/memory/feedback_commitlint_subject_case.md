---
name: commitlint subject 起首必须小写
description: 项目 commitlint.config.js 的 subject-case 规则禁止 sentence-case / start-case / pascal-case / upper-case；中英文混合 commit subject 起首词若是英文必须小写
type: feedback
originSessionId: b563b5ca-9b52-4741-90db-57cabe79a67c
---

`commitlint.config.js`:

```js
"subject-case": [
  2,
  "never",
  ["sentence-case", "start-case", "pascal-case", "upper-case"],
],
```

中英文混合 subject 时，**起首词若是英文缩写（KEY / API / DB / UI / OAuth）会触发 upper-case 规则**：

```
✖ subject must not be sentence-case, start-case, pascal-case, upper-case
```

**Why**：commitlint 把第一个 ASCII 词当判定依据；首字符是大写英文 → upper-case → 拒。

**How to apply**：

- 起首是英文缩写时，要么改全小写（`key 状态...`、`api 网关...`），要么用中文起首（`接口状态...`、`网关增...`）
- `header-max-length: 100` 也卡（subject + body 行）；中文常超，body 控制在 100 char/line
- 项目 `.husky/commit-msg` 跑 `commitlint --edit`，违规直接拒

**踩坑次数**：1（2026-05-06，commit "feat(secrets): KEY 状态..."）
