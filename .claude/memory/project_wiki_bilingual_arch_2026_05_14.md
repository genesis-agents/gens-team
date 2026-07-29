---
name: wiki-bilingual-kb-2026-05-14
description: P0-A multi-pass per-locale outline + section-fill + cross-link per-locale 拆分；P0-B 翻译 migration（无须重跑 source ingest）
metadata:
  node_type: memory
  type: project
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

LLM Wiki 双语 KB 真正落地的 4 commit (2026-05-14):

1. `102ab20aa` p1+p2 base：toLocale=source（不再硬编码 zh） + outline MAX_PAGES 动态 + section-fill outputLength=extended + prefer-UPDATE 改平衡决策
2. `7d83a010b` p1 slug 语言规则强化：英文页 MUST NEVER 用 pinyin + 5 文件 byte-equal (4 multi-pass + 1 SINGLE)
3. `1acd4c3aa` p0-a bilingual MULTI pass 端到端打通
4. `feat/wiki-admin/translate-kb` p0-b 翻译 migration

**Why**: 用户痛点 "为什么中英文双语不支持，为什么英文模式使用了拼音，为什么中文模式少了无数的数据"。SINGLE pass 已有双语支持（`buildIngestUserPrompt` localeBlock + 双 emit），MULTI pass 是历史缺口（所有 page 强制 locale=targetLocales[0]）。

**How to apply 给未来 bilingual 类似改造**:

- **per-item locale 透传链路**: outline 返回 → allOutlineItems 携带 → priorBody load 用 `slug:locale` key → section-fill args.item.locale → user prompt 顶部 TARGET_LOCALE 块硬断言 → sectionResults 携带 → assemble 用 item.locale (NOT global DEFAULT_LOCALE)
- **cross-link 必须 per-locale 分组跑**: bilingual bodies 同 slug 不同 locale → char offset 不同 → 单次跑 → 同 insertions 应用两 body 都错位。改成 `for (const [locale, results] of sectionByLocale)` 各跑一次，bodyByKey 用 `slug:locale` 复合 key
- **translationGroupId pairing**: 源 page 无则 mint 新 uuid + 回填到源行；目标 page 共享同 uuid → 前端 locale 切换器靠这个配对
- **enabledLocales bump**: 翻译 migration 完成后自动加入 target locale，后续 ingest 走 bilingual 自动双 emit
- **AIModelType 不在 facade**: `import { AIModelType } from "@prisma/client"`，不是从 ai-engine/facade，prisma generate 出来的 enum

**byte-equal skill 契约**: 4 multi-pass (outline/section/crosslink/common-header) + 1 SINGLE (wiki-ingest.skill.md)，5 文件改一处必须 5 处一致改（Anthropic prompt cache prefix matching 要求）。

5 文件清单：

- skills/wiki-ingest-common-header.md (canonical)
- skills/wiki-ingest-outline.skill.md
- skills/wiki-ingest-section.skill.md
- skills/wiki-ingest-crosslink.skill.md
- skills/wiki-ingest.skill.md (SINGLE，有自己的简化版段落)

**翻译 migration 设计要点**:

- OWNER-only（写 + LLM 成本）
- 只处理 missing target locale 的 page（已配对的 skip）
- 单 transaction 内：1) 回填源 groupId 2) create target locale row
- LLM 内联 prompt（不抽离 skill file —— 单一用途，避免 over-engineering）
- partial-success：单 page 失败 log + failedSlugs 计数，不 abort batch
- WikiOperationLog op=EDIT meta={kind:'translate-kb'} 留审计痕
