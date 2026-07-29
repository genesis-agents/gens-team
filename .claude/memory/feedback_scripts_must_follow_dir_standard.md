---
name: feedback-scripts-must-follow-dir-standard
description: 项目有 .claude/standards/12-scripts-management.md + scripts/utils/check-scripts-compliance.sh，写新脚本前必读规范、写完先跑合规检查
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4ba200e5-9b40-4309-a19e-0e62967e8e36
---

写新脚本前**必读** `.claude/standards/12-scripts-management.md` 并跑 `bash scripts/utils/check-scripts-compliance.sh`，**不要在 scripts/ 根目录散放工具脚本**。

**Why**：2026-05-18 写 `scripts/audit-ui-discipline.ts` + `scripts/audit-ui-tokens.ts` 直接放在根目录，被用户 4 个感叹号警告"毫无规则"。规范明确：

- ❌ 根目录不允许散放工具脚本（项目已有 11 处违规历史包袱）
- ✅ 验证脚本（`verify-*` / `validate-*` / `check-*` / `audit-*` / `setup-*`）放 `scripts/utils/`
- ✅ 诊断脚本放 `scripts/utils/diagnostics/`
- ✅ 一次性修复 `fix-*` 完成后归档 `scripts/_archive/fixes/`（用后立即归）
- ✅ 一次性迁移 `migrate-*` 完成后归档 `scripts/_archive/migrations/`（用后立即归）

别 session 的 `check-scripts-compliance.sh --fix` 触发了 R100 rename，自动把我的脚本从 root 移到 utils/——但 package.json 和 docs 的旧路径引用不会自动跟着改，造成 5 处断引用、4 次额外 commit 才补全。

**How to apply**：

1. 写新脚本**第一步**：`cat .claude/standards/12-scripts-management.md` 看规范
2. 写完**第二步**：`bash scripts/utils/check-scripts-compliance.sh` 看是否合规
3. 命名前缀对应位置：
   - `verify-*` / `validate-*` / `check-*` / `audit-*` → `scripts/utils/`
   - `diagnose-*` → `scripts/utils/diagnostics/`
   - `fix-*` → `scripts/_archive/fixes/`（一次性，跑完归）
   - `migrate-*` → `scripts/_archive/migrations/`（一次性，跑完归）
   - `monitor-*` 生产 → `scripts/monitoring/`
   - `setup-*` 部署 → `scripts/deployment/` 或 `scripts/utils/`
   - 后端 Prisma 相关 → `backend/scripts/`
4. **同时同步**：package.json npm scripts、`.husky/*`、docs 里所有引用必须用新路径
5. 别指望 `check-scripts-compliance.sh --fix` 帮你修引用——它只 rename 文件

**反例**：

- 写 audit-ui-\*.ts 直接放 scripts/ 根目录（违规）
- 4 个 commit 后才完全归位：feat add（旧路径）→ R100 别 session 自动归位 → docs/baseline 漂移 → 最终路径对齐
- 单条规范一次读完只要 30s，省 4 次额外 commit

相关：[[feedback_throwaway_scripts_must_cleanup]] [[feedback_audit_script_self_implementation_exclusion]]
