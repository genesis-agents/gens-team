---
name: project-ai-security-team-v1
description: AI Security Agent Team 项目 v1 骨架（worktree feat-ai-security-team）— SOTA 对标决策与 PR 拆分
metadata:
  node_type: memory
  type: project
  originSessionId: 871b2121-0cec-4e23-9389-13c7d42681be
---

# AI Security Agent Team v1（2026-05-15）

## 北极星

对标 2025-2026 业界最领先的 AI 漏洞挖掘能力（不是泛义 SOTA）：

- Google **Big Sleep** / Project Naptime（已找到 20+ 真实 CVE）
- OpenAI **Aardvark**（2025-08，自动 PR-level 安全审计 + patch）
- **XBOW**（2025 HackerOne 美区第一，75%+ bug bounty 自主完成）
- Anthropic Code Security Reviewer / GitHub Copilot Autofix / DARPA AIxCC 决赛队伍

## 关键设计决策（不要重新讨论）

1. **方向 = Code-level 漏洞挖掘（Big Sleep 派）+ AI 系统红队**（不做 XBOW 派主动渗透 / 不做 Web3）
   **Why**: XBOW 派法律/合规复杂度过高，v1 不适合；项目无 Web3 上下文，ROI 低
   **How to apply**: 任何"加 nmap / 主动扫端口 / 对外部目标发包"建议直接拒，引导走 sandbox 内代码分析

2. **构建模式 = 新建 ai-app/security/ 模块**（不在 agent-playground 内做 vertical）
   **Why**: playground 是通用调研，security 是垂直能力，混淆语义会拖累两边
   **How to apply**: 后续任何 security 能力加在 ai-app/security/，不要塞回 playground

3. **Offensive 边界 v1 = 纯静态/离线分析**
   - Docker `--network none --read-only --cap-drop ALL --pids-limit 64` 死锁所有 sandbox
   - 所有 PoC 仅在 sandbox 内对本地 target 触发
   - 报告外发由用户主动触发
     **How to apply**: v1 不允许任何 tool 出网；CVE/CWE RAG 走本地预下载索引

4. **CWE 不自造，CVSS v4.0 单源**
   v1 主索引 = CWE Top 25 (2025) ∪ OWASP LLM Top 10 ≈ 35-50 类；long tail 1400+ 通过 cweId 也能承载
   **How to apply**: 任何"新增分类"先映射到 CWE/CAPEC，不要立私有 enum

5. **Confidence 五档（rejected/low/medium/high/verified）+ Business-logic 永远 medium**
   **Why**: 业务逻辑漏洞 LLM 主观成分高，必须人工 review；high confidence 必须 PoC verified
   **How to apply**: TriageReporter 看 LLM 单方面假设 = low；多工具共识 = high；PoC 跑通 = verified；CWE-840 类一律 medium

## 12 个 Agent 角色（SOTA 对齐）

| Agent                | 对应业界               | 状态             |
| -------------------- | ---------------------- | ---------------- |
| SecurityLeader       | Big Sleep "Strategist" | ✅ 完整 SKILL.md |
| AttackSurfaceMapper  | XBOW Recon             | ⏳ skeleton      |
| StaticHunter         | CodeQL Mu              | ✅ 完整 SKILL.md |
| HypothesisAgent      | Big Sleep core         | ✅ 完整 SKILL.md |
| TaintTracer          | CodeQL data-flow       | ⏳ skeleton      |
| ExploitVerifier      | Big Sleep Verifier     | ⏳ skeleton      |
| FuzzCommander        | AIxCC fuzzer           | ⏳ skeleton      |
| BusinessLogicAuditor | Anthropic Reviewer     | ⏳ skeleton      |
| ConfigAuditor        | Checkov/tfsec          | ⏳ skeleton      |
| PatchAgent           | Aardvark               | ⏳ skeleton      |
| TriageReporter       | SARIF 工业             | ✅ 完整 SKILL.md |
| RedTeamAgent         | Pyrit/Garak            | ⏳ skeleton      |

## PR 拆分（worktree branch: worktree-feat-ai-security-team）

