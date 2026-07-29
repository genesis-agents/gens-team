---
name: project-l3-w1-policy-config-progress
description: L3 W0+W1 已全量合入 main（PR #399/#401，2026-07-03）：policy_configs 表 + 9 模块 dual-read + canonical prompt 契约 + 深度检视修复。剩部署侧人工灰度闸 + 2 拍板项
metadata:
  node_type: memory
  type: project
  originSessionId: 678cc4ce-bcd1-417e-91a7-f8f631e6b1c5
---

【终态 2026-07-03】W0（PR #399）+ W1（PR #401，原 #400 因 base 删除被关闭后重开）已合入 main（merge 8d3b96395）。深度检视 7 维度 39 agent 对抗验证，4 实锤全修（activate 并发 partial unique index / quota 真因回归锁 mapProviderFailure 18 用例 / strategy overlay 静默刷新守卫 / conformsToShape+200K 上限）。gh 凭据坑：浏览器账号 genesis-agents 与会话 gh 活跃账号不一致时 refresh 必失败；genesis-agents 已入会话 keyring 带 workflow scope。以下为过程记录——L3 路线图 W1（策略数据化）2026-07-02 开工，分支 `feat/l3-w1-policy-config`（基于未合并的 `feat/l3-w0-foundation` 之上）。

**已完成**：

- 批 1（`df69f2932`）：`policy_configs` 表（append-only 版本化 + who/when/why 审计）+ `PolicyConfigService`（L1 platform，resolve dual-read / propose / activate / rollback），设计稿 `docs/architecture/policy-config-design.md`
- 批 2a（`5c7e92057`）：writing 质量门三组阈值接 dual-read，key `writing.threshold.*`，快照等同 spec
- 批 2b（提交进行中）：insight 4 个核心 prompt 接 dual-read（key `insight.prompt.*`）+ 13 套件 DI mock 修复，insight 175 套件 5452 测试全绿。**用户纠偏**：insight 自 2026-06-12 IA 重构菜单已摘（「AI 洞察」指 agent-playground），用户拍板"收尾 insight 即转 playground"
- 批 2c（代码完成待提交）：playground 策略阈值（minFindings/chapterTolerance）——validateBusinessRules 是同步 finalize 校验不能 await，方案 = runMission 起点刷新模块级 overlay 快照（@Optional 注入 PolicyConfigService），同步消费方读快照；**策略 vs 安全网原则**：liveness/墙钟/token cap 永不数据化（系统不能改自己的保险丝）。playground 132 套件 3534 测试全绿
- W0 观察项 flaky settings spec 已修（`d57a572d5`，mock nodemailer）

**已提交全链**（feat/l3-w1-policy-config）：批1 `df69f2932` 表+service → 批2a `5c7e92057` writing → 批2b `3e1c228d9` insight prompts → 批2c `eb7284cb1` playground overlay 快照 → 批3a `8b14ab718` 六模块 → 批3b `37dee663c` canonical prompt 契约（SKILL.md 载体 + loadSkillFromString + applyMissionPolicyOverlay 只覆盖 systemPrompt 保险丝 + harness configOverride + deep-insight 接同 key、leader 缓接）→ `bd9352e2f` backfill 脚本（propose 不激活，--by 必填）。共 9 模块 dual-read + canonical 契约。**W1 代码线完成**。

**批3b 关键设计事实**：efficacy 实测仅 leader 是 live（plan/assess/signoff 三 primitive 消费 systemPrompt），7 角色 soul-inert（编码统一+二期铺路）；SKILL.md 双副本 7 identical + leader DIFFERS（开放点待拍板，spec it.skip 留闸）；W3 提议器 v1 只许写 PLAYGROUND_POLICY_SURFACE 的 live 条目。

**待办**：

- **推送阻塞（唯一需用户）**：git 凭据已切 gh 路由（`gh auth setup-git` 已做），但 gh token 实测 scope 仍无 workflow——用户两次说刷了但 `X-Oauth-Scopes` 不变，疑似 device-code 浏览器步骤没完成或授权了别的账号（当前 gh 账号 JUNJIE-DUAN）。验证法：`gh auth status` scopes 含 workflow 才算成
- 批 3b：canonical 契约设计 workflow（3 方案→3 评审→合成）跑完后写终稿 + 实现
- 大提交注意：pre-commit lint-staged 对 backend ts 跑 `jest --runInBand --bail` 关联 spec，insight/六模块级别的提交要后台跑 >10min，别 5min 超时杀（杀了会留 lint-staged stash）

**关键摸底结论（勿重查）**：playground↔insight 不是字节级复制，是同一"深度研究报告"产品两代实现把同一套策略用两套不兼容机制各编码一遍（SKILL.md+DAG vs TS模板+TeamConfig）；不能 diff 合并，先统一契约。阈值→prompt→拓扑（只抽数据面，DAG 执行语义 ctxReads/ctxWrites 留代码）。NARRATIVE_CRAFT 是 0 消费方死配置未迁。开放拍板点见设计稿 §八（TOPOLOGY 形状 / Redis 热切换 / analyst 角色分叉）。

相关：[[project-l3-autonomy-roadmap]]
