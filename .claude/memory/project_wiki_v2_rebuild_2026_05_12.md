---
name: project-wiki-v2-rebuild-2026-05-12
description: LLM Wiki v2.0 重塑 5 PR 全落地（W1-W5）— 预解析管线 + 多 pass ingest + KB 多语言 + 工具接入 + 硬删除 + index 页 auto-regen
metadata:
  node_type: memory
  type: project
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

2026-05-12 用户对 Screenshot_64 反馈 Wiki "过于简陋 / 只产 SOURCE / 不能多语言 / 不能删除"。对照 Karpathy LLM Wiki 蓝图全量重塑，5 PR 一次性落地后端 + 前端 + spec，最后统一 push。

**Why**：Screenshot_63 用户首发问题是 diff apply 弹出英文 alert（regex 漂移），追到根因是后端 "on slug(s):" → "on (slug:locale):" 但前端 regex 没跟进。修完发现 Wiki 系统性问题远不止一处：ingest 偏 SOURCE 类目（creativity=deterministic 让 LLM 取安全路径），没有图，DEFAULT_LOCALE 硬编码 zh，没有 destroy endpoint，playground 端没有 wiki-search/wiki-page-read 工具。

**How to apply**：未来动 Wiki 任何模块前先读 docs/architecture/ai-app/library/wiki/llm-wiki-v2-rebuild-plan.md + 2026-05-12-multi-pass-and-locale-consensus.md。改 ingest pipeline 必须保 4 category fan-out 红线 + 图 URL 注入。改 KB 设置必须考虑 enabledLocales。

## 落地 commit 链（全在 main）

| PR                      | Commit      | 关键文件                                                                                                                                                                      |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| diff alert 修           | `6b811ab50` | WikiDiffModal.tsx + i18n                                                                                                                                                      |
| docs v2.0               | `9b2c4771c` | llm-wiki-v2-rebuild-plan.md                                                                                                                                                   |
| W1 预解析               | `ab4509dc6` | preparse.service.ts + utils + module + DocumentListDialog badge                                                                                                               |
| 创建 mission "研究描述" | `0c935f8ea` | 顺手补全 playground                                                                                                                                                           |
| W2 fan-out + 图注入     | `31e66d0a9` | wiki-ingest.skill.md 加 3 RULE + wiki-ingest.service buildUserPrompt 3rd MEDIA_URLS param + collectPreparseMediaUrls + logCategoryDistribution + creativity deterministic→low |
| W3 enabledLocales       | `f0d1556d7` | wiki.prisma + 20260518 migration + controller filter + page.service dedup+sort upsert + ingest DEFAULT_LOCALE from config + WikiSettingsModal segmented control               |
| W4 wiki-page-read       | `958f39f7c` | IKbQueryAugmentor.getWikiPage + WikiPageRead type + KbQueryService.getWikiPage(WikiPageService 委托) + wiki-page-read.tool.ts + tools.provider 注册                           |
| W5 hard delete + index  | `b287ed0b4` | destroyWikiData OWNER-only tx 级联 + DELETE /destroy + WikiDisableConfirmDialog opt-in checkbox + regenerateIndexPage 复合追踪 + applyDiff post-commit hook                   |

## 关键架构决策

1. **复用既有原语（用户明确要求）**：
   - W1 用 ContentFetchService（SSRF guard + YT cache + Supadata fallback），不自己 fetch
   - W2 走 AiChatService + TaskProfile，不硬编码 model
   - W4 走 KB_QUERY_AUGMENTOR Dependency Inversion 端口（与 rag-search 同一个），不新建第二 DI token
   - W5 复用 WikiPageService 已有 viewer ACL + IDOR 防护

2. **engine ↔ app 单向**：W4 augmentor 端口在 ai-engine/rag/abstractions/，KbQueryService(ai-app) 通过 @Global() 模块绑定 → 让 ai-engine 工具透明 wiki-first 但源码无 ai-app 依赖

3. **图源决策**（用户 AskUserQuestion 答）：只用源文档已有图（爬虫提取 + YouTube 缩略图），不做 AI 生成图 / 视频帧提取。reuse extractImageUrls 工具函数

4. **多语策略决策**（用户 AskUserQuestion 答）：admin 选 KB 语种（zh / en / 二者），不做用户首选。enabledLocales[0] 当 DEFAULT_LOCALE 取，dedup+sort 保 deterministic

5. **destroy 比 enable 严**：toggleWikiEnabled 是 VIEWER+，destroyWikiData 是 OWNER（"destructive_op_must_have_rollback" feedback）；同一 $transaction 内级联清 7 表 + wikiEnabled=false 一气呵成

6. **index 页是 SUMMARY 类目正常 WikiPage**：slug `__index__`，不参与 diff 管道（不入 pending proposals 不占 lint 配额），fire-and-forget post-commit regen 不阻 apply 成功

## 用户痛点 → 解决路径

| 痛点                    | 修法                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------- |
| diff apply 弹英文 alert | 双格式 regex + 项目内 banner + dialog                                              |
| ingest 只产 SOURCE      | creativity low + 3 强制 RULE + logCategoryDistribution 可观测                      |
| 没有图                  | collectPreparseMediaUrls + buildUserPrompt MEDIA_URLS block + IMAGE EMBEDDING RULE |
| 不能多语                | enabledLocales 列 + 控制器白名单 + 设置面板 segmented control                      |
| 不能删除                | DELETE /destroy + opt-in checkbox                                                  |
| 没有 playground 工具    | wiki-page-read + augmentor 透明接入 rag-search                                     |

## 后续待办（未在本轮落地）

- W4 完整 cross-link 遍历演示（agent 沿 outboundLinks 走 N 层）需要 playground agent prompt 微调
- index 页国际化（目前 body 硬中文标签）— 取 KB enabledLocales[0] 动态决定
- destroyWikiData 操作记录到 admin audit log（目前只 logger.warn）

相关 feedback：

- [[feedback-no-lying-assertion]]（防御性 typing）
- [[feedback-destructive-op-must-have-rollback]]（W5 单 tx + 后 log）
- [[feedback-prettier-after-write]]（W1-W5 每写完都 prettier）
- [[feedback-multi-session-must-use-pathspec-commit]]（5 个 PR 全用 pathspec）
- [[feedback-commit-msg-line-length-100]] + [[feedback-commit-msg-type-must-be-legal]]（W3 第一次 push 被 commitlint 拒，subject 改全小写）
