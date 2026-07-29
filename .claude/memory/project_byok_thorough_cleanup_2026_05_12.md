---
name: project_byok_thorough_cleanup_2026_05_12
description: 2026-05-12 BYOK 三原则彻底清理 Phase 1+2（6 PR 顺序提交）—— LLM 三大入口归一 + AIModel.apiKey 业务消费方清零 + Secret 删除级联 + STALE→ACTIVE 反向恢复 + chat 主路径合规事实化
metadata:
  node_type: memory
  type: project
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

# 背景

用户提出三条秘钥管理原则：

1. 用户 API KEY 必须 BYOK
2. 用户向系统申请 KEY 经 admin 审批后这部分配额也归属 BYOK
3. 系统管理员秘钥管理用于池化 + 向用户授权，**真正的消费都在 BYOK**

用户明确：**工具层（Tavily / SerpApi / 等第三方 API KEY）显式保持 admin 池化**（用户配置体验代价过大），不纳入 BYOK。原则 3 仅适用 LLM 层（详见 [[feedback_tool_layer_admin_pool_explicit]]）。

# 6 PR 落地清单

| PR   | commit      | 主体                                                                                                                                                                                                                        |
| ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR-1 | `57d757ead` | teams FunctionCallingLLMAdapter 接入 KeyResolver；删 model.apiKey 直读 + 环境变量 fallback；setConfig 加 userId；AiResponseService 透传 senderId                                                                            |
| PR-2 | `ed535948d` | ImageGenerationService.getApiKeyForModel 加 userId 参数走 KeyResolver；GenerationService 透传 options.userId 到 2 处 callImageGenerationAPI                                                                                 |
| PR-3 | `50efb03c6` | docs only：chat 主路径已是 BYOK-first（findUserDefaultByType + availableProviders + keyResolver.resolveKey），加 12 行注释文档化等价关系；纠正 [[feedback_unified_byok_single_function]] 中 P2 审视报告对 chat 主路径的误判 |
| PR-4 | `519b84c9e` | KeyAssignmentsService.resolveModelApiKey + ImageGenerationService.getApiKeyForModel 删 model.apiKey 明文回读；保留 admin tools 路径（admin.service / quota.service / ai-core listGoogleModels）                             |
| PR-5 | `4cdffdd3a` | SecretsService.getReferences 扩到 ToolConfig.secretKey + MCPServerConfig.secretKey 精确匹配；AIModel.secretKey 精确 + apiKey contains（legacy）                                                                             |
| PR-6 | `20172749e` | KeyAssignmentsService.reactivateStale(modelDbId)；AdminService.updateAIModel isEnabled false→true 触发反向恢复 STALE→ACTIVE；admin.module 注入 KeyAssignmentsModule                                                         |

合计：**11 文件改动 + 4 spec 文件适配 + 6 commits + 0 regression**。

# 关键决策

1. **AIModel.apiKey 明文列**保留 schema 不删，仅业务消费方下移
   - admin tools（admin.service:895 / quota.service:266 / ai-core:301）仍读—— admin 自己输入测试用合理
   - 业务路径（image-gen / key-assignments / teams FC）全 delete fallback
2. **chat 主路径不强制 refactor 到 pickBYOKModelForUser**
   - 实质等价（findUserDefaultByType + availableProviders 已是 BYOK-first），仅命名差异
   - god class >2700 行 refactor 风险大于命名一致性收益
   - 文档化为合规事实
3. **STALE→ACTIVE 反向恢复走 admin 显式触发**（不放 cron）
   - admin disable 是有意操作，cron 自动反向恢复会误抹 admin 意图
   - admin updateAIModel hook 触发更精确
4. **工具层显式排除 BYOK**（用户拍板）
   - 实施前一度计划 PR-8 工具层 BYOK 化（5-7 PR 跨 schema），用户中途明确"工具配置过于复杂，先把非工具的范围圈全"
   - 见 [[feedback_tool_layer_admin_pool_explicit]]

# 工程教训

1. **lint-staged stash/pop + 多 session 并发会吃掉 in-progress 编辑**（PR-4 重做一次）
   - 解决：完成一组 Edit 立刻 commit，不留 in-progress 状态过夜
   - 也加深了 [[feedback_lint_staged_stash_safety]] 与 [[feedback_multi_session_must_use_pathspec_commit]] 的应用场景
2. **删除 fallback 的 spec 改造工作量 ≈ 主代码改动 2-3x**
   - PR-4 spec 改造比 service.ts 改动大得多（25+ 个 fixture）
   - 教训：估算 PR 工作量必须算 spec 适配
3. **新增 service 依赖必须同时更新所有 instantiate 该 service 的 spec**
   - PR-6 AdminService 新依赖 KeyAssignmentsService → 4 个 spec 文件需 mock，否则 367 个测试失败（DI 解析失败级联）
4. **mockResolvedValueOnce 队列不被 jest.clearAllMocks 清**
   - 一个 test 内 mockResolvedValueOnce(null) → 下一个 test 仍会拿到 null
   - 教训：测试间影响的 mock 残留要用 mockReset 或 mockResolvedValue（不带 Once）

# 验证状态

- **合规度提升**：从原 5.9/10（[[project_secret_audit_three_principles_2026_05_12]]） → ~8.5/10（LLM 层全合规，工具层显式排除）
- **测试覆盖**：6 PR 共 2456+ spec 全绿，无 regression
- **未做项**：
  - 工具层 BYOK 化（用户拍板不做）
  - chat 主路径形式上 refactor 到 pickBYOKModelForUser（god class 风险，文档化代替）
  - Secret/SecretKey 双源（schema 注释 "P3 之后下线"）—— 不在本次 phase 范围

# How to apply

- 用户问"秘钥彻底清理做了什么" → 回 6 PR 清单 + 关键决策
- 接到 BYOK 相关 PR → 必查"是否走 KeyResolver / 不读 model.apiKey 明文"
- 接到 Secret 删除相关 bug → getReferences 已扩 3 表，但 schema 新增 secretKey 字段时必须同步扩
- 接到 admin disable/enable 模型相关 bug → STALE 流转走 cron + reactivateStale，不是单点
- 工具层相关需求 → 显式不纳入 BYOK，admin 池化继续；如要纳入需重新立项（schema 改动）

# 友邻

- [[project_secret_audit_three_principles_2026_05_12]] —— 本次 phase 的起点审视
- [[feedback_unified_byok_single_function]] —— 单函数原则（chat 主路径已纠正认定）
- [[feedback_tool_layer_admin_pool_explicit]] —— 工具层显式不 BYOK
- [[project_byok_user_centric_2026_05_08]] / [[project_drop_distributable_keys_2026_05_08]] —— 上游 BYOK 模型粒度授权 + DistributableKey 单源
