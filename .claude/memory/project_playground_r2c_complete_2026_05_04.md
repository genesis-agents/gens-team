---
name: agent-playground R2-C 单轨化完成（pipeline-v1 是唯一路径）
description: legacy team.mission 已删，runtime_version DB 列变死权重，R2-A.14 / R2-B 双轨工具改 ⏪ moot
type: project
originSessionId: 94c0899f-9d18-492b-abde-5c553623a0bd
---

R2-C `27350f494` (2026-05-04) 已删除 legacy team.mission.ts (6253 行) + flag service + 双轨路由 spec。pipeline-v1 现是 agent-playground 唯一 mission 路径。

**2026-05-15 复核更正**：R2-C 单轨化指 mission 顶层路由，**不是删除 SimpleLoop**。`backend/src/modules/ai-harness/runner/loop/simple-loop.ts` 仍存活并合理保留——chapter-reviewer agent（per-dim-pipeline.util.ts:1016 注释证实）作为章节级 writer loop 在用。前次 memory 写"simple-loop 已弃"是错的，已通过架构审计 2026-05-15 修正。

**Why**: pipeline-v1 在 2026-05-04 全 14 stage wired 完毕后切默认（commit `93ef5be03`），生产观察稳定，遂 R2-C 直接单轨化，跳过 R2-A.14（双轨产物对比工具）+ R2-B（1 周双轨观察）— 两者均已成 moot。

**How to apply**:

- 不要再写 `PLAYGROUND_RUNTIME=legacy` env 切换逻辑
- 不要修复 legacy 路径 bug（路径已不存在）
- `runtime_version` DB 列保留无害（migration 已 deploy prod 无法 down），写值固定 "pipeline-v1"（commit `0a7f2fc5d` 修正默认值）。下次主动清理时可起 Prisma migration drop column
- 紧急回滚已无 legacy 可切：如 pipeline-v1 出现 P0，需 git revert 27350f494 之前的 commit + redeploy
- 14 stage 函数文件 (s1-s12 stage.ts) 保留，pipeline hook 通过 thin-adapter 调用
- v5.1 plan §4.0 / 关键里程碑表已回填实际状态（R2-C ✅ / R2-A.14 R2-B ⏪ moot）
