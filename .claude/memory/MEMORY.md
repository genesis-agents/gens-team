# Memory Index

> 项目级 memory（个人协作偏好混在 feedback 里，标注的会单独迁回 C 盘）。
> 拆分为 3 个 type-index 避免 ~50KB 单文件溢出上下文。

- [feedback-index.md](feedback-index.md) — 132 条用户协作偏好 + 项目反模式
- [project-index.md](project-index.md) — 102 条项目事故、PR 收尾、设计决策
- [reference-index.md](reference-index.md) — 10 条外部资源/规范指针

## 写新 memory 必看

- 文件命名：kebab-case，前缀 `feedback_` / `project_` / `reference_` 之一
- 频次：单条 ≤200 字符的描述放对应 type-index，详情放独立 .md
- 不要写在 MEMORY.md 里：MEMORY.md 是路由器，所有内容都通过 type-index 路由
- 新增条目同步加到对应 type-index 文件，注意按时间倒序（新的在顶部）
