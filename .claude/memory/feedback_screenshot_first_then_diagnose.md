---
name: default
description: '用户报 "极简模式"，差点改 SINGLE→MULTI default + 数据迁移；截图实际显示 26 creates + 4 updates + 红色 "Request timeout after 30000ms" 真因是 frontend 30s 超时'
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4e446204-770c-40a6-9bed-d44036f6c4fc
---

用户说 "现在又完全变回了极简模式 搞什么东西"，第一反应去读源码推理出 SINGLE pass outputLength=long 没改，准备改 Prisma schema default + 写数据迁移（任务 #93-97 全开了）—— **错的**。

用户随后发的 Screenshot_12 直接给出真信号：

- modal 标题 "Wiki 提议审阅" PENDING
- **26 creates + 4 updates** —— 数据极其丰富，根本不是"极简"
- slug 是英文（`ai-agent-security-threat-landscape` 等）—— P1 拼音消除生效
- body 区域中文正文 + 引用 —— P2 数据密度生效
- **顶部红色横条 `Request timeout after 30000ms`** —— 这是真因，frontend `apiClient.patch` 默认 30s timeout，wiki diff apply (N=30+ page transaction + lint) 容易超

**Why**: P1/P2/P0-A/P0-B 修复全都正确部署生效，但前端 30s 超时让用户体感"失败 / 极简"，掩盖了后端真实成功的 diff。我若按推理走 SINGLE→MULTI default + 数据迁移路径，会动 schema + 写迁移 + 改默认值 —— 全是无效改动，可能引入新风险，并且**没解真问题**。

**How to apply**:

- 用户发截图时，**先读截图所有可见 UI 元素**，不要只看用户主诉那一句话
- 红色 toast / banner / 错误条 = 高优先级信号，永远第一时间看
- 截图里的数字（item 计数 / 时间戳 / 进度）是 ground truth，比"用户说"更可靠
- 用户主诉 = 主观体感（"极简"），截图 = 客观状态（26+4）—— 体感和状态冲突时必查中间层（HTTP / UI 渲染 / 状态机）
- 在改 schema default + 写数据迁移之类**写入血路**改动前，必须有真实日志 / 截图 / 复现 链路证据，单纯"代码读起来好像没改 X" 不足以触发
- 凡是要"改默认值 + 数据迁移老 row"之类的批量改造，先问一遍"用户实际看到的失败信号是什么"，比对一致再下手
- 这次正确路径是 5 行 frontend timeout patch（wikiApi.patchDiff/getDiff 加 `{ timeout: 300_000 }`），不是 schema migration
