---
name: 三模块 coverage 攻坚 2026-04-29
description: agent-playground / ai-harness / ai-engine 三模块从 22.67% lines 跃迁到 91-95% lines，jest 阈值切 85% 守门
type: project
originSessionId: 48188271-7da1-49f5-a325-25600a9dee53
---

2026-04-29 一天完成 backend 三个核心模块的单测覆盖率攻坚 + jest 阈值守门。

**Why**: 用户底线"85% 覆盖率"。基线 playground 1 spec / 1.4%、harness 44.6%、engine 50.4% 文件比，全局 lines 22.67%。距离 85% 差 ~62 个百分点，差距巨大。

**最终成果**（commit 1e7729c13 → 791efb677）：

- Lines: playground **95.23%** / harness **92.73%** / engine **91.07%**（全 ≥85% ✅）
- Statements: 90-93% ✅
- Functions: 86-90% ✅
- Branches: 80-83%（未达 85%，已知 gap）
- 130+ spec 文件 / **13562 tests** / 17 commits（playground 5 + harness 5 + engine 4 + round 2 6+ + ESLint 修复 + threshold）
- jest.config.js per-directory threshold 守门（lines/statements/functions: 85%, branches: 75%）

**How to apply**（未来想补其他模块到 85% 时）：

1. 用相同的 4-8 个并行 coder agent 模式（见 `feedback_parallel_subagent_coverage_push.md`）
2. 把新模块加到 `coverageThreshold` 的 directory 阈值（不要用 glob）
3. branches 强求 85% 会引入伪测试（防御性 nullish/optional chaining 难命中反例），保 75% 即可
4. round 2 提升 branches 时三个 agent 都因 API error/stream timeout 退出，但已写到 disk 的稳定产物可以隔离 jest 验证后单独 commit

**坑点（节选）**：

- 并发 session 同时改源码会让我提交的 spec 因签名变更（如 sync→async）而失败 → 给 spec 加 await 适配
- lint-staged stash 行为会把别人 WIP 混进我的 commit → 提交前 `git diff --cached --name-only` 验
- ESLint type-aware 规则跑大批 spec 时 OOM → `NODE_OPTIONS=--max-old-space-size=8192`
- runtime/env/\* 被 `.gitignore env/` 全局规则吃掉 → `git add -f`
- "round 2 改坏"事故：round 2 agent 修改已存在 spec 时，部分 case 因源码漂移破坏 → 仅回滚失败的具体文件 (`git checkout HEAD -- <file>`)，保留新增 spec
