---
name: project-frontend-ui-baseline-2026-05-18
description: Genesis.ai 前端 UI 验证基线（2026-05-18 四路审计）：组件库齐全但复用率 < 10%，4 套 token 系统，1134 处 Tailwind 任意值
metadata:
  node_type: memory
  type: project
  originSessionId: 4ba200e5-9b40-4309-a19e-0e62967e8e36
---

Genesis.ai 前端 UI 验证基线快照（4 路 Explore subagent 并行审计产出）。

**关键事实**：

1. **公共组件库齐全但复用率极低**：
   - AppShell（9+）、AssetCard（4）、PageHeaderHero（4）、MissionDialogShell（2）、EmptyState（2）、ErrorState、LoadingState（2）、SideDrawer 都已存在
   - Profile/page.tsx 单文件自写 `rounded-lg border` 卡片 12+ 次
   - 5+ 页面有 `list.length===0` 分支但没 EmptyState UI

2. **4 套 token 系统并存**（SSOT 风险）：
   - 主源：`frontend/app/globals.css` shadcn CSS vars
   - 备源：`frontend/tailwind.config.ts` extend（其中 primary 数字色板 0 引用，死代码）
   - 平行源 1：`components/playground-design/tokens.ts`
   - 平行源 2：`components/ai-office/slides/slide-tokens.css`
   - 平行源 3：`components/library/tokens.ts`

3. **Token 违规精确数**（frontend/{app,components} 排除 admin）：
   - 硬编码 `#hex`：**0**（颜色纪律满分）
   - 任意字号 `text-[Npx]`：**815**
   - 任意尺寸 `w-[]/h-[]`：**319**
   - 内联 `style={{}}`：**696**（含动态合理项）
   - 硬编码 `rgba/rgb/hsl(`：**106**
   - 节奏外间距（py-1.5/gap-2.5/p-5/p-7）：**800+**

4. **响应式断点画像**：`md:` 142 / `lg:` 126 / `xl:` 34 → md→lg 跳跃导致 768-1279px 平板塌陷

5. **弹层 5 套并行**：AdminDrawer / SideDrawer / MissionDialogShell / Modal / 50+ 业务自写 → scroll-lock + focus-trap 各 3 套实现

6. **重灾区文件 TOP 5**（按违规密度）：
   - `app/profile/page.tsx`（卡片自写 12+）
   - `app/page.tsx`（首页自写多）
   - `app/settings/notifications/page.tsx`
   - `app/ai-research/page.tsx` + `app/ai-insights/topic-research/page.tsx`（不用 AppShell）
   - `components/playground-design/tokens.ts`（自成 token 系统）

**Why**：用户痛点是 UI 一致性，需要在动手前知道现状量化数据，避免"凭想象设计验证方案"。

**How to apply**：

- 后续做 UI 验证 / 公共组件 / token 收口任务时，**先读** `docs/guides/testing/frontend-ui-validation.md`
- 数据可能随重构变化，引用前必须用 `npm run audit:ui` 重新跑一次（脚本已实装），或针对性 grep 验证
- 计划 4 周：W1 ESLint+AST 地基（已落地 commit 2e4b0e8dd）、W2 重灾区重构、W3 Storybook+Argos、W4 LLM Vision
- W1 落地后实测违规数：discipline 562 + tokens 4090（基线冻结，pre-push warn-only 看护已生效）

**详细方案**：`docs/guides/testing/frontend-ui-validation.md`

相关：[[feedback_check_reuse_before_building]] [[feedback_no_dual_sources]] [[feedback_pc_two_column_breakpoint]] [[feedback_drawer_stats_2col]]
