---
name: docs/ 重构 2026-05-04 (v4.0 与代码 1:1 镜像)
description: docs/ 目录全量重构，目录结构镜像 backend/src/modules/ 五层 + frontend/，去除散落的 audit/audits/system/analysis/tasks/design/features/prd 等老结构，全部归位或归档
type: project
originSessionId: 73ad776b-a428-4436-a9d2-85e65eccb5ce
---

2026-05-04 完成 docs/ 重构（v3.0 → v4.0），543 → 547 个 .md。git diff 摘要：368 R100（重命名）+ 9 A（新 README）+ 4 D（旧 readme）。

**新结构**（与代码 1:1）：

```
docs/
├── README.md                        # 新顶层索引
├── architecture/                    # 唯一架构文档目录
│   ├── README.md                    # 4+1 层总览
│   ├── ai-app/{17 模块}/README.md   # L3 业务
│   ├── ai-harness/{11 聚合}/README.md # L2.5 运行时
│   ├── ai-engine/{9 聚合}/README.md  # L2 原子能力
│   ├── ai-infra/{14 模块}/README.md  # L1 底座
│   ├── open-api/{11 子模块}/README.md # L4 对外
│   └── frontend/README.md
├── guides/{development,deployment,testing,operations,authentication,claude-code}/
├── decisions/                       # ADR
├── api/, demo/, research/, slides/  # 保留
└── _archive/{2025-q4,2026-q1,2026-q2,architecture-old,old-structure}/
```

**Why:** 用户要求"目录结构和代码实现一致"。原 docs 有 ai-kernel/intent-gateway/ai-studio 等指向已删模块的目录，audit/audits/system/analysis 等命名重叠，prd/features/design 三套并存。

**已删（代码层不再存在）**：

- `architecture/ai-kernel/`、`architecture/intent-gateway/`、`architecture/ai-apps/ai-studio/`、`architecture/ai-apps/topic-research/`、`architecture/audit-reports/`、`architecture/platform-evolution/`、`architecture/system/`
- `architecture/ai-engine/{readme,architecture-v1,target-architecture,analysis-report,capability-*,module-overview}.md` 等指向旧架构的快照
- `architecture/ai-infra/{ai-llm,data-collection,realtime,unified-*}/` （能力已并入 engine/harness/protocols）

**已归档到 `_archive/2026-q2/`**：

- `audit/` + `audits/` → `audits/`
- `system/diagnosis/` + `system/reviews/` + `analysis/` → `audits/`+`reviews/`
- `prd/` 全量 → `prd/`
- `tasks/` → `plans/`
- 散落的 `*-2026-MM-DD.md` 改进计划 → `plans/`

**已归位**：

- `architecture/ai-apps/{kebab-case}` → `architecture/ai-app/{module-name 与代码一致}`
- `architecture/ai-infra/realtime/` → `architecture/ai-harness/protocols/`（agent 协议不属于 infra）
- `architecture/ai-infra/frontend/` → `architecture/frontend/`
- `architecture/topic-insights-*.md` → `architecture/ai-app/topic-insights/`
- `design/topic-insights-harness-redesign/` → `architecture/ai-app/topic-insights/harness-redesign/`
- `features/{module}/` → `architecture/ai-app/{module}/features-*`
- `development/` → `guides/development/`
- `guides/architecture/` (audit 快照) → `_archive/2026-q2/audits/`
- `guides/testing/test-cases/` + `test-results/` → `_archive/2026-q2/audits/`

**How to apply:**

- 后续新增模块：在 `docs/architecture/{layer}/{module}/` 同步建立目录
- 后续模块重命名：先 `git mv` 文档目录再改代码（保持 1:1）
- 阶段性 audit / 改进计划 → `_archive/{年}-q{季}/{plans|audits|reviews}/`
- 任何"v2.md"诱惑 → 原地更新，不留版本后缀
- 单一信息源：模块的"是什么"以代码内 README 为准；docs/architecture/ 只放设计文档、迁移记录、子能力说明、跨模块导航

**遇到的 Windows-specific 坑**：

- `git rm docs/readme.md` + `Write docs/README.md` 在 Windows 大小写不敏感文件系统下，写入会被旧索引覆盖；需先确认 `git rm` 完成 + 检查 `git ls-files`
- `git mv src dst` 当 `dst` 已存在时，会变成 `src` 套到 `dst/src` 下面（如 `prd/prd/`），需先 `mkdir` 目标父目录而不是目标本身，或用 `mv-tmp` 中转扁平化
- `git reset HEAD <path>` 在 Windows 上有时似乎会扩展影响范围（一次 reset 把 373 个 staged 文件全部退回 unstaged），用 `git add -A` 即可恢复

**关键链接**：

- 顶层：`docs/README.md`
- 架构总览：`docs/architecture/README.md`
- 历史快照：`docs/_archive/2026-q2/`
