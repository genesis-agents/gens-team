---
name: 架构债 audit:debt 仪表盘
description: backend/scripts/audit-architecture-debt.ts 5 维度量化架构债 + npm scripts 入口
type: reference
originSessionId: 94c0899f-9d18-492b-abde-5c553623a0bd
---

`npm run audit:debt` 一键扫架构债（layer-boundaries.spec 之外的存量违规）。

入口：

- `npm run audit:debt` — 表格输出
- `npm run audit:debt:strict` — 任一指标超 SLO → exit 1（CI 用）
- `npm run audit:debt:json` — JSON 输出

5 维度 + SLO（2026-05-04 落地）：
| 维度 | SLO | 检测逻辑 |
| --------------------------------- | ---- | ----------------------------------------- |
| god-class (≥2500 lines) | ≤ 5 | 单文件行数 |
| shim 文件 (<2 行 export-from) | 0 | 全文 ≤2 行且全是 export-from |
| base-layer 业务名泄漏 | ≤ 5 | engine/harness 含 ai-app 业务名常量 |
| any 类型业务代码 | ≤ 30 | 非 spec/test 含 `: any` |
| TODO / FIXME / XXX 长尾 | ≤ 400 | 注释中关键词 |

排除：`*.exports.ts` SDK barrel 不算 shim。

2026-05-04 基线：god-class 11 (red) / shim 0 / biz-name 2 / any 20 / TODO 277。

**Why**: spec 拦"新增"违规，本脚本扫"存量"违规并量化趋势。
**How to apply**: 任一长 PR 落完跑一次；strict 模式可加进 verify:full / pre-push 链；commit 485ff4f9c 落地脚本，commit 04128aa4b 补 npm scripts。
