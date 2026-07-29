---
name: parallel sub-agent for large-scale spec push
description: 用户在大规模单测覆盖率攻坚中接受"并行 sub-agent + 严格白名单 + 中途持续 commit"的工作模式
type: feedback
originSessionId: 48188271-7da1-49f5-a325-25600a9dee53
---

大规模 spec 覆盖率攻坚（如三模块 ≥85%）时：**派 4-8 个并行 coder sub-agent**，每个带白名单（精确文件路径列表）+ 上下文（agent spec/服务依赖示例 + 项目 testing 规范），让它们各自跑 jest 自验 ≥85% 才返。

**Why**: 2026-04-29 一天内 playground+harness+engine 三模块从 22.67% lines → 91-95% lines（130 spec / 13000+ tests / 18 commits）。单 agent 串行做要 4-5 周，并行让它压缩到 1 天。用户原话："今天要完成"+"持续循环迭代直到每一个都至少 85%"。

**How to apply**:

- 每个 sub-agent prompt 必须包含：① 白名单（具体文件路径）②"先跑 baseline coverage 找 <85% 文件 → 补 spec → 循环到 ≥85% 才能交付"自验流程 ③ 测试模式参考（已存在 spec 路径）④ 业务规则（如 Zod schema + validateBusinessRules + buildSystemPrompt）
- **中途 commit**：sub-agent 完成一组立刻 commit（不等全部完成），减少 working tree 与并发 session 的冲突半径
- **不要等用户确认**："先提交"是用户多次给出的指令；执行决断 > 确认决策
- **agent 失败回退**：API error / stream timeout 退出时，已写到 disk 的 spec 仍可隔离 jest 验证后单独 commit；失败 spec 直接 `rm -f`，不试图修

**反模式**：

- 单 agent 顺序做：来不及
- 不带白名单：会越权改源码、入口文件
- 不要求自验：交付的 spec 实际覆盖率不达标
- 等所有完成才 commit：working tree 与并发 session 冲突大
