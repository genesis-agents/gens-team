---
name: feedback-5-reviewer-parallel-audit
description: 大型 review 用 4-5 个 reviewer 子代理并发按域分工，每个域附必查风险清单，远胜单 agent 串行；reviewer 容易把 CLAUDE.md 通用规则套用而误报 P0
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3097db18-6f89-4ac8-b70c-512ac02fe78a
---

2026-05-13 主干 36 commit / 113 file 深度审查实战经验。

**做法**：
1 个 reviewer 先做高优先级 25 个文件（infra/onprem 我自己改的 + 关键 LLM 端点）
然后 4 个 reviewer 并发覆盖剩余：

- Agent 1: ai-app/agent-playground + library + topic-insights (33 files)
- Agent 2: ai-engine/llm + tools (25 files)
- Agent 3: ai-harness runner + evaluation (14 files)
- Agent 4: 跨切（utils / scripts / prisma / frontend / app.module）(26 files)

每个 brief 含：

- 文件清单（精确路径，不让 agent 猜）
- 必查风险点（按域定制 + CLAUDE.md 引用）
- 输出格式（P0/P1/P2 + 通过项 + 数据）
- "无 P0 / P1 明说，不要为篇幅编造" —— 关键 anti-confabulation 约束

**5 个 reviewer 共找 6 P0 + 18 P1 + 19 P2**，最终核实 5 P0（1 个降级因为前提不成立）。

**Why**：

- 单 agent 顺序读 113 file 上下文压爆 + 后期质量崩
- 并发分域 → 每个 agent 30 file 内，深读得动；总耗时 15 分钟（最慢 195s）vs 顺序估 60+ 分钟

**How to apply**：

1. 大 review（>50 files / 5+ commits / 跨多模块）：分域并发 4 agents，每 agent ≤30 files
2. 每个 agent brief 必须附**域专属风险点**，套用 CLAUDE.md `feedback_*` memory + 反向洞察清单
3. 收 reviewer 报告**必须人工核实 P0**：reviewer 容易把通用规则套用（如 model-fallback 反向洞察 #6 thinking signature）而无视前提条件（项目根本没用 Anthropic structured thinking blocks）→ 这种是 P2 future-proofing 不是 P0
4. P0 真假甄别方法：`grep` 搜索能让此 P0 触发的代码路径是否存在。例：thinking signature 触发需 `"type": "thinking"` 出现，grep 无即可降级
5. reviewer 报告里**通过项也是金子**：写明哪些反向洞察 / 红线已守住，下次同域改动可少查一遍

**反模式**：

- 让单个 agent 读 100+ files：context 爆 + 后期 hallucination
- brief 只说"做 code review"不指定文件清单：agent 跑偏到 spec/coverage/docs
- 不指定输出格式：reviewer 写小说不写表格，难汇总
- 不核实 P0 直接修：可能拆掉本来正确的代码

**核实 P0 的关键 grep 模式**：

```bash
# thinking signature 是否真用
grep -r '"thinking":\|type.*thinking' backend/src/modules/ai-engine
# allowedModels 是否真路由
grep -rn "spec.allowedModels\|role.allowedModels" backend/src/ | grep -v __tests__
# hardcoded model 是否真在 prod path
grep -rn 'model.*"gpt-4o\|model.*"claude-' backend/src/modules/ai-engine
```

相关：[[feedback_parallel_subagent_coverage_push]]（大规模 spec 攻坚 4-8 并发的同模式应用到 review）+ [[feedback_audit_must_verify_dual_source_layer]]（arch-auditor 报问题前必须 grep 验证 → 此处适用 P0 真假甄别）
