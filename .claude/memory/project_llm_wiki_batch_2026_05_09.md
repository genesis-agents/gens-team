---
name: LLM Wiki 综合修复批次 2026-05-09
description: Wiki 模块单批落地（commit e58e44e0e + e05620989 + 01cc52169）：full i18n / real markdown / graph 视图 / 5 bug 修复 / 4 路集体评审 2 轮 4/4 共识 / god-class 拆分
type: project
originSessionId: d7fa9dec-c281-49d4-9fe6-5c8f85de1f5d
---

LLM Wiki 模块综合批次，2026-05-09。涉及 i18n、markdown 渲染、图谱视图、5 个 bug 修复，全部经 4 路集体评审 2 轮 4/4 共识后 push。

**Why**：用户对 P3a 占位连续抱怨（"为什么都不支持"），并要求"解决所有问题后再提交"+"组织一轮集体审视共识"。

**How to apply**：再讨论 Wiki 时，记住下面已落地的最终状态。

**最终状态（commit `e58e44e0e` HEAD）**：

| 维度                           | 状态                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| i18n                           | 90+ 中文字符串 → `t('library.wiki.*')`，120+ keys 在 zh.json + en.json，含 pluralizePages helper（en "1 page" vs "N pages"）                                     |
| Markdown 渲染                  | ReactMarkdown + remark-gfm + rehype-sanitize（含 wikilink: scheme allowlist）；urlTransform 严格白名单（http(s)/mailto/tel/relative/anchor/wikilink, 其他全 ''） |
| Graph 视图                     | `WikiGraphModal.tsx`（独立文件）：concentric SVG，4 同心环按 category，hover 高亮邻接，click 跳页                                                                |
| diff apply 自动刷新            | `readerRefreshTick` 状态 + onApplied 回调让 WikiPageReader 重新 fetch                                                                                            |
| Lint 按钮反馈                  | running 状态 + Loader2 spinner，10s+ 不再"看似卡死"                                                                                                              |
| Wiki Query 500                 | wiki-query.service 改 `AIModelType.CHAT` + TaskProfile（之前缺 modelType 触发 DEFAULT_AI_MODEL 报错）                                                            |
| Ingest 100% hallucination 拒绝 | `totalSourcesSeen > 0 && droppedSources === totalSourcesSeen` → 400，避免无证据 diff 持久化（v1.5.3 §11.1 sources 是证据）                                       |

**god-class 拆分**：

- `WikiGraphModal.tsx` ~250 行
- `WikiSettingsModal.tsx` ~210 行（含独立 Field helper copy）
- `WikiTab.tsx` 从 2671 → 2247 行（< 2500 god-class 阈值）

**4 路集体评审历程**：

- Round 1：架构（NEEDS-CHANGES，3 blockers）+ reviewer（APPROVED w/ 4 should-fix）+ tester（NEEDS-CHANGES，1 hard + 1 soft blocker）+ security（APPROVED w/ 1 LOW）
- Round 1 真血泪点：
  1. **rehype-sanitize 默认 schema strip wikilink: scheme** → 所有内部链接静默失效，必须 `WIKI_SANITIZE_SCHEMA = { ...defaultSchema, protocols: { ...defaultSchema.protocols, href: [...defaultSchema.protocols.href, 'wikilink'] } }` 注入 + `[[rehypeSanitize, schema]]` 元组形式传入
  2. **urlTransform 替换默认 → javascript: 直通** → 必须自己实现 allowlist
  3. **ingest 100% hallucination 静默丢证据** → 必须 throw 而非 persist
  4. **WikiTab.tsx 2671 行触发 god-class pre-push hook** → 必须拆分独立文件
- Round 2：4/4 APPROVED，push

**预存仓档**：

- `feedback_implement_dont_delete_placeholders.md`（占位优先实现而非删按钮）
- `feedback_llm_id_must_be_in_prompt_and_whitelist.md`（LLM 输出外部 ID 三件套）
- 本 project 文件

**未做项（明确推迟）**：

- `wiki-query.service.ts` Branch B (RAG) 真实现：当前 fallback 到 A_inline + warn log；架构师在 round 1 标为 blocker，但属本批次未触动的 pre-existing tech debt，独立 P2 follow-up
- 服务端 tarball export：仍 501，前端 markdown 拼合即可
- Diff 三色 split-view：当前文本 side-by-side preview

**踩坑教训（沉到 feedback）**：

- god-class 守护是 pre-push 不是 pre-commit，commit 成功不代表能 push；新功能 + 大文件必须当场拆
- 大批次必须 4 路集体评审两轮（实施时引入新红线，design consensus 不够）
- rehype-sanitize 默认协议白名单非常窄，自定义 URL scheme 必须显式扩展
