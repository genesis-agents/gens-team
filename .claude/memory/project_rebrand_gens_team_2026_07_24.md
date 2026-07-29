---
name: project-rebrand-gens-team-2026-07-24
description: 2026-07-24 品牌 GenesisPod→gens.team、仓库改名 gens-team、logo=g+公式；Railway 环境变量管品牌；清扫排除项与工具链坑
metadata:
  node_type: memory
  type: project
  originSessionId: 6837e5d4-59cf-47df-bb7e-0fc3d6df6af8
  modified: 2026-07-24T07:22:59.908Z
---

2026-07-24 完成全量品牌重命名 GenesisPod → **gens.team**（项目最早就叫 Gens.Team，等于改回去）：

- GitHub 仓库：`genesis-agents/GenesisPod` → `genesis-agents/gens-team`（旧 URL 自动重定向）；`APP_CONFIG.github.repo` 默认值是仓库名 `gens-team`（连字符），不是品牌名 `gens.team`
- **线上品牌由 Railway 环境变量决定**（`NEXT_PUBLIC_BRAND_NAME` / `BRAND_NAME` 等，均已设为 `gens.team`），代码默认值只是兜底；前端是构建时烘入
- Logo 最终形态（2026-07-24 当天几轮反复后定案）：展开态 = **纯 `gens.team` 字标 + 版本徽标，无公式无图形**；折叠态 = 斜体 `g`（Georgia serif）。生命游戏公式 f/g(n,s)→{0,1} 已彻底移除（先被换掉→用户要求还原→布局遮挡后用户最终拍板整个去掉）。教训：header 是固定 208px，品牌名是 env 变长文本，改 BrandLogo 需注意溢出
- 品牌清扫刻意排除（勿"补扫"）：`docs/_archive/**`、带日期的审计/诊断/会议纪要、ADR/decision 记录、`frontend/lib/generated/changelog.json`
- `backend/prisma/seed-data-sources.ts` 里 DOE 关键词 **"Genesis Mission" 是外部真实项目名**，两次被品牌 sed 误伤，勿再改

工具链坑（本次踩过）：

- lint-staged 在 Windows 一次提交 >~50 文件会 "command line too long"，需分批（≤25/批）提交
- `prisma/seed-data-sources.ts` 曾不在 ESLint tsconfig 覆盖内导致 parsing error 卡提交，已加入 `backend/.eslintignore`
- webhook-dispatcher spec 曾因未 mock `assertUrlSafe`（真实 dns.lookup）在全量并行测试下 flake，已补 `jest.mock("../../../../ai-engine/facade")`；新写含 SSRF guard 调用的 spec 记得 mock

相关：[[project-p1-react-runaway-fix-2026-04-29]]
