---
name: renumber-headings-collective-review-2026-05-07
description: 2026-05-07 playground 报告编号 (renumberHeadings) 4 路集体评审两轮共识收敛 + DB 真数据全覆盖仿真驱动；commit db043da31
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

## 2026-05-07 playground 报告编号集体评审收敛

**commit**：`db043da31` (push 已落 main)
**修复目标**：playground/team/{id} 报告 H2/H3/H4 编号错乱（用户多次截图反馈）

### 三件 P0 修复

1. **matchDimName 严格 prefix**（ArtifactMarkdown.tsx:127-152）
   - 拆除"前 8 字 substring 双向 includes"前缀共享炸弹
   - 反例：dimName "中国训练成本演进" 与 H2 "中国训练数据合规" 共享 "中国训练" 4 字 → 旧版误升为维度
2. **JSON 片段 H3 守卫**（行 154-167 + 234-238）
   - looksLikeJsonFragment 检测 `"key": "value"` / `{...}` / `[...]` / `key:value`
   - 触发时降级为正文（c195035f H4 -1，伪标题净化）
3. **ChapterReader dimStartIndex**（行 39-46 + 178-180 + ChapterReader.tsx:326-336）
   - 单章 slice 阅读时 H2 显示真实编号"## 7. xxx"而非 slice-local "## 1."
   - ContinuousReader 不传，默认 1，全文场景零回归

### 仿真覆盖（10 mission，scripts/dev/sim-renumber-headings.js）

- PASS：ddc90bfd (10/60/368) + c195035f (30/30/105) — 新装配器 v1.7+
- FAIL：7 个 2 周前 legacy mission — dimNames 元数据 ≠ fullMarkdown 结构（chapter-writer 老 bug 数据），**前端无法修**，需后端 `reprocessStoredReport` 批任务重生成

### Why（元教训）

1. **集体评审必须基于真数据，不能凭推理**：第一轮 4 路给 NO-WITH-CAVEATS 时，3 路独立提到 matchDimName fuzzy 是炸弹（前 8 字 substring）+ 1 路单独发现 ChapterReader slice 编号 bug — 没仿真根本看不出来
2. **修复后必须二轮评审**：Round 2 4/4 YES，第 4 路用 "中国训练" 场景模拟验证拆除，找到 follow-up 中文冒号漏网 case
3. **legacy 数据 vs 算法边界**：renumberHeadings 是展示层兜底，不应承担数据修复职责；脏数据需后端重跑

### How to apply

- 任何"用户重复反馈"的 UI bug → 先写 100% 全覆盖仿真脚本（DB 真数据），不能靠用户截图反复尝试
- 修复后必须组织 ≥4 路并行集体评审（architect / reviewer / explorer / 第 4 路独立）
- 4/4 共识 = ship；任一 NO 必须修后再走一轮（参考 feedback_consensus_must_iterate_to_all_yes）
- legacy mission 与新代码不一致时，明确划清"前端尽力 + 后端 reprocess"边界，不要让前端越权救数据

### Follow-up（不阻塞，已记录）

1. 中文冒号 `：` JSON 片段守卫（第 4 路 minor）
2. fence 缩进识别（architect 原 follow-up）
3. 后端 `reprocessStoredReport` 批任务修 7 legacy mission
4. dim count mismatch banner 提示（第 4 路 minor）
