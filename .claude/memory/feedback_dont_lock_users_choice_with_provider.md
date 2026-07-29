---
name: dont-force-user-pick-provider-admin-may-not-have
description: 用户提交申请类表单不要让用户硬选"哪个 provider/资源"——admin 未必有；让 admin 在审批时自由选
type: feedback
originSessionId: 7d028ab3-e546-4f0f-9b44-f6ee8ffbc81d
---

用户提交申请类表单（KeyRequest / 配额申请等）**不要**让用户必选具体 provider / 资源 ID 的下拉。理由：

1. **admin 未必有该 provider 可用模型**——用户硬选 OpenAI，admin 没 OpenAI Key，申请直接卡死
2. **provider 列表是动态的**——admin 在 `/admin/ai/models` 随时启停 AIModel；前端 hardcode `REQUEST_PROVIDERS` 数组无法跟生产同步
3. **用户视角想要的是"我要 Key"**，不是"我要 OpenAI 的 Key"

**Why**：2026-05-08 用户三次反馈："admin 未必有对应 provider 的"+"provider 也会持续更新"+"用户不要指定具体的模型"

**How to apply**：

- 申请类 DTO 字段尽量 optional，让 admin 在审批界面看**当前**可用资源自由选
- 前端 RequestKeyModal 只留"使用目的 + 用量预估 + 备注"
- 防重复改成 `每用户最多 1 条 PENDING`（不分 provider 分桶）
- 通知文案中的 provider 取自 admin 实际授权的 assignment（不取 request 里的预选 provider）

**反模式对照**：admin 自己用的工具（GrantKeyModal）当然要选具体 model——admin 知道自己有什么。区别在于"提交方"和"决策方"是否同一人。
