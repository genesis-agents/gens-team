# Reference Index

> 外部资源/规范的指针。每条 ≤200 字符，详情看链接文件。

- [reference_report_writing_benchmarks.md](reference_report_writing_benchmarks.md) — Industry benchmark sources for report writing standards (McKinsey, BCG, Gartner, Stanford HAI, Economist, etc.)
- [reference_jest_threshold_gotchas.md](reference_jest_threshold_gotchas.md) — jest coverageThreshold per-directory aggregate vs glob per-file / lint-staged stash 行为 / .claude/worktrees 重复 mock / NODE_OPTIONS 防 ESLint OOM / .gitignore env/ 吃掉 spec 等坑
- [reference_two_skill_registries.md](reference_two_skill_registries.md) — 项目有 2 个 SkillRegistry 同名类（ai-engine 是生产主线 / ai-harness/kernel 是 ReAct 内置），讨论 skill 必须先确认是哪个
- [reference_react_remount_pitfalls.md](reference_react_remount_pitfalls.md) — Playground 报告 next/Image 闪烁三层加固（页面 useMemo + 组件内 useMemo + 占位符 React.memo + 整体 React.memo）
- [reference_audit_debt_dashboard.md](reference_audit_debt_dashboard.md) — `npm run audit:debt` 5 维度架构债仪表盘（god-class/shim/biz-name/any/TODO）+ SLO + 入口
- [reference_playground_timeout_layers.md](reference_playground_timeout_layers.md) — Playground/Mission timeout 4 层守护（HTTP 120s/300s + Liveness 5min + Wall 3h + Budget），stage 不再有死秒表
- [reference_claude_code_v2_1_88_source.md](reference_claude_code_v2_1_88_source.md) — d:/projects/codes/claude-code-build 是 Claude Code v2.1.88 还原源码（1916 文件）；query loop / cache_edits / Tool / skills / hooks / SDK 全套位置索引 + Anthropic 自己注释里的"血的教训"
- [reference_prisma_concurrently_pitfall.md](reference_prisma_concurrently_pitfall.md) — CREATE INDEX CONCURRENTLY 让 prisma migrate deploy 静默回滚 + deploy-migrations.ts 自动 resolve applied → 列没建但 \_prisma_migrations 显示已 applied 的诡异状态
- [reference_deepseek_models.md](reference_deepseek_models.md) — DeepSeek 2026-07-24 后 chat/reasoner 弃用，正牌主线是 deepseek-v4-flash / v4-pro；base_url 含/不含 /v1 都接受
- [reference_mission_dialog_shell.md](reference_mission_dialog_shell.md) — components/common/dialogs/MissionDialogShell.tsx：AI App 创建 Mission 对话框统一外壳（头/必填区/Advanced 折叠/Footer），各 App 自渲染字段
