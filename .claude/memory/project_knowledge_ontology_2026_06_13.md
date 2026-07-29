---
name: project_knowledge_ontology_2026_06_13
description: 知识本体(Knowledge Ontology)落地——用户授权全程自驱 v1→v1.1→v1.2，权威方案 + 清理安全红线
metadata:
  node_type: memory
  type: project
  originSessionId: ae4b57ac-c594-40dd-8f92-ee9699061150
---

新建 Library「知识本体」tab，彻底重构清理旧 knowledge-graph。把散在六处的知识（Foresight 卡/library 图/entity-memory/Wiki/mission JSONB/抽取结果）焊成带稳定身份 + 一等公民 Link + Action 治理 + 技能构建 + Agent 团队共享的本体脊柱。

**用户授权：后续全面自驱**（2026-06-13 原话「后续全面自驱」）。从 v1 到 v1.2 收尾自主推进，不逐步征求确认；含 v1.2 删除，但严格按 design.md §0.5 安全清单 + 逐文件 git diff 审查，禁用 `git checkout -- .`/`git restore .`/`rm -rf` 等全局命令。

**权威文档**：`docs/architecture/knowledge-ontology/design.md`，**§0.5 是六路评审后的 v2 修订决议**（与下文冲突以 §0.5 为准）。配套可视化 demo 3 个在 `docs/demos/knowledge-ontology-{explorer,demo,impact}.html`。

**3-workflow 拆分**（评审共识收敛，原 v1 范围过大）：

- v1（已启动 workflow `wf_baa55361-b05`）= 纯后端复利闭环：3 表(OntologyObject/Link/Edit，uuid 主键、**无 ownerId/visibility** 只留 createdBy、无 embedding、无元模型表) → OntologyService(engine，auditContext 参数无当前用户态) → 2 个 Action 工具(upsertObject/addLink，**砍 mergeObjects/HITL**) → OntologyBuilderSkill(自带结构化 NER，extractFacts 只是通用 fact 抽取不够用) → research 团队接入。接缝=既有 `MissionContextPackage`(entities/establishedFacts/glossary)：加载在 team-mission.service persist 点用 `mergeContextPackages` 合并(非覆盖)、回写在 mission 完成时一次(非按任务，防重摄入循环)。验证=两段式集成测(mission A 写→B 读出)。
- v1.1 = 前端 tab：先补 read API，复用 WikiReaderPane 的 grid+SideDrawer 模式，`entityToken` 追加进 `lib/design/tokens.ts`——**不新建 MasterDetailLayout canonical、不新建独立 token 文件**(评审驳回，YAGNI)。
- v1.2 = 旧图谱清理（最后，独立 workflow）。

**清理安全红线（评审 BLOCKER，带 grep 证据）——v1.2 必读**：

1. `ai-app/library/knowledge-graph/` **禁整目录删**：内含 live 的 `knowledge-admin.{controller,service}.ts`(服务 `/admin/knowledge/*` 控制台)，须先剥离 re-home + 重新注册。
2. `ai-engine/tools/.../knowledge-graph.tool.ts` 是 `memory-coordinator` Layer 4 **活代码**(非死代码)，删前须先用 ontology 查询工具替换。
3. `common/graph/graph.service.ts` 真实保护方是 `library/recommendations/recommendations.service.postgres.ts`，**不是** foresight/playground/company(它们不 import 它)——别信旧说法误删。
4. `getUserGraphOverview` 与 `getGraphOverview` **成对**处理(后者内部调前者)。
5. `KnowledgeGraphView.tsx` 被 agent-playground `MissionGraphTab` 在用，**保留**(本体复用它，但其 19 处硬编码 hex 要提取进 entityToken)。
6. 补漏：`KnowledgeGraphLinker.tsx`、`next.config.js` 的 `/knowledge-graph` rewrite。

**完成收尾协议（用户授权）**：两条并行线（v1 workflow `wf_baa55361-b05` 主 worktree + 独立清理 agent `a093cf818bd0b6ead` 在隔离 worktree）都完成后 → **最高标准代码检视**（多路对抗式 review：正确性/安全/架构合规/CLAUDE.md 反向洞察 10 条/测试）→ 修到**全部门禁绿**（type-check / verify:arch / verify:full / audit:ui-discipline 不涨基线 / 集成测）→ **直接提交推送到远程主干 main**（用户两次明确「推送到远程主干」，覆盖默认的先开分支规则）。安全前提：只在全绿后推（pre-push hook 会跑 verify:arch 兜底，绝不推红码上主干）。授权含 push。

并行执行顺序：①清理线回→审 diff+验证→merge ②v1 回→审+修到 type-check/verify:arch 绿+集成测证复利 ③v1.1 前端 tab（基于 v1 真实 API，改 library/page.tsx 加本体 tab，与清理线的 graph-tab 移除有同文件冲突，必须 merge 清理后再上）④v1.2 剩余（admin 控制台剥离 + memory Layer4 tool 替换，亲审）。

