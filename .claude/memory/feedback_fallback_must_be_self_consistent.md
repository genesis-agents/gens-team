---
name: feedback_fallback_must_be_self_consistent
description: 双层网 fallback 通道必须 prompt 自洽 + 多入口校验对称；"主路径干净"假设是反模式
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# Fallback 通道必须 prompt 自洽 + 多入口校验对称

**规则**：当系统设计了 A→B 双层网（A 是主路径、B 是 fallback），任何"为优化 A 而精简 B 上下文"的改动都是反模式。fallback 通道必须 prompt-self-consistent —— B 路径的输入引导必须独立完整，不能假设 A 在哪里给了上下文。

**同源**：双入口校验（同一份业务规则有 path1 和 path2 两个入口）必须两边都校验，不能假设"path1 走过的 path2 一定也走过"。

**Why**：2026-05-07 layer 6 兜底失效事件 + FC 路径保留 kind 防御缺口：

1. **fallback prompt 不自洽真因**：`DECISION_FC_SUFFIX` 删了 envelope 协议结构段（"既然 vLLM tool parser 接管 wire 格式，prompt 不需要描述"）。**vLLM 没装 `--tool-call-parser` 时**：LLM 没指引怎么吐 tool call → toolCalls 空 + content 不吐 envelope JSON → 双层网第二层 parseDecision 真兜底拿不到 JSON parse → Layer 6 失效，工具调用全无。修法：`DECISION_FC_SUFFIX = DECISION_SYSTEM_SUFFIX` 别名（commit `7db2b3e17`）。

2. **多入口校验非对称真因**：prompt-driven 路径走 `normalizeAction` 时 `RESERVED_ACTION_KINDS` 拦保留 kind（skill_invoke / subagent_spawn / llm_generate）；native FC 路径走 `decisionFromToolCalls` 完全绕过这层，仅靠 ToolRegistry.has() 二层防御兜底（如未来有人误注册同名 tool 就穿透）。修法：`decisionFromToolCalls` 入口加镜像 `RESERVED_ACTION_KINDS` 检查（同 commit）。

**How to apply**：

1. **设计审视必查"两条路径行为对称吗"**：
   - 任何 A 路径有的校验、约束、wrap，B 路径必须有相同语义（同样的拒绝 / 同样的 fallback / 同样的错误信号）
   - 用 grep 验证：拦截点只出现在 A 文件不出现在 B 文件 = 不对称

2. **fallback prompt 不能依赖主路径的上下文**：
   - 主路径走 native API 时省下的 prompt token，不能直接从 fallback 路径砍
   - fallback 路径的 LLM 没看到 native API 描述，prompt 必须自带完整指引
   - 反例："既然 wire 格式由 parser 接管，prompt 删 envelope 描述" → parser 失效时 fallback 完全无引导

3. **Spec 必须有反向证据**：
   - 不只测"主路径工作"（toolCalls 解析成功）
   - 必测"主路径失效但 fallback 真兜底"（toolCalls 空 + content 是 fallback 协议 → 跑通 finalize）
   - 必测"如果绕过会怎样"（攻击场景：故意配置同名 entry，证伪 RESERVED 检查不被绕过）

4. **PR review 关键词触发**：
   - 看到"fallback 路径不需要 X" / "主路径接管 X 后省略 X" → 立即 grep 对应 fallback 路径，验证 X 是否对 fallback 仍必需
   - 看到"path1 / path2" / "primary / fallback" / "main / backup" → 必查行为对称性
   - 看到"二层防御兜底所以这层可以放过" → 二层防御不是放过当前层的理由（registry 污染、同名注册都是真实风险）

5. **元教训**：双层网设计的承诺是"任何一层挂了都不挂"，但实现时容易把第二层当"理论存在的兜底"而不真喂养它。fallback 通道必须像主路径一样被认真喂养（输入完整 / 校验对称 / spec 锁定）。

**关联**：

- `project_local_reasoning_model_fc_2026_05_07.md`（layer 1-6 失败模型）
- `project_c195035f_data_wipe_2026_05_07.md`（reset-before-cascade 也是"假设有兜底但实际没兜底"的同源问题）
