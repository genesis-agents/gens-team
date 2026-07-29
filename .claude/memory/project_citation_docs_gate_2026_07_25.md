---
name: project-citation-docs-gate-2026-07-25
description: 引用自动导入的文档页闸门（用户拍板完全不入库）+ PDF 豁免 + 生产库已清 36 条；划词翻译 401 根因
metadata:
  node_type: memory
  type: project
  originSessionId: 6837e5d4-59cf-47df-bb7e-0fc3d6df6af8
  modified: 2026-07-25T06:39:50.153Z
---

2026-07-25 两个 explore 修复（均已上线 48e750e32）：

**引用导入文档页闸门**（用户拍板"完全不入库"）：

- 根因链：报告组装器把弱信号引用兜底归 "industry" + 精选源白名单强推信誉分 ≥90 → 导入监听器 industry→REPORT → Claude Docs/About 页灌满报告 tab。classify 打标（code/platform chips）只写 UI 展示字段，不参与 ResourceType 归类
- 闸门：`isDocsOrReferenceUrl()`（report-citation-import.listener.ts，导出供复用）——docs/help/support 子域 + /docs//about//pricing 等路径挡下；**`.pdf` 结尾豁免**（WEF/NLR 把真报告 PDF 挂在 docs. 子域和 /docs/ 路径下，dry-run 实锤 5 条误伤）。**勿删这个豁免**
- 存量已清：2026-07-25 对生产库删 36 条（谓词与闸门一致），dry-run→人工检视→实删流程
- 清理脚本在 job tmp（会话结束即失效）；再要清理按同谓词写 SQL：`type IN (...) AND (source_url ~* host_re OR ~* path_re) AND source_url !~* '\.pdf([?#]|$)'`

**划词翻译 401**：`TextSelectionToolbar.tsx` 翻译 fetch 漏了 `...getAuthHeader()`（同文件笔记请求有带）——全局 JWT 守卫会 401 匿名请求，路由级 `OptionalJwtAuthGuard` 压不过全局守卫、除非 `@Public()`。**教训：该文件/新增裸 fetch 必须带 getAuthHeader()，或改用 apiClient**

生产 DB 直连方式（本次验证可用）：`railway variables --service Postgres --kv` 取 `DATABASE_PUBLIC_URL`，node 脚本用 `createRequire(backend/package.json)` 借 backend 的 @prisma/client。`railway logs` 是流式命令，管道 grep 会永远挂起，勿直接 tail

相关：[[project-rebrand-gens-team-2026-07-24]]
