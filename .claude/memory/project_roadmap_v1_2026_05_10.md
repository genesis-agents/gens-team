---
name: roadmap_v1_2026_05_10
description: docs/prd/roadmap.md v1.1 落地（12 月跨度 / 7 主线含 M7 Code Agent / 4 季度甘特），用户 6 项关键决策已锁
type: project
originSessionId: 55751763-fe3c-4072-8d44-08c1ea156fa9
---

Genesis Roadmap v1.1 落地于 `docs/prd/roadmap.md`（2026-05-10）。

**Why**：用户在 docs/prd/roadmap.md（空文件）+ 0508.md（3 条手记）基础上要求系统梳理 12 月路线图，提出"基于专业能力做"。

**How to apply**：

- 任何 roadmap 修订都要更新 `docs/prd/roadmap.md` 而不是新建 v2
- 双周更新里程碑状态字段（🟡/✅/🔴/⏸），不变主版本号
- 季度末做 retrospective，可推主版本号（v1.0 → v1.1）
- 北极星变更必须同步 CLAUDE.md

**6 项已锁决策**（用户 AskUserQuestion 选定）：

1. AI 报告 = **独立 AI Report 模块**（M4 主线，不是 Office 也不是 playground 报告打磨）
2. Harness SDK = **开源 + 公司商业化**（对标 Claude Agent SDK，Q4 2026 v0.1.0 npm 公开）
3. 时间跨度 = **12 月**（含 4 季度战略 + 季度内 sprint 颗粒度）
4. 文档形态 = **完整长文档**（背景/原则/7 主线/季度甘特/风险/退路/治理）
5. **Code Agent = 内部基础原语**（v1.1 新增，保守 scope；不开 ai-app/code 用户产品；服务工程师 sub-agent 场景与未来自演进内核前置）
6. **Self-Iteration Kernel = v2.0 命题**（M7.6 评估后再决定具体启动时间；当前 v1.1 周期内只打地基不做元层）

**7 主线**：

- M1 Infra（Storage v1.2 PR-S 系列 / Cache Governance / Observability / Resilience）
- M2 Engine+Harness（Anthropic P0/W17-W22/SkillRegistry 收一/Capability Discovery）
- M3 标杆 app 横向复制（Research/Writing/Image/Social/Simulation/Planning/Custom）
- M4 AI Report 独立模块（设计→MVP→多格式→模板→协作→AI 修订）
- M5 知识闭环（Wiki 注入/Failure Learning/Cross-Memory/KG/RAG v2）
- M6 Open/SDK/MP（Open API/SDK 设计→v0.1→v0.2→Marketplace→商业化）
- **M7 Code Agent 内部基础原语**（Tool 原语→Sandbox→主体→Sub-Agent 切换→alpha 诊断→自演进前置评估）

**M7 关键设计**：

- Tool 原语 mirror Claude Code（Read/Write/Edit/Glob/Grep/Bash/ToolSearch）
- 4 操作模式（Plan/Edit/Execute/PR）+ ACL 引擎
- 沙箱继承 CLAUDE.md 7 条 Sub-Agent 管控（worktree 隔离 + 文件白名单 + 全局回退禁令 + 入口文件保护）
- 杠杆：本地 `d:/projects/codes/claude-code-build`（v2.1.88 还原源码 1916 文件）+ 反向洞察 10 条已锁

**未决议题**（已显式列入 §九，避免静默选择）：

- AI Office 模块命运（Q3 2026 末看 M4 能否覆盖 80% 场景再决定）
- 多语言战略（Q4 2026）
- 移动端形态（2027 H2）
- AI Ask Teams 与 Custom Teams 合并（Q1 2027）
- Topic-Insights 是否并入 Research（Q3 2026 M3.3）
- YouTube/Explore 等非生成型 app 去留（Q1 2027）
- **Self-Iteration Kernel（自演进内核）启动**（Q1 2027 末 M7.6 评估决定）
- **ai-app/code（Cursor-like 用户产品）启动**（Q2 2027 评估，v2.0 候选）
