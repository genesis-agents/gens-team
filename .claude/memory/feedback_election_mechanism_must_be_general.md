---
name: 选举/分配机制必须做通用而非 patchwork
description: 用户问"为什么会存在选举都无法充分利用的情况"时，必须修底层机制（如 mission-scoped diversity score 维度），不能靠加 role-specific 偏好打补丁
type: feedback
originSessionId: ae254a5c-ed31-4a19-a1a9-3e170bc3d7c0
---

当用户指正"应该是通用机制"或问"怎么会存在选举都无法充分利用的情况"时，
不能靠加 role-by-role 的 hardcoded 偏好（writer 反偏 reasoning，
reviewer 偏 reasoning 等）补救。要在**机制层**加通用维度，让无状态选举
天生具备多样性输出。

**Why**：

- 用户的反馈："我的意思是这个应该是一个通用机制啊，怎么会存在选举都无法
  充分利用的情况呢"——直接指出 role-specific tweaks 是 patchwork 思维
- ModelElectionService.elect() 是无状态纯函数：相同输入 → 相同输出。
  11 个 agent 调用 → 11 次同结果，机制层面就坍缩。Role tweaks 只是在
  一些组合下偶然分散，换组合（如所有 STRONG 都 reasoning）仍坍缩
- 通用解：score() 加一维 `diversityScore = -10 × occurrences`，让"已选过
  多少次"成为打分函数的输入，由 caller 通过 mission orchestrator 累积维护。
  解决了无状态选举本身的局限，不需要枚举 role × tier 组合

**How to apply**：

- 涉及"分配/选择"机制（election / scheduler / load balancer / model router）
  时，先问"这是无状态的吗？是否需要看历史决策？"
- 如果"应该有多样性"是需求一部分，**diversity 维度必须是 score 函数的
  显式输入**，不是靠优先级 / 健康分 / role 的副作用偶然实现
- caller 维护历史用 in-memory tracker（Map<groupId, decisions[]> + TTL +
  LRU）即可，不需要 Redis 第一版；mission/session 这种短命 group 适用
- 提交前自我反问："如果用户换一种候选组合（比如全部都是 reasoning 模型），
  这个修复还能保证分布吗？" 不能 → patchwork → 必须改机制层
- 用户专业反馈："为什么会存在选举都无法充分利用的情况"提示**架构层**
  的设计漏洞，不是数值微调能解决
