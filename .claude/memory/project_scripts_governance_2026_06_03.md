---
name: project_scripts_governance_2026_06_03
description: 2026-06-03 scripts 目录 MECE 收敛 + 规范 12 升级为阻断门禁（PR #256）
metadata:
  node_type: memory
  type: project
  originSessionId: 5bc373e3-e2e9-499d-9c89-b0b5f95b3469
---

承接 [[project_mece_w1_execution_2026_06_03]]。`backend/scripts` 根目录原堆 19 个无引用一次性/调试脚本。

**规范早就有但形同虚设**：`.claude/standards/12-scripts-management.md`（MUST 级）+ 检查脚本 `scripts/utils/check-scripts-compliance.sh`（5 项 + `--fix` 自动归档），但**未接入任何门禁**——纯孤儿 + `scripts-guardian` agent（read-only/haiku/手动）。

**本次（PR #256，branch `chore/scripts-reorg`，3 commits）**：

- backend/scripts 收敛进桶 `db/` `dev-tools/` `maintenance/`（根只留 package.json/Dockerfile/CI 入口：entrypoint.sh / copy-build-assets.js / audit-capability-anti-patterns.cjs / audit-architecture-debt.ts）。
- 10 个一次性脚本归档 `_archive/` 加 `2026-06-` 日期前缀（标准要求 `YYYY-MM-{name}`；注意 backend 分支的 `--fix` 是 FLAT `_archive/` 加日期前缀，**不**建 fixes/migrations 子目录——只有 repo-root `scripts/` 才用子目录）。
- 命名修复：`test-playground-ui.js`→`check-playground-ui.js`（test- 误导成 jest）；`quick-chart-check.js` 归档（check-charts-data.ts 的 throwaway 重复）。
- **严格按规范改名**（用户"必须严格按照规则"——选改名而非放宽检查）：`scripts/ui-iteration/fix-generator.ts`→`generate-fixes.ts`、`fix-validator.ts`→`validate-fixes.ts`。`fix-*`/`migrate-*` 是一次性脚本**保留前缀**，长期工具改用 `generate-*`/`validate-*`。这俩只互相 import（FixSuggestion），零外部引用。
- **升级为阻断门禁**：pre-push 新增 `[0d/6]` 步骤 + CI 新增 `scripts-compliance` job 汇入 `ci-status` 合并门 + `npm run audit:scripts` 别名。标准 12 升 v1.1 加 Enforcement 段。

**坑**：①check 的 `fix-*`/`migrate-*` 是按文件名 glob 硬拦截，会误报长期框架模块（ui-iteration 那俩就是）——根治是改名而非改 glob。②check #4 REQUIRED_DIRS 缺失只 warning 不 fail（exit 0），故空 `_archive/fixes` 等不会挂 CI。③标准 12 的"目录结构"列表原 aspirational（列了不存在的 deployment/，缺 ci//dev//devops//ui-iteration/）——**已对齐现实**（最后一 commit 420550d4d）：repo-root 补真实 4 目录、backend 段从 flat loose-file 改成 MECE 桶。CI 验证：Scripts Compliance job pass(10s)。

**真实目录速查**：repo-root `scripts/` = \_archive/ ci/ dev/ devops/(部署运维发布) docs-specialist/ local-server/ merge-to-main/ monitoring/ release-notification/ ui-iteration/ utils/(+diagnostics/)。backend/scripts/ = \_archive/ ci/ db/ dev-tools/ maintenance/ thumbnails/ + 根活脚本(entrypoint.sh/copy-build-assets.js/audit-\*.{cjs,ts})。
