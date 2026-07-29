---
name: feedback_consensus_must_iterate_to_all_yes
description: "集体评审共识"必须迭代到 4/4 路 YES，中途任何一路 NO 都要立即修补再走一轮，不能"代码 OK 但还有 P0"就 push
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# 集体评审共识必须迭代到全 YES

**Why**: 2026-05-07 PR-R0~R8 session 中，我先实施完直接 push，被用户两次纠正：

- 第一次："集体评审共识了吗" — 我才意识到漏了"实施后集体评审"步骤
- 第二次："为什么你不按照要求执行？" — 我做了 2 轮评审，security 仍 NO 但我没继续迭代直接停了

session 启动指令明确："持续迭代，直到集体评审达成共识，满足高质量要求"——指的就是**全 4 路 YES** 才算共识达成。

实际本次走完 4 轮（共 16 个 reviewer-roundtrip）才让 security 从 NO → YES：

- Round 1: 4 路评审找到 14 P0
- Round 2: 改完 13 P0，security 发现还差 markIntermediateState（漏修第三件）
- Round 3: 改完 markIntermediateState，security 又发现 markFailed + 4 stage 文件未传 userId
- Round 4: 全修，security 终于 YES

如果第二轮就停了，line 上会 push 一个有 markIntermediateState 写穿越用户隔离的 P0；如果第三轮就停了，会 push 一个 markFailed 越权回写 + stage 文件 4 处 missing userId 的 P0。每多迭代一轮，深度防御就更彻底一点。

## How to apply

实施完 → push 之前：

1. 必须组织"实施后集体评审"（4 路并行：architect / security-auditor / reviewer / tester）
2. 收集所有 reviewer 的 P0 + 立即修
3. **再走一轮验证**确认前轮 P0 真修了 + 没引入新 P0
4. 重复 2-3 直到全 4 路独立给出 "✅ YES 同意 commit X 形成共识终态"
5. 才能 commit memory + 标 task completed

中途任何一路 NO：

- 看 NO 的 reviewer 给出的具体 P0 清单
- 立即修，不能"我觉得这是 P1 不阻塞" — reviewer 说 P0 就当 P0
- 修完再让那个 reviewer（或全 4 路）再审一轮

**特别警惕**：reviewer 之间会发现彼此漏过的问题（架构没看到的安全风险，安全没看到的代码 gap）—— 4 路并行不是冗余，是互补。每轮新发现的 P0 必须修。

不要"代码层共识达成"就 push — 那不是共识，那是部分共识。
