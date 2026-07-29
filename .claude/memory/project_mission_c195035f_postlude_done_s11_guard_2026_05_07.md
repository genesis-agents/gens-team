---
name: project_mission_c195035f_postlude_done_s11_guard_2026_05_07
description: 2026-05-07 c195035f 第二轮 prod 验证：S11 chapter_content_incomplete guard 第二次拦下；PR-R6/R7 正好覆盖此场景
type: project
originSessionId: 405df6f2-13f8-4089-b32e-cdfb72c939ee
---

# c195035f mission 第二轮 prod 观测

**snapshot 2026-05-07 ~10:09**（mission 在 ~07:56 failed）

## 关键数据

| 字段                 | 值                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------- |
| status               | **failed**                                                                          |
| last_completed_stage | 10（S10 leader signoff done）                                                       |
| error_message        | `chapter_content_incomplete: nonEmpty=13/14 sections >= 40 chars, totalChars=90968` |
| chapter_drafts       | 30 generated / 30 passed → 69964 bytes                                              |
| sections_count       | null（report_full **未落库**）                                                      |
| template_id          | null（同上）                                                                        |
| sanitizer_version    | null                                                                                |
| cost_usd             | 3.415 / max_credits 4140（远未触顶）                                                |
| last_event           | mission:postlude:completed                                                          |

## 关键结论

1. **v1.7 装配真的跑过了**：postlude:completed 说明 S11 之前所有 stage 包括装配都完成。但 S11 markCompleted 内有 chapter_content_incomplete guard：14 sections 中 1 section bodyChars < 40 → 直接 throw → markCompleted 拒 → markFailed。
2. **report_full 没持久化**：因为 S11 markCompleted 失败，report_full 列还是 null。reportArtifact 在 ctx 里有，但没写库 → cdHydrate 路径下也读不到（除非走 PR-R4 的 markIntermediateState 路径，但 S8/S8B 的写入也得依赖 stage 跑过）。
3. **PR-R7 hotfix（preface→optional）应该缓解**：之前 c195035f 第一轮 failed 是 preface fixed slot bodyBytes=0；这次是 14 sections 中 1 section 仍空，说明 hotfix 部分起效但 guard 仍触发新场景（不同 section 空）。
4. **PR-R6/R7 路径完全覆盖此场景**：用户从前端 todo 卡片选 stepId='s11-persist'（cascade=[s11]）→ markReopened（failed→running）→ 重跑 S11 markCompleted。但当前 PR-R5 的 s11 handler 是 placeholder，所以 cascade 会 throw "[PR-R5b] s11-persist..."。需要 PR-R5b 补 s11 真 handler。
5. **元教训**：S11 guard 拦下的 mission，自身 reportArtifact 是健康的（只是 1 个 section 空），如果用户选择 "接受退化产物" 也是合理选项。当前 markFailed 逻辑过严 —— 应该 markCompleted 但标 quality-failed 让用户决策（PR-R5b/R5c 应一并考虑）。

## TODO（next session）

- PR-R5b: 至少把 s11-persist 的真 handler 补上（最简单的：复用 mission-store.markCompleted 但 bypass content guard）
- 考虑把 chapter_content_incomplete 从 hard-fail 改为 quality-failed（warning）
- 找出 14 个 section 中具体哪个为空（看 reportArtifact.content.fullMarkdown 切片）
