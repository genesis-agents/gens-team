---
name: 实施轮（implementation）也要走集体评审，不能只评设计轮
description: design 4路 consensus 通过 ≠ 实施时不会引入新红线违反；implementation PR 也必须 4 路 review，否则一定踩 emoji / dual sources / lying assertion 三件套
type: feedback
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# 实施轮也必须做 4 路集体评审

不能只在设计轮（design consensus）做 4 路评审，在实施轮（implementation）跳过——即使方案已经过 5 路 consensus + 16 patches，**实施时仍然会在新加的代码里引入未评审的红线违反**。

## Why（2026-05-07 PR-8 v1.6 #122 真实事件）

主体 v1.6 设计（commit 8533da47c）已经 5 路 review 通过 + 16 patches。我以为后续 UI wire 只是"已 consensus 设计的实现"，跳过 review 直接改了：

- 加 `🤖` emoji 水印 + `✕` 关闭按钮（CLAUDE.md 红线 #5 禁 emoji）
- `RenderableChart` 加 2 个字段（`sourceFigureType` + `watermarkOverlayRequired`，dual sources）
- `(reportArtifact as { sections?: Array<{ index?: number }> })` lying assertion，导致 revise-chapter 永远不可用
- `rerunMission(fresh)` 老入口 + 新 modal 的 `fresh-research` 意图同时存在（双路径达同结果）
- controller 直接 `@Body() body: { intent?: string; payload?: unknown }` 无 zod 校验
- 新 controller 端点 + 新 modal 都没 spec

用户挑战"你的这个方案是经过集体审视共识的？"+ "为什么要双路径！" 后才跑 4 路 review，1 轮拍出 8 项 P0。

## How to apply

**任何 PR**——不管设计轮多严格，只要 implementation 改了 ≥ 5 个文件 / 加了新组件 / 改了共享类型 / 加了 controller 端点，都要：

1. 跑 4 路并行 sub-agent review（architect / reviewer / security / tester）
2. 收敛 P0 后才 commit + push
3. 不能用"只是实现已 consensus 的设计"当跳过 review 的借口

特别要警惕的实施轮陷阱：

- **emoji 红线**：新加的卡片 / 按钮 / 角标 emoji（用 Lucide 图标）
- **lying assertion**：跨模块共享类型字段不存在却用 `as` 强转（必查 schema）
- **dual sources**：新字段与已有字段表达同一语义（必合并）
- **dual paths**：新端点 / 新组件与老路径达同结果（必收敛单源）
- **共享类型扩展前必 grep**：`components/common/` 下任何类型加字段必先 grep caller
- **新 endpoint 必 zod 校验**：不接受 `unknown` 透传 dispatcher / handler / LLM prompt
- **新 component / endpoint 必 spec**：用例覆盖到 happy + 错误 + 边界

判断标准：**"如果用户问'你这是 4 路评审过的吗'你心虚 → 那就还没到 push 标准"**。
