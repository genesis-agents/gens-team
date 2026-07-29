---
name: 必填字段强制时必须扫所有调用入口
description: schema 改字段为必填且删 backend fallback 时，必须 grep 所有 launch / 构造 input 的调用点确保全都传新字段，否则少修一处必然在用户侧炸成 400
type: feedback
originSessionId: b563b5ca-9b52-4741-90db-57cabe79a67c
---

把某 schema 字段从可选改成必填、并删除 backend 内部 fallback 默认值时，
**必须 grep 全仓所有构造该 input 的调用点**，确保它们都被更新成显式传新字段。
漏改一处必然 → 用户操作 → safeParse 必失败 → 400 → 用户只看到通用兜底文案。

## 真实案例

P0-K (2026-05-06) 把 `RunMissionInputSchema` 的 `maxCredits` +
`budgetMultiplierOverride` 改成必填、删 `BUDGET_PROFILE_CREDITS` /
`BUDGET_PROFILE_MULTIPLIER` 内部硬编码映射时，只改了：

- `agent-playground/dto/run-mission.dto.ts` schema 改必填
- `frontend/components/agent-playground/DemoLauncher.tsx` 加 `estimateTokens()` 算两个字段
- `frontend/app/agent-playground/team/[missionId]/page.tsx#1188` rerun 路径加 `inheritedMax ?? 1000`

漏改：

- `backend/src/modules/ai-app/custom-agents/custom-agents.service.ts#translate`
  这个路径走 `RunMissionInputSchema.safeParse` → 必失败 400
  → 前端 LaunchMissionModal 通用 catch 显示"启动失败"
  → 用户看到模糊文案两周才反馈（commit e00587b72 才修）

## How to apply

改 schema 必填字段 / 删 backend fallback 时按这个 checklist：

1. **grep schema 类型名 × 所有构造点**：
   ```bash
   rg "RunMissionInputSchema|RunMissionInput\b" backend/src
   rg "RunMissionInput\b" frontend
   ```
2. **看 `.safeParse(...)` / `.parse(...)` 的所有调用方**：每个调用方上游必须显式构造新字段
3. **业务模块的"翻译" / "适配" / "桥接"层是高发盲区**：custom-agents 的
   `translate()` / topic-insights 的 `synthesize()` 这种把 X → Y 转换的
   helper 经常少一两个新字段
4. **加 spec 防回归**：把所有 (有限枚举组合) 矩阵跑一遍 safeParse，
   任何组合输出失败立刻红
5. **错误信息别用通用兜底**：前端 catch 时把 `e.message` 直接显示，让用户
   能看到 backend 的具体错误（"maxCredits:Required"），而不是"启动失败"

## 兜底教训：不要让前端 catch 显示通用文案

`LaunchMissionModal.tsx#70`:

```ts
catch (e) {
  setError(e instanceof Error ? e.message : '启动失败');
}
```

这本身没错（apiClient 会把 4xx body 转成 Error.message），但当
backend 返回 `BadRequestException("Translated input invalid: ...")` 时
apiClient 抛出的 Error 本来就该带 detail。如果 modal 只显示"启动失败"，
说明 apiClient 的 message 透传链有断点，也是要查的方向。
