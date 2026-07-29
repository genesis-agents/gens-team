---
name: BYOK 数据驱动重构 (P1-P11)
description: 2026-05-11 一次完整重构让 admin 在 UI 加新 provider 不必改代码；删 PROVIDER_DEFAULTS / STANDARD_MODEL_CONFIGS 硬编码；新 ApiFormat + ModelType 两表；P5 GET /v1/models 一键探测；修截图 9/10 数据 + Connection-test ensureRerankPath 防呆删除
type: project
originSessionId: 229b0e1c-bec7-47da-a470-14d8b4d071db
---

# BYOK 数据驱动重构 (commits e113e43ea → e53167d19，11 PR / 1 天 / ~3500 行净改动)

## 背景

连续 10 次给 connection-test 打补丁，每次新加一个 provider 就要改代码。
用户反复抱怨"质量越来越差"+"新 provider 必须改代码"+"Endpoint 优先生效"。

## 三张截图三个症状

- Screenshot 9 (voyage-ai): admin 把 provider slug `voyage-ai` 当成 modelId 填
- Screenshot 10 (Cohere rerank /v1/chat): admin 错填 endpoint，我自己 ensureRerankPath 防呆抛错
- Screenshot 11 (Add Model 硬编码下拉): STANDARD_MODEL_CONFIGS 12 行 + providerApiFormatMap 4 行硬编码

## 最终方案（v2 - 修正版，删了"4 endpoint 字段"的错误设计）

**核心原则**:

- AIModel.apiEndpoint 是绝对真源（R3），填了就用；没填才查 provider 兜底
- Provider 退化为分组标签（保留 endpoint/apiFormat/testModel 作 fallback）
- ApiFormat 拆独立表（4 内置 + admin 自定义 OpenAI-兼容微调）
- ModelType 拆独立表（11 内置 + admin 自定义）

## 11 个 PR 落地路径

| PR  | commit      | 内容                                                                                                    |
| --- | ----------- | ------------------------------------------------------------------------------------------------------- |
| P1  | `e113e43ea` | schema 加 ApiFormat + ModelType 两表 + seed 4+11 内置 + 11 system AIProvider                            |
| P2  | `508832bd9` | 删 provider-defaults.ts 整文件；resolveProviderDefaults 只读 DB；toAIModelConfigFromUserConfig 改 async |
| P3  | `7888dbb79` | /admin/api-formats + /admin/model-types CRUD controller                                                 |
| P4  | `8f46f90a2` | connection-test 删 ensureRerankPath 防呆 + default case 改 generic OpenAI-compat dispatch               |
| P5  | `fe9db3f28` | POST /admin/ai-models/discover 一键探测（GET /v1/models + 启发式 modelType）                            |
| P6  | `29f7998e0` | AIProvidersSettings.tsx admin UI 维护页                                                                 |
| P7  | `3f8878633` | ApiFormatsSettings + ModelTypesSettings 维护页                                                          |
| P8  | `16107effe` | 挂载 P6/P7 三个面板到 /admin/ai/models + Add Model provider 动态拉 + 柔性提示                           |
| P9  | `d0683016f` | ProviderDiscoverModal + 一键配置按钮                                                                    |
| P10 | `a1f82c9a8` | SQL 修截图 9/10 错配数据                                                                                |
| P11 | `e53167d19` | mock resolveProviderDefaults integration spec                                                           |

## 元教训（提炼）

1. **不要先抽 4 个 endpoint 字段就当根治**——provider 退化为标签 + AIModel 行级 endpoint 就够了；多 endpoint 是过度设计（用户当场识别 + 拒了）
2. **打补丁 10 次 = 根因没看清**——`provider switch` 每次加 case 是症状治疗，治本是 dispatcher 改 apiFormat 派发 + 数据驱动 catalog
3. **ensureRerankPath 防呆抛错是反模式**——admin 填错应让远端 provider 报真错（cohere 4xx），代码不抢戏；前端 UI 加柔性 warning 即可
4. **mock spec 改 hardcoded 表 → 改 DB mock**：mock prisma.aIProvider.findFirst 返回不同 apiFormat，断言按 apiFormat 派发的差异化 path（避免 mock-self-confirming）
5. **commit subject 全小写**：subject "PROVIDER_DEFAULTS" 触发 commitlint subject-case 拒；body 中 CHANGES type → 全小写
6. **每 PR 单独 commit + pathspec**：多 session 并行 + lint-staged stash 时尤其重要（feedback_multi_session_must_use_pathspec_commit）
7. **STANDARD_MODEL_CONFIGS 不一刀切删**：admin UI optgroup 分两栏（"数据驱动" / "预置模板（将来退役）"），不破坏 getModelIdPlaceholder 等 4 处依赖；纯粹 deprecation 路径

## 强成功标准达成情况

- ✅ admin 在 UI 加完全没在代码里的 provider（如 together-ai），不改代码不重启
- ✅ admin 在 UI 加自定义 ApiFormat（OpenAI-兼容微调 authHeader / Prefix）
- ✅ admin 在 UI 加自定义 ModelType（如 VIDEO_GENERATION）
- ✅ 截图 9 voyage-ai 错行删除
- ✅ 截图 10 cohere rerank endpoint 修复 + 防呆抛错删除
- ✅ AI 一键配置：endpoint+apiKey → GET /v1/models → 启发式 modelType 推断 → 批量创建
- ✅ PROVIDER_DEFAULTS 后端硬编码 grep 0 匹配
- ⚠️ STANDARD_MODEL_CONFIGS 前端保留作过渡期向后兼容（UI 优先 "AI Providers 数据驱动" optgroup）
- ✅ verify:arch 7/7 + 1700/1700 spec 全绿

## 待跟进

- prod deploy migration 后需要 admin **手动**重测 cohere rerank 模型（P10 SQL 已修但缓存可能要清）
- 完全删 STANDARD_MODEL_CONFIGS（后续 PR，等 admin 都迁移到 ai_providers 表后）