**v1 已上线主干（2026-06-13，commits 57791976e/ef269a29f/51ede0896/ed1a99d64）**：过全部 10 道 pre-push 门禁。收尾踩的坑：commitlint body≤100 字符；god-class 守卫（team-mission >2500 行净增>50 拒推→抽 ontology-mission-bridge.ts）；能力索引漂移（facade 新增须 `npm run capabilities:update`）；工具分类守护（新工具须登记 `frontend/lib/features/admin/tool-categories.ts`）。

**激活状态（回答"默认接入还是要配置"）**：无 feature flag，代码默认接入；但要真正跑起来需 (1) **应用 DB 迁移**（本地 `npx prisma migrate deploy` 或跑 ontology 迁移 SQL；Railway 部署 migrate deploy + 重启）——否则写入被 fire-and-forget catch 成非致命 warn，不崩但不落库；(2) 既有 LLM 配置即可（走 AiChatService+TaskProfile，无新 key）。**仅 research 团队**接入（只它的 config 加了工具/技能）；**仅 mission 有 topicId 时**触发；**v1 纯后端无 UI**（只能 DB 看三表，tab 是 v1.1）。集成测是 in-memory mock 证逻辑，首次真 DB 验证要等真实 research mission 跑。**无 kill-switch**，若要在 prod 自动回写前加 env 开关是快速项。

**用户最终目标（2026-06-13 升级）：所有功能 100% 完整覆盖、全程 workflow、全程自驱。** 不止 v1.1/v1.2 最小闭环，而是把 3 个 demo 描绘的完整可操作本体全做出来。落地教训：v1 启动崩溃（OntologyBuilderSkill DI 解析 AiChatService 失败，循环初始化）已 hotfix（23327340c，forwardRef+@Optional）——**集成测用直接 new 不走 NestJS DI，type-check/verify:arch 不验 DI 图，所以每个动模块接线的 workflow 收尾必须跑 AppModule DI 编译 smoke 测试**（Test.createTestingModule({imports:[AppModule]}).compile()）。

**完整覆盖 workflow 路线（每个 workflow 自驱：实现→多路评审→DI smoke+全门禁→推主干；串行避免 app.module.ts 等共享文件冲突）：**

- 进行中 wbwlfxcaa：v1.1 读API + 前端tab(浏览/表格/详情) + v1.2 清理(admin剥离/删kg业务/memory换OntologyService/tool下线)。
- W-A 元模型：OntologyObjectType/LinkType 表 + 元模型管理 + typeKey 按声明类型校验（替代 skill 里硬编码 allowlist）+ 前端「元模型 Schema」视图。
- W-B Action 完整化：mergeObjects(destructive，**需实装 HITL 闸门**——tool-invoker 现仅 access-matrix 无审批实现)/setConfidence/editProperty/dispatchAgent + 前端 Action 面板按钮接线。
- W-C 全团队接入：把本体加载+回写从 research-only 扩到 debate/insight/planning/writing 团队。
- W-D 前端完整化：图谱视图(复用 KnowledgeGraphView + entityToken)/统一 Edit 流·审计 UI/Agent 在本体上行动视图（覆盖工作台 demo 四视图）。
- 明确不强做（如实告知用户，非偷懒）：pgvector 原生向量检索（Railway 不支持，infra 阻塞）；模拟/影响传播 L3（design §1.3 范围外，需产品验证）。

**进度（2026-06-13 连续推进）**：v1(07.. 23327340c hotfix)、v1.1(读API+前端tab)、v1.2(admin剥离KnowledgeAdminModule/删kg业务/memory换@Optional OntologyService/tool下线) 全部上线主干(07d9ea1a5)。**W-A/B/C/D workflow wwnaw5nx8 进行中**（后端链元模型→Action工具→全团队 ∥ 前端 元模型视图+Action面板+图谱(复用KnowledgeGraphView)+Edit流；HITL+pgvector 延后）。

**血泪教训（务必延续）**：

1. **DI boot 本地测不了**：jest 编译整 AppModule 撞 ESM-only node_modules（"Cannot use import outside module"），Windows 本地 build prisma dll 不稳。所以动模块接线（app.module/新模块/跨层注入）的 workflow **只能靠 DI 结构分析 + Railway 部署验证**。安全模式：新跨模块注入一律 @Optional 或确认 @Global 可解析、无硬循环。v1 崩就是 OntologyBuilderSkill 硬注入 AiChatService 未满足。
2. **workflow 产出必逐文件审，常有遗漏**：v1.1/v1.2 workflow 留下孤儿——P3 新建 open-api admin 副本却没删旧 library/knowledge-graph/knowledge-admin.\*（P4 误判仍在用），主 agent review 时靠 git status 抓出并删。同类：律2b 文件名 -admin 后缀、R2 自写卡片。**主 agent 收尾必须：git status 查孤儿/重复 + 跑 verify:arch + audit:ui + 集成测 + DI 分析，再推**。
3. 收尾门禁全套：backend/frontend type-check、verify:arch、集成测、audit:ui-discipline(硬零)、capabilities:update、audit:tool-categories。commitlint body≤100 字符。

