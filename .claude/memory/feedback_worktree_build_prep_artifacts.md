---
name: feedback_worktree_build_prep_artifacts
description: worktree 首次 frontend build 需 bootstrap frontend/lib/generated/CHANGELOG.md 空文件；backend type-check 失败常因 worktree 自带 stale Prisma client，跑 cd backend && npx prisma generate
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7c275681-3745-4c0b-b722-fbe6b75dc9e0
---

新 worktree 跑 `npm run verify:full` 前需要补两个 bootstrap 步骤，否则 build / type-check 必失败。

**Why**：

1. **frontend build**：`scripts/generate-changelog.js:176` 无条件 `fs.readFileSync('lib/generated/CHANGELOG.md')`，文件是 gitignored build artifact（PR-X35 移出 git）。每次有新 conventional commit 触发 step 4 必走该读取，新 worktree ENOENT 直接 crash
2. **backend type-check**：merge 带新 prisma model（如 SocialMission）进来，但 worktree 的 `node_modules/@prisma/client` 是它当时 npm install 留下的旧 generated，type 不匹配。pre-push hook 拒推

**How to apply**：worktree onboarding 标配两步：

```
echo "# Changelog" > frontend/lib/generated/CHANGELOG.md
cd backend && npx prisma generate
```

`scripts/generate-changelog.js` 自动 bump 副作用要事后 revert 三 package.json + frontend/lib/generated/changelog.json，否则脏字段会污染 PR diff（commit 类型不算 release commit）。

Long-term fix：把 `fs.readFileSync` 放在已有的 `fs.existsSync(changelogPath)` 之后（line 198）；不属本 session 范围。
