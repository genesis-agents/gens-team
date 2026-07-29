---
name: feedback_new_ai_app_must_use_public_four_pieces
description: 新 ai-app 主页/创建弹窗必须四件套全走公共组件 — PageHeaderHero + AssetCard + MissionDialogShell + Field（双输入框模式）；自己写一个 Hero/Card/Dialog = 反模式
metadata:
  node_type: memory
  type: feedback
  originSessionId: 32c19662-c0cb-4dd6-8af6-3bcfae5cf110
---

新建或翻新任何 ai-app（ai-radar / ai-insights / agent-playground / writing / planning 等）主页时，**先扫 `frontend/components/common/` 找四件套**：

| 用途                                                 | 公共组件                                          | 路径                                    |
| ---------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| 主页 Hero 头（icon + 渐变 + title + actions + 搜索） | `PageHeaderHero`                                  | `common/page-header-hero/`              |
| 资源/任务卡片                                        | `AssetCard`                                       | `common/asset-card/`                    |
| 创建/编辑弹窗壳                                      | `MissionDialogShell`                              | `common/dialogs/MissionDialogShell.tsx` |
| 弹窗内表单字段包装                                   | 内联 `Field`（参考 PlaygroundMissionDialog 末尾） | 各 ai-app modal 复制 30 行 helper       |

**Why**：2026-05-16 AI 雷达主页改造事故——RadarTopicCard 已基于 AssetCard，但主页头部、创建弹窗自写了 ~250 行 div/svg/button，与 AI 洞察 / Playground 三处视觉脱节，用户截图直接喷"AI 雷达主页错了"。事后抽 PageHeaderHero 公共组件让三处合并，证明这层抽象本应早就存在。

**How to apply**：

1. 翻新前用 Glob `frontend/components/common/**/*.{ts,tsx}` 全扫
2. Grep 现有 ai-app（ai-insights / agent-playground）的主页与 modal，看接入姿势
3. 必填字段必须放 MissionDialogShell `primary` slot，**不能放 `advanced` 折叠区**（否则用户提交失败才被通知去展开 = 反模式，本次 R3 修复点）
4. 字段补全走 YAGNI：visibility / progress 等卡片字段如无业务场景就不传，AssetCard 不传不渲染
5. 新建公共组件时 prop 必须最小化（PageHeaderHero 不带 search bar，把 search 让给调用方按业务自由放）；新组件复用方 ≥3 处才抽

参见 [[feedback_expose_dual_input_topic_description]]（双输入框）+ [[feedback_implementation_rounds_need_review_too]]（实施 PR 必须多路评审）+ [[feedback_consensus_must_iterate_to_all_yes]]（评审走到 4/4 YES）。