**W-A/B/C/D 已上线主干(ff550201d)**：元模型表/全套Action工具(merge加AdminGuard)/全5团队接入(research/debate/insight/planning/writing)/前端4视图(对象·元模型·图谱·Edit流)。

**W-E 进行中(w4is1m38x) + 关键 token-安全决策（用户拍板）**：自动回写本体**默认必须关**（否则每个 mission 完成跑一次 LLM 抽取=烧 token）。开关设计=**议题级开关 OntologyTopicSetting.autoIngest(默认false) + 全局 env 总闸 ENABLE_ONTOLOGY_AUTO_INGEST==="1"(默认关)**，双开才自动回写；**现有无条件自动回写必须收编到此双开关后**（这是隐患修复）。**手工回填**(既有历史报告→本体)不受开关限、按需触发：ai-app 回填服务读报告正文(TopicReport.fullReport+fullReportUri off-load / TeamMission.finalResult / KnowledgeBaseDocument.rawContent，经 report-data.service / StorageOffloadService)→ 以 text 传 engine OntologyBuilderSkill(skill 维持只吃 text，不反向依赖 app)。端点 POST /ontology/backfill + /topics/:id/auto-ingest。

**「既有报告怎么形成本体」答案**：新 mission 完成=自动回写(需双开关开)；历史报告=手工回填(W-E 新建)。skill 的 reportId/documentId 入参原是占位(只 audit 用)，正文读取在 ai-app 回填层做。

**⏸️ 待推送（2026-06-14）**：本地已提交 `fb77ed5cd`（修两个 bug：①导入图谱丢边——OntologyBuilderSkill 关系端点 label 与实体 label 不一致致 link 全跳过，修=关系 label 纳入 entity-resolution 输入 + labelToNodeId 多键注册 + 多路解析；②foresight intake 加 skipGuardrails 解护栏误杀报告语料），**只含我的 2 文件**。**推送被另一个 Agent 的半成品 `chat.facade.ts` 阻塞**（它把 extractJson 抽到 facade-text.utils 但 line918 仍调 this.extractJson + import 未用 → 整树 type-check 失败）。**不碰他们的文件**。用户说"等另一个 Agent 完成会通知"——收到通知后：先确认整树 type-check 绿（他们修好），再 push fb77ed5cd（注意 jest changedSince flaky，重试即过）。

**待修 bug（并进 W-E 收尾，2026-06-13 用户报）**：前端「图谱」tab 调 GET /ontology/subgraph 不带 topicId（全局浏览无议题）→ 后端 400 "topicId is required"（v1.1 把 topicId 设必填）。修法：subgraph 端点 topicId 改**可选** + OntologyService.querySubgraphByTopic 支持 null topicId → 返回全局封顶子图（按 maxNodes 取最近/高置信对象+边）。**因 W-E 正在编辑同批 ontology 文件，不可并发改，必须等 W-E 落地后在 collar 阶段一起修**（否则撞车损坏 workflow）。

**W-E 已上线主干(835930b23) + CLAUDE-FABLE-5.md(29c07633d)**：议题级+全局双开关(默认全关,省token)、现有自动回写已收编到双开关后、历史报告手工回填(ai-app 读正文→engine skill text)、subgraph topicId 改可选(修图谱 tab 全局浏览 400)。

**至此本体可操作闭环 ~100% 完成**：build/store/read/browse/全5团队消费/旧图谱清除/元模型/全套Action/前端四视图/token安全开关/历史回填。**仅剩 2 项显式延后(真实原因非偷懒)**：HITL 审批闸门(tool-invoker 核心运行时改动，本地无法 boot 验证，风险最高)；pgvector(Railway infra 阻塞)。**HITL = 用户 2026-06-14 明确拍板"暂不做"——mergeObjects 已 AdminGuard+entitlement 双门控足够，HITL 只是更软增强、非必需。后续 session 不要主动去做 HITL，除非用户重新要求。本体效用闭环视为收官。**

**部署验证提醒**：本轮大量改动(含 v1 hotfix/ app.module 增删/ 新表 3 张 ontology\_\*+ontology_topic_settings/ memory-coordinator 注入)需 Railway `prisma migrate deploy` + 重启;后端能否正常 boot 只能靠部署确认(本地 jest 编译整 AppModule 撞 ESM、Windows build prisma dll 不稳，均测不了 DI 图)。建议用户部署后确认后端起来 + 跑个真实 mission/手工回填验证本体落库。

**flaky 教训**：动了 ontology.service/facade(被全仓 import)后，pre-push 的 `jest --changedSince` 会拉起 ~21k 测试，ts-jest `--no-cache` 大并发下偶发 "worker failed to exit gracefully" → 退码1**假失败**(测试 0 failed)。定位法：跑受影响的具体 spec(team-mission 全套/ontology 集成)确认真绿，再**重试 push**(偶发，重跑即过)。别被海量 ERROR 日志误导——多是 fixture 的预期错误路径。

关联 [[project_foresight_p0_2026_06_12]]（ForesightEdge/置信度账本是本体 Link 的前身视图）。
