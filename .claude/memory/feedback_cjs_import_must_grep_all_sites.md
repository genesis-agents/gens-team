---
name: feedback-cjs-import-must-grep-all-sites
description: 纯 CJS 包（如 rss-parser）的 default-import bug 修复必须 grep 全仓所有用同一包的文件
metadata:
  node_type: memory
  type: feedback
  originSessionId: eb9df724-2242-4336-8d27-58151c093da9
---

修复一个文件的 `import Parser from "rss-parser"` → `import * as RssParserModule` CJS bug 时，必须 grep `from "<package>"` 全仓所有引用，逐个修；不能只看着报错那个文件改完就以为修了。

**Why**：2026-05-16 ai-radar prod boot 第二次崩在同一错（`rss_parser_1.default is not a constructor`）。第一次紧急修了 RssCollector 一处就 push 了，但 X-collector / YouTube-collector 也用 `import Parser from "rss-parser"`，CJS 编译后同样的 bug。boot 时随 DI 顺序触发哪个就崩哪个。

**How to apply**：
修任何纯 CJS 包（`module.exports = Class`，无 default）的 default-import 时：

1. `grep -rn 'from "<package>"' src/` 找所有引用点
2. 每处都改成 `import * as <Pkg>Module from "<package>"` + `import type <Pkg> from "<package>"`（type-only 拿泛型签名）
3. 加 runtime ctor cast：`const Ctor = ((Module as { default?: unknown }).default ?? Module) as <ProperCtorType>`
4. 已知 CJS-only 包：`rss-parser`、`bcrypt`、部分 `@mapbox/*`、`canvas` — 类似模式都要警惕

**类似 CJS-import bug 信号**：

- prod 报 `<pkg>_1.default is not a constructor`
- prod 报 `<pkg>_1.default is not a function`
- 本地 tsc 通过但运行时炸（local dev 走 ts-node 转译路径不同）

适用于：[[feedback_unitrack_audit_must_check_consumer]]、[[feedback_required_field_must_scan_all_callers]]