| PR     | 内容                                                                                                                                                                                                                                                 | 状态                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| PR-A1  | design-v1.md（13 章节，含 SOTA 对齐 14 项必备能力 + benchmark gate）                                                                                                                                                                                 | ✅ 落地                                                            |
| PR-A2  | Prisma schema（4 model）+ 手写 SQL migration 20260521_ai_security_init                                                                                                                                                                               | ✅ 落地                                                            |
| PR-A3  | backend ai-app/security 骨架（module/controller/service/dto/domain/config/events）+ AppModule 注册                                                                                                                                                   | ✅ 落地 type-check 零错                                            |
| PR-A4a | 4 个核心 agent 完整 SKILL.md（Leader/Hunter/Hypothesis/Triage）+ 8 个 skeleton                                                                                                                                                                       | ✅ 落地                                                            |
| PR-A4b | 其余 8 agent 完整 SKILL.md                                                                                                                                                                                                                           | ⏳ 未做                                                            |
| PR-A5  | ai-engine/tools/security/ — 19 个 tool（semgrep/codeql/tree-sitter/gitleaks/trufflehog/checkov/tfsec/kube-score/sandbox-python/sandbox-docker/afl-fuzz/libfuzzer/atheris/sarif-emit/cvss-score/cwe-rag-query/cve-search/code-graph-build/code-read） | ⏳ 未做                                                            |
| PR-A6  | Mission Pipeline 接入 + Leader chat（复用 MissionPipelineOrchestrator）                                                                                                                                                                              | ⏳ 未做                                                            |
| PR-A7  | Frontend /ai/security 入口 + 创建 mission modal + Finding 列表                                                                                                                                                                                       | ⏳ 未做                                                            |
| PR-A8  | SARIF Report Viewer + 导出                                                                                                                                                                                                                           | ⏳ 未做                                                            |
| PR-A9  | Benchmark: SecurityEval + CWE Top 25 自构造集                                                                                                                                                                                                        | ⏳ 未做                                                            |
| PR-A10 | Benchmark: MAGMA + Big Sleep 复现集                                                                                                                                                                                                                  | ⏳ 未做                                                            |
| PR-A11 | ESLint no-restricted-imports + verify:arch + spec                                                                                                                                                                                                    | ✅ 落地（layer-boundaries 22 项 + ai-security-skeleton 35 项全绿） |
| PR-A12 | postmortem 模板 + 进一步 memory 沉淀                                                                                                                                                                                                                 | ⏳ 未做                                                            |

## SOTA Benchmark Gate（v1 GA 阈值）

- MAGMA ≥ 8/22 内存破坏 finding
- SecurityEval ≥ 80% 130 个 CWE 真实代码标记正确
- CWE Top 25 自构造集 ≥ 80% 类至少 1 hit
- Big Sleep 公开 CVE 复现率 ≥ 30%
- CyberSecEval-3（Meta 2025）目标接近 OpenAI o1-pro 水平

跑不到不发版。

## 关键架构约束（不能违反）

- ai-app/security 通过 ai-harness/facade + ai-engine/facade 访问能力，**禁止穿透内部路径**（与全项目规则一致）
- security 专用 tool 落在 `ai-engine/tools/categories/security/`（tools 全项目唯一）
- security 专用 skill 落在 `ai-app/security/skills/`（业务 skill）
- SKILL.md byte-equal 与 standalone duty.md（同 playground 规则）
- 所有 sandbox tool 强制 `--network none --read-only`
- LLM 调用走 TaskProfile（不硬编码 model）— reasoning 用 claude-opus-4-7，分析用 sonnet-4-6，撒网用 haiku

## 关键参考材料

- 设计文档：[docs/architecture/ai-security-agent-team/design-v1.md](../../../../docs/architecture/ai-security-agent-team/design-v1.md)（13 章节 / 14 项 SOTA 能力 / 12 PR 拆分）
- 骨架契约 spec：`backend/src/__tests__/architecture/ai-security-skeleton.spec.ts`（35 项绿）
- 同构参照模块：`backend/src/modules/ai-app/agent-playground/`（pipeline / SKILL.md / event 框架完全借鉴）

## 用户原话与立场（重要）

- 用户对"v1 砍 UAF/TOCTOU 做简化版"明确说"你要对标业界 SOTA"
- 用户对方向选择给"开干!!!!"明确指令
- 这意味着：未来推进 PR-A5 ~ A10 时，**不要再退回 MVP 思维**，要按完整 SOTA 标杆来

## 相关 feedback

- [[feedback-autonomous-phase-execution]] phase 级任务连续执行，中途不问
- [[feedback-execution-style]] 方向给定后果断执行
- [[feedback-sediment-as-default-task]] memory 沉淀是默认最后一项任务
- [[feedback-prettier-after-write]] .ts 写完应 prettier
- [[feedback-skill-md-byte-equal-contract]] SKILL.md 与 standalone duty 字节对齐
