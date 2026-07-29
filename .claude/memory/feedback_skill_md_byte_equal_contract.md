---
name: skill-md-is-single-source-for-agent-playground-prompts
description: agent-playground prompt 单源化 SKILL.md（PR-E 后），soul.md/duties/*.md 已物理删除；改 prompt 只动 SKILL.md 内嵌 anchor
metadata:
  node_type: memory
  type: feedback
  originSessionId: b2a1b3e2-dcf6-4709-b034-22dd0f9570ab
---

agent-playground 每个 agent 目录下的 `SKILL.md` 是 agent prompt 唯一数据源。soul body / 每个 duty body 都内嵌在 SKILL.md 的 HTML 注释 anchor 内：

- soul: `<!-- soul:start --> ... <!-- soul:end -->`
- duty: `<!-- duty:<name>:start --> ... <!-- duty:<name>:end -->`

**历史背景（2026-05-15 PR-E 之前）**：

曾经是双轨：SKILL.md 内嵌 + `agents/<agent>/soul.md` + `agents/<agent>/duties/<name>.md` standalone 散落文件。`skill-md-byte-equal.spec.ts` 强制 byte-equal。PR-E 物理删除全部 19 个 standalone 文件 + byte-equal spec（commit `367b0c128`）。

**Why（PR-E 单源化的根因）**:

- 双源必漂移：4 路评审 round 2 发现单改 standalone 忘 SKILL.md → 必须再 commit 一次 sync；硬合约 spec 只是缓兵之计
- duty-loader 内部还要维护 fallback 路径（loadSoul / loadDuty）让 standalone 文件继续可读 → 死代码 + 增加心智负担
- 标准 Anthropic SKILL.md 协议本身就是单源，多文件是项目本地畸形

**How to apply（PR-E 后规则）**:

- 改 prompt 只编辑 `agents/<agent>/SKILL.md`，不要再去找 soul.md / duties/<name>.md（已删，不存在）
- 新增 duty：frontmatter `duties: [...]` 加 dutyName + body 加 `<!-- duty:<name>:start --> ... <!-- duty:<name>:end -->` 段。两处必须一致（skill-md-loader `extractDuties` 在 frontmatter 列了但 body 缺 anchor 时硬抛错）
- 新增 agent：建 `agents/<agent>/SKILL.md`（YAML frontmatter id / name / allowedTools / allowedModels / duties + body soul/duty anchors），不要再建 soul.md / duties/\*.md
- `duty-loader.buildPromptFromDuty(agentDir, dutyName, vars)` 委托 `skill-md-loader.loadSkill`，缺 duty anchor 抛 explicit error
- 多 session 并行场景：先 `grep -l "soul.md\|loadSoul\|loadDuty\b" backend/src/modules/ai-app/agent-playground/` 确认无 legacy 引用残留（PR-E commit 后应该 0 匹配）

**配套现状**：

- `skill-md-byte-equal.spec.ts` 已删（PR-E commit 367b0c128）
- `duty-loader.ts` 内部 fallback 路径已删，loadSoul/loadDuty 不再 export
- 8 个 agent 的 SKILL.md 是唯一 prompt 源（analyst / leader / reconciler / researcher / reviewer / steward / verifier / writer）
