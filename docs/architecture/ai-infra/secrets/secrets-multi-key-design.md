# 系统密钥管理：多 KEY 配置方案

> **状态**：设计阶段（v0.3 - 2026-05-06）—— 等用户决策后实施。
> **目标**：admin/access/secrets **和** 用户 BYOK **共享同一种展示方式**支持"一个 secret/provider 名 → N 个 KEY"表格管理（增/换/删 + 状态有效性）。
>
> **v0.3 调整**（用户反馈 + Screenshot_21 / Screenshot_22）：列表页保留现样（NAME/CATEGORY/VALUE/STATUS/ACCESS COUNT/ACTIONS），**点 edit 图标后**弹出/展开**多 KEY 表格**（每行 1 个 KEY，含 hint/priority/status/操作）。BYOK `/me/ai?tab=keys` UI 完全复用同一组件。

---

## 目录

- [一、当前现状（事实层）](#一当前现状事实层)
  - [1. 三套独立的 key 存储机制](#1-三套独立的key-存储机制)
  - [2. 已存在的有效性状态](#2-已存在的有效性状态)
  - [3. 截图反映的 admin UI 现状](#3-截图反映的-admin-ui-现状)
  - [4. BYOK 用户侧 UI 现状](#4-byok-用户侧-ui-现状)
- [二、用户需求转译](#二用户需求转译)
- [三、关键多义性 — 等用户决策](#三关键多义性--等用户决策6-题)
- [四、推荐方案](#四推荐方案基于-bdbaa-默认假设待用户确认)
  - [4.1 数据模型变更](#41-数据模型变更)
  - [4.2 迁移脚本](#42-迁移脚本手写-sql)
  - [4.3 API 变更](#43-api-变更)
  - [4.4 业务侧（resolver 层）](#44-业务侧resolver-层)
  - [4.5 UI 变更](#45-ui-变更)
    - [4.5.0 TAB 划分](#450-tab-划分最高层级)
    - [4.5.0 b 不在新 UI 内的内容](#450-b-不在新-ui-内的内容)
    - [4.5.1 列表页（KEY 管理 tab 主体）](#451-列表页admin-accesssecrets-与-meaitabkeys保留现样)
    - [4.5.2 点 edit 后：多 KEY 表格抽屉](#452-点-edit-后多-key-表格抽屉核心改动)
    - [4.5.3 状态徽章](#453-状态徽章与-userapikey-对齐)
    - [4.5.4 共享组件 `<MultiKeyTable>`](#454-共享组件-multikeytable)
  - [4.6 Phase 拆分](#46-phase-拆分v02-修订)
- [五、风险与边界](#五风险与边界)
- [六、不在本方案范围 / 本方案明确做的](#六不在本方案范围)
- [七、待用户决策清单](#七待用户决策清单实施前必答)
- [八、关联](#八关联)
- [修订历史](#修订历史)

---

---

## 一、当前现状（事实层）

### 1. 三套独立的"key 存储"机制

```
┌──────────────────────────────────────────────────────────────────┐
│ admin/access/secrets — 系统级 secret（截图位置）                  │
│   表：Secret + SecretVersion                                      │
│   语义：1 secret name = 1 active KEY + N 历史版本（rotation）    │
│   用途：外部 API key（Tavily / Serper / Firecrawl / 系统兜底等）│
│   数量：当前 ~12 条（截图列表）                                  │
├──────────────────────────────────────────────────────────────────┤
│ admin/access/distributable-keys — LLM provider key 池            │
│   表：DistributableKey + KeyAssignment                            │
│   语义：1 provider 可有 N 个 DistributableKey 行 + 池级 quota   │
│   用途：管理员采购的 LLM key 分配给用户使用                      │
│   多 KEY：✅ 天然支持（每行 1 KEY）                              │
├──────────────────────────────────────────────────────────────────┤
│ 用户 BYOK — UserApiKey                                           │
│   表：UserApiKey                                                  │
│   约束：@@unique([userId, provider, label])                       │
│   语义：1 user + 1 provider 可有 N 条（用 label 区分）           │
│   用途：用户自带 LLM key + KeyChain 健康调度                     │
│   多 KEY：✅ schema 已支持 + keyResolver KeyChain 已落（PR-2）   │
└──────────────────────────────────────────────────────────────────┘
```

### 2. 已存在的有效性状态

| 表                 | 状态字段                                            | 来源                         |
| ------------------ | --------------------------------------------------- | ---------------------------- |
| `UserApiKey`       | `lastTestedAt` / `testStatus` ('success'\|'failed') | 用户主动 test + 业务调用回写 |
| `DistributableKey` | KeyHealthStore 命名空间健康监控                     | KeyChain 调用回写            |
| `Secret`           | 无显式状态字段                                      | 业务调用失败感知不到         |

### 3. 截图反映的 admin UI 现状

- **入口**：`/admin/access/secrets`（Screenshot_20 / Screenshot_21）
- **列表**（用户喜欢，**保留**）：表头 NAME / CATEGORY / VALUE / STATUS / ACCESS COUNT / ACTIONS；每行 1 个 secret + masked value（带 eye 按钮显示）+ 绿色 Active 徽章 + ACCESS COUNT 数字 + 4 操作图标（rotate / history / edit / delete）
- **编辑**（用户**不**喜欢，需改）：当前是 Modal 弹窗，一次只能修改 1 个 KEY；rotation 显示当前 + 上一版本指纹
- **缺失**：
  - 一个 secret name 下不能配多 KEY 并存
  - STATUS 列只是"是否启用"，没有"有效性"语义（连接是否成功）
  - 不能单独 add/replace/delete 多个 KEY 中的某一个

### 4. BYOK 用户侧 UI 现状

- **入口**：`/me/ai?tab=keys`（`UserApiKeysTab` 组件）
- **schema**：`UserApiKey` 表 `@@unique([userId, provider, label])` + KeyChain 健康调度（PR-2 2026-05-05 落地）
- **UI 现状**：默认只显示 `label="default"` 那一条；用户其实可以创建多条不同 label，但 UI **几乎不暴露这个能力**（用户原话："BYOK 的多 KEY 展示一样有问题"）
- **必须改造**：
  - 让 `/me/ai?tab=keys` 与 `/admin/access/secrets` **视觉与行为完全一致**（用户原话："和管理员一样的展示方式"）
  - 同样的列表结构（每个 provider 一行，masked value + status + access count）
  - 点 edit → 同样的多 KEY 表格

---

## 二、用户需求转译

> **原话**：每一个秘钥名称都可以支持多 KEY 的配置；点击展开式表格；状态列；单独增/换/删；先 admin 后 BYOK。

转译为 5 个核心需求：

1. **多 KEY 并存**：一个 secret name 下 N 条 KEY 记录（不是 rotation 历史）
2. **行级管理**：表格每行 1 个 KEY，独立 CRUD
3. **状态列**：每行显示"是否有效"
4. **inline 展开**：点击 secret 名称展开（不弹 Modal）
5. **Phase**：先 admin/access/secrets，再用户 BYOK UI

---

## 三、关键多义性 — 等用户决策（6 题）

> **决策每题影响 schema / API / UI 设计，必须先答**。Karpathy "暴露多义性" 原则：选项不替用户选。

### Q1：多 KEY 的"消费策略"是什么？

| 选项                  | 语义                            | 适用场景                          |
| --------------------- | ------------------------------- | --------------------------------- |
| **A. Round-robin**    | 每次调用随机/轮询挑一个         | quota 分摊、降低单 key 限流       |
| **B. Fallback chain** | 首选 → 失败再下一个（顺序）     | 主备 / 主流程兜底                 |
| **C. Active/Standby** | 用户在表格里手动指定哪个 active | 简单可控（其他作为 cold standby） |
| **D. Mixed**          | 都支持，每行配 mode             | 灵活但复杂                        |

**gens.team 现有的**：UserApiKey + KeyChain 是 **B (fallback)** + 健康熔断。建议 admin secrets 与之对齐 → **B**。

### Q2：状态有效性怎么判定？

| 选项                                              | 语义                   | 成本                          |
| ------------------------------------------------- | ---------------------- | ----------------------------- |
| **A. 实时**：每次打开页面同步 ping                | 实时但慢 + 浪费 quota  | 高                            |
| **B. 后台 cron**：每 N 小时跑一次健康检查         | 准实时 + 可控成本      | 中                            |
| **C. 被动回写**：业务调用失败时 mark              | 真流量驱动，无主动浪费 | 0（但首次调用前显示 unknown） |
| **D. 手动 + 被动**：管理员点"测试"按钮 + 业务回写 | 灵活                   | 0                             |

**gens.team 现有的**：UserApiKey 是 **D**（admin/me 页有 Test 按钮 + 业务调用 markSuccess/markFailure）。建议对齐 → **D**。

### Q3：保留 SecretVersion 历史 rotation 概念吗？

| 选项                                                                                                                   | 含义                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **A. 保留 + 并存**：N 个并存 active KEY + 每个 KEY 有自己的 version 历史                                               | schema 复杂；细粒度 |
| **B. 用并存替代 rotation**：rotation 等同"加新 KEY + 老 KEY 标 inactive"，没独立历史表                                 | 简洁；丢失审计明细  |
| **C. 保留 rotation + 新加 sibling key 概念**：1 个 secret name 下 N 个 sibling key，每个 sibling 有自己的 version 历史 | 最完整也最复杂      |

**建议 B**（最少代码）—— SecretVersion 表保留但仅在 inline 替换 KEY 内容时记录；新 KEY 直接是新行。

### Q4：UI 形态：inline 展开还是详情页？

| 选项                                                   | 含义                          |
| ------------------------------------------------------ | ----------------------------- |
| **A. inline accordion**：点击行展开下方嵌入表格        | 列表上下文不丢；适合 < 10 KEY |
| **B. 跳详情页**：`/admin/access/secrets/{name}` 独立页 | 更宽松；适合 > 10 KEY         |
| **C. 双层弹窗**：列表 Modal + 内嵌表格                 | 与现有 Modal 兼容性好         |

**建议 A**（与用户原话"展开式"一致）。

### Q5：要不要顺手把 admin secrets 与 DistributableKey 合并？

- **DistributableKey**：仅 LLM provider，已经支持多 KEY + quota
- **Secret**：所有外部 API key（外部工具用），**不**支持多 KEY、不带 quota
- 合并后：所有 secret 都走 pool 模式，统一管理

| 选项                                                                                          | 含义                   |
| --------------------------------------------------------------------------------------------- | ---------------------- |
| **A. 不合并**：DistributableKey 保留专属 LLM；Secret 独立扩多 KEY                             | 短期简单；长期两套语义 |
| **B. Secret 完全采用 DistributableKey 形态**：废弃 SecretVersion，迁数据到 distributable_keys | 长期统一；迁移工程量大 |
| **C. 概念合并 schema 不动**：在 service 层抽 `IKeyPool` 接口，UI 共享                         | 重构友好；增加抽象     |

**建议 A**（最小 surface）。等需求稳定再考虑 C。

### ~~Q6~~：BYOK 与 admin 必须共享组件 ✅（用户已决策 2026-05-06）

UserApiKey schema 已支持多 KEY（PR-2 注释明写"多 key 支持，label 区分"），缺的只是 UI 暴露。

**用户原话**："关键是 BYOK 的多 KEY 展示一样有问题，应该和管理员一样的展示方式"

**决策**：admin/access/secrets + 用户 /me/byok **共享同一个 React 组件**（`<MultiKeyTable>`），二者**视觉与行为完全一致**：

- 同样 inline accordion 展开
- 同样表格列（label / hint / priority / status / actions）
- 同样按钮（Test / Edit / Replace / Delete / Add）
- 同样状态徽章
- 仅"数据源 + 操作权限"不同（admin 操作所有 secret，user 仅自己的 UserApiKey）

**实施意味着**：

1. `<MultiKeyTable>` 抽成 generic 组件，接受 `keys: KeyRow[]` + `onAdd/onUpdate/onDelete/onTest` callback
2. admin 页和 BYOK 页各自喂自己的 API（admin 用 `/admin/secrets/:id/keys`；BYOK 用 `/me/api-keys/:provider`）
3. P2 同时上线 admin + BYOK（不再串行）

---

## 四、推荐方案（基于 B+D+B+A+A 默认假设，待用户确认）

### 4.1 数据模型变更

**新表 `secret_keys`**（替代 Secret 单一 encryptedValue 字段）：

```prisma
model Secret {
  id          String         @id @default(cuid())
  name        String         @unique @db.VarChar(100)
  displayName String
  category    SecretCategory @default(OTHER)
  description String?        @db.Text
  provider    String?        @db.VarChar(50)
  isActive    Boolean        @default(true)

  // ★ 移除：encryptedValue / iv / keyVersion / lastRotatedAt（迁到 SecretKey）
  // ★ 移除：currentVersion（不再需要）

  // 元数据保留：分类、provider、过期、审计
  expiresAt DateTime?
  // ...

  // 关系：1 secret name → N keys
  keys SecretKey[]

  @@map("secrets")
}

/// ★ 新表：1 secret name 下 N 个 KEY 并存
model SecretKey {
  id             String   @id @default(cuid())
  secretId       String   @map("secret_id")
  label          String   @db.VarChar(100) // "primary" / "backup-1" / "rotated-2026-05" 等
  encryptedValue String   @map("encrypted_value") @db.Text
  iv             String   @db.VarChar(32)
  keyVersion     Int      @default(1) @map("key_version")
  keyHint        String?  @map("key_hint") @db.VarChar(20) // 脱敏 "sk-...3f8a"

  isActive Boolean @default(true) @map("is_active")
  priority Int     @default(0) // fallback 顺序：低数字优先

  // 健康状态（与 UserApiKey 对齐）
  lastTestedAt DateTime? @map("last_tested_at")
  testStatus   String?   @map("test_status") @db.VarChar(20) // 'success' | 'failed' | null

  // 审计
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  createdBy String?  @map("created_by")
  updatedBy String?  @map("updated_by")

  secret Secret @relation(fields: [secretId], references: [id], onDelete: Cascade)

  @@unique([secretId, label])
  @@index([secretId, isActive, priority])
  @@map("secret_keys")
}

// SecretVersion 表：保留但 secret_id 改 secret_key_id（每行 KEY 自己的版本历史）
// SecretAccessLog 同上扩 secret_key_id
```

### 4.2 迁移脚本（手写 SQL）

```sql
-- 1) 建 secret_keys 表
CREATE TABLE secret_keys (...);

-- 2) 把每个 Secret 的 encryptedValue 迁到 secret_keys 的 1 条 'primary' KEY
INSERT INTO secret_keys (id, secret_id, label, encrypted_value, iv, key_version, ...)
SELECT gen_random_uuid(), id, 'primary', encrypted_value, iv, key_version, ...
FROM secrets;

-- 3) 删 secrets.encrypted_value / iv / key_version 列（保留 SecretVersion 历史）
ALTER TABLE secrets DROP COLUMN encrypted_value;
ALTER TABLE secrets DROP COLUMN iv;
-- ...
```

### 4.3 API 变更

**当前**：

```
GET  /admin/secrets               → SecretListItem[]
POST /admin/secrets               → 创建 secret + 内嵌 value
PATCH /admin/secrets/:id          → 更新 secret 含 value
DELETE /admin/secrets/:id         → 软删
GET  /admin/secrets/:id/versions  → 版本历史
```

**改造后**：

```
GET    /admin/secrets                          → SecretListItem[]（不含 keys）
POST   /admin/secrets                          → 创建 secret 元信息（不传 value）
PATCH  /admin/secrets/:id                      → 改元信息（不动 keys）
DELETE /admin/secrets/:id                      → 软删（级联 keys）

# 新增 keys 子资源 ↓
GET    /admin/secrets/:id/keys                 → SecretKey[]（含状态）
POST   /admin/secrets/:id/keys                 → 加新 KEY（label + value + priority）
PATCH  /admin/secrets/:id/keys/:keyId          → 改 KEY label/priority/isActive（不含 value）
PUT    /admin/secrets/:id/keys/:keyId/value    → 替换 value（生成新 SecretVersion）
DELETE /admin/secrets/:id/keys/:keyId          → 删除单个 KEY
POST   /admin/secrets/:id/keys/:keyId/test     → 测试有效性（更新 lastTestedAt + testStatus）
```

### 4.4 业务侧（resolver 层）

```typescript
// 当前：getSecretValue(name) → 1 个 string
// 改造后：
async getSecretKey(name: string): Promise<{ value: string; keyId: string }>
  // 内部：
  //   1. fetch active keys ordered by (priority asc, lastTestedAt fresh first)
  //   2. 跳过 testStatus='failed' 且 lastTestedAt < N 分钟内的（熔断）
  //   3. 返回第一个 → 业务调用方完成调用回写 markSuccess/markFailure
```

业务调用方（SearchService / ExtractionService 等）改一行：

- 旧：`const key = await secrets.getSecretValue('tavily-search-api-key');`
- 新：`const { value, keyId } = await secrets.getSecretKey('tavily-search-api-key');`
  - 调用失败：`secrets.markFailure(keyId, error)`
  - 调用成功：`secrets.markSuccess(keyId)`

### 4.5 UI 变更

> **v0.4 关键调整（用户截图 23/24 反馈）**：当前 `/admin/access/secrets` 把"统计 / 引导卡片 / 分组面板 / KEY 管理列表"全混在一页，杂乱。**拆成多 TAB**，每 TAB 单一职责，不混合。状态视图采用 Screenshot_24 简洁形态（每行 secret + Active 徽章），独立成 TAB。

#### 4.5.0 TAB 划分（最高层级）

`/admin/access/secrets` 顶部加 Tabs，**默认 KEY 管理 tab**：

| TAB                    | 用途                             | 内容                                                                                                                                                                | 操作权限 |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **🔑 KEY 管理**        | 增删改查、配置多 KEY             | 列表（Screenshot_21 表格） + 点 edit 弹多 KEY 抽屉（4.5.2）                                                                                                         | 全权限   |
| **📊 状态总览**        | 一眼看清谁挂了                   | **极简清单**：每行仅 `NAME (slug) + Status 徽章`，**无其他列**（无 category、无 access count、无 value、无操作按钮、无 Apply/Configure、无统计 header、无分组面板） | 只读     |
| _可选_ **📁 分类视图** | 按 category 浏览（如果用户想要） | Screenshot_23 那种按 SEARCH / TTS / IMAGE 分组列表（**但纯展示，不带 Apply/Configure**）                                                                            | 只读     |
| _可选_ **🕒 审计日志** | 谁何时访问了哪个 secret          | `SecretAccessLog` 时间线                                                                                                                                            | 只读     |

**v0.4/v0.5 决策原则**（用户多轮反馈强化）：

- **状态 tab 极简：只显示状态，不要任何其他内容**（v0.5 用户原话："状态只显示状态即可，不要显示其他的内容"）
  - 形态：表格仅 2 列 `NAME` + `STATUS`（或者 `NAME (slug)` 一列 + 右侧 `Status` 徽章）
  - 不要：category 徽章、access count、value masked、操作按钮、Apply/Configure、统计 header、分组面板
- **KEY 管理 tab** 不显示状态徽章列以外的状态信息（保留聚合徽章列即可，详情在状态 tab）
- BYOK `/me/ai?tab=keys` 同样采用 KEY 管理 + 状态总览 双 tab 结构（用户视角，与 admin 完全一致）

#### 状态 TAB 的具体形态（v0.7 修订）

> **v0.7 修正（用户反馈"为什么要严格两列呢，没有这个要求啊"）**：列数**不**强制 2 列。Screenshot_24 本身就有 NAME/slug/category 徽章/STATUS 多列，这些**都保留**；红线只是**不要操作引导类杂物**（Apply/Configure 按钮 / 统计 header / 分组面板 / 引导文案）。

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🔑 KEY 管理 │ 📊 状态总览                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  [搜索 NAME...]    [Category ▼]  [Status ▼]    [Test Selected]   [Test All] │
├──────┬──────────────────────────────────────┬────────────────────┬───────────┤
│  ☐   │ NAME                               ↕ │ CATEGORY           │ STATUS  ↕ │
├──────┼──────────────────────────────────────┼────────────────────┼───────────┤
│  ☐   │ Claude API Key (claude-api-key)      │ AI Model · Claude  │ 🟢 Active │
│  ☐   │ Doubao API Key (doubao-api-key)      │ AI Model · Doubao  │ 🔴 Failed │
│  ☐   │ Gemini API Key (gemini-api)          │ AI Model · Google  │ 🟡 Unknown│
│  ☐   │ Tavily Search API Key (tavily-...)   │ Search · Tavily    │ 🟢 Active │
│  ...                                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ 共 13 项 │ 10 active │ 1 failed │ 2 unknown                  < 1 / 1 >       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**列**（与 Screenshot_24 一致）：

- **NAME**：`displayName + (slug)`，可点列头排序
- **CATEGORY**：类别徽章 + provider（如 `AI Model · Claude` / `Search · Tavily`），仅展示用
- **STATUS**：聚合徽章（多 KEY 时取最佳：任一 active+success → 🟢；全 failed → 🔴；其余 → 🟡），可点列头排序

**表格管理能力**：

- 顶部：搜索框（按 NAME） + Category 筛选 + Status 筛选 + `Test Selected` / `Test All` 按钮
- 行首 checkbox（批量 Test 用）+ 表头全选 checkbox
- 列头点击排序（NAME / STATUS 升降序）
- 底部：状态聚合统计（active/failed/unknown 计数） + 分页

**红线（仍不要）**：value masked 列 / access count 列 / **行级操作图标**（Edit / Delete 等都在 KEY 管理 tab）/ Apply / Configure 按钮 / "Setup guide coming soon" / 折叠分组 header / 任何 onboarding 引导文案。

#### 4.5.0 b 不在新 UI 内的内容

明确**移除**（用户反馈"不应该呈现在这里"）：

- ❌ Screenshot_23 顶部的 `Platform: 9/14 (5 pending) | Providers: 13 | Custom: 8` 任务管理统计
- ❌ Screenshot_23 每行 `Apply` / `Configure` 操作引导按钮（这是 onboarding 引导，不是 KEY 管理）
- ❌ "Platform Tool Keys 9/14" / "Model Provider Keys 13" 折叠分组 header
- ❌ "Setup guide coming soon" 类引导文案

如果未来仍需"密钥配置进度"功能，**新建独立页面** `/admin/access/secrets-onboarding` 承载，不混进 secrets 管理页。

#### 4.5.1 列表页（`/admin/access/secrets` 与 `/me/ai?tab=keys`）：保留现样

> 这是 **KEY 管理 tab** 的主体表格。状态徽章保留为聚合列（详细状态去状态 tab 看）。

| 列               | 含义                                                        | 注                                                                                                   |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **NAME**         | secret name + slug（`Claude API Key` / `claude-api-key`）   | admin 全 secret / BYOK 一个 provider 一行                                                            |
| **CATEGORY**     | 类别徽章（蓝色 AI Model / 紫色 External 等）+ provider 标签 | 现样保留                                                                                             |
| **VALUE**        | masked value `••••0f75••••` + eye 按钮显示真值              | **多 KEY 时显示 priority=最低（最优先）的那一条** + 右上角小数字 `2/3` 表示"3 个 KEY 中 2 个 active" |
| **STATUS**       | 绿色 Active 徽章                                            | 多 KEY 时聚合：任一 active+success → Active；全 failed → Error；全 inactive → Disabled               |
| **ACCESS COUNT** | 数字                                                        | 多 KEY 时**累计**（所有 KEY 调用次数总和）                                                           |
| **ACTIONS**      | 4 图标：rotate / history / **edit** / delete                | edit 行为变化：见 4.5.2                                                                              |

#### 4.5.2 点 edit 后：多 KEY 表格抽屉（核心改动）

**形态**：右侧 slide-in drawer（也可以是大 Modal），头部显示 secret 元信息（name + provider + 描述），主体是表格：

```
┌──────────────────────────────────────────────────────────────────┐
│ 编辑：Claude API Key （claude-api-key）          [+ Add Key]  ✕ │
├──────────────────────────────────────────────────────────────────┤
│ LABEL       VALUE         PRIORITY  STATUS    LAST TESTED  OPS │
├──────────────────────────────────────────────────────────────────┤
│ primary    ••••0f75••• 👁    0      🟢 OK    2分钟前     T R E D│
│ backup-1   ••••e9b0••• 👁    1      🟡 ?     未测试      T R E D│
│ rotated    ••••3a8e••• 👁    2      🔴 Fail  3小时前     T R E D│
├──────────────────────────────────────────────────────────────────┤
│  元信息编辑（display name / category / description / 启用）  保存│
└──────────────────────────────────────────────────────────────────┘
```

OPS 4 个图标：

- **T (Test)**：调真实供应商 API 测试有效性 → 更新 status 列
- **R (Replace value)**：仅替换该 KEY 的 value（生成 SecretVersion 历史，保留 label/priority）
- **E (Edit meta)**：改 label / priority / isActive（不动 value）
- **D (Delete)**：删该单个 KEY 行

[+ Add Key] 按钮 → 打开新增 KEY mini-form（label / value / priority / isActive）。

#### 4.5.3 状态徽章（与 UserApiKey 对齐）

- 🟢 **OK** = active + lastTestedAt 内 testStatus='success'
- 🟡 **?** = active + 未测试（unknown）
- 🔴 **Fail** = active + lastTestedAt 内 testStatus='failed'
- ⚪ **Disabled** = inactive

#### 4.5.4 共享组件 `<MultiKeyTable>`

admin / BYOK 复用同一组件，差异通过 props 注入：

- admin: `onTest/onReplace/onUpdate/onDelete/onAdd` 调 `/admin/secrets/:id/keys/...`
- BYOK: 同 callback 但调 `/me/api-keys/...`
- `showProvider` 仅 BYOK 多 provider 时显示
- `readOnly` 给 admin donatedKeys 等只读场景用

```tsx
interface MultiKeyTableProps {
  secretMeta: { id: string; name: string; provider?: string };
  keys: KeyRow[]; // { id, label, keyHint, priority, isActive, testStatus, lastTestedAt, accessCount }
  onAdd: (input: {
    label: string;
    value: string;
    priority: number;
  }) => Promise<void>;
  onReplace: (keyId: string, value: string) => Promise<void>;
  onUpdate: (
    keyId: string,
    meta: { label?: string; priority?: number; isActive?: boolean },
  ) => Promise<void>;
  onDelete: (keyId: string) => Promise<void>;
  onTest: (keyId: string) => Promise<void>;
  readOnly?: boolean;
}
```

### 4.6 Phase 拆分（v0.2 修订）

| Phase                                                          | 范围                                                                                 | 工作量 | 依赖          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ | ------------- |
| **P1**：admin Schema + 迁移 + 双侧基础 API                     | `secret_keys` 表 / SQL 迁移 / admin CRUD endpoint + BYOK list/add/test endpoint 补全 | 1w     | Q1-Q5 答案    |
| **P2**：抽共享组件 `<MultiKeyTable>` + admin + BYOK 同时上线   | UI 抽组件 + admin/access/secrets 接入 + /me/byok 接入 + 状态徽章                     | 1.5w   | P1 完成       |
| **P3**：业务侧 getSecretKey + KeyChain 健康熔断 + 业务调用回写 | 改 SecretsService / resolver / 改 N 个调用方                                         | 1w     | P2 上线灰度后 |

**总工时**：3-3.5 周（共享组件比串行做反而省 0.5w，因为不用做两套 UI）。

**关键设计**：P2 抽 `<MultiKeyTable>` 时**先满足 admin + BYOK 两个消费方**，不要让任一消费方"先行"——避免后续推广时 props 不兼容回头改。

```tsx
// 推荐 props 形态（admin / BYOK 共用）
interface MultiKeyTableProps {
  keys: KeyRow[]; // 表格数据（含 status）
  onAdd: (input) => void; // 新加 KEY
  onReplace: (id, val) => void; // 替换 value
  onUpdate: (id, meta) => void; // 改 label/priority/isActive
  onDelete: (id) => void;
  onTest: (id) => void; // 测试有效性
  readOnly?: boolean; // BYOK donatedBy admin 只读模式（如有）
  showProvider?: boolean; // BYOK 多 provider 展示时显示 provider 列
}
```

---

## 五、风险与边界

| 风险                                           | 缓解                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| 迁移脚本失败（13 条 secret 数据丢失）          | 1) Railway DB 先 backup；2) 迁移脚本带 BEGIN/COMMIT 事务；3) 灰度 24h 后再删旧列     |
| 业务侧调用方多（getSecretValue 用了 N 处）     | grep `getSecretValue` 全部一次性改完 + spec 守门；带降级 flag `MULTI_KEY_DISABLED`   |
| ESLint / 架构边界冲突                          | secret_keys 在 platform/credentials/secrets 内，无跨层；platform 不依赖 ai-engine OK |
| 状态实时性                                     | 推荐 D（手动 + 被动），不上 cron 避免增加运维面                                      |
| KeyHealthStore 已经存在（DistributableKey 用） | 复用其抽象（命名空间扩 `secret:{secretId}:{keyId}`）— 减少重复                       |

---

## 六、不在本方案范围

- ❌ DistributableKey + Secret 大合并（Q5 选 A）
- ❌ Cron 健康检查（Q2 选 D）
- ❌ Quota 池化语义（admin secrets 不需要 quota，DistributableKey 保留 quota 不动）

## 六'、本方案明确做的（v0.2 调整）

- ✅ admin secrets + 用户 BYOK **共享 `<MultiKeyTable>` 组件**（用户决策 2026-05-06）
- ✅ admin + BYOK 同时上线 P2（不再串行）
- ✅ BYOK 后端 API 补齐多 KEY 的 list/add/test endpoint（schema 已 OK，缺 endpoint 暴露）

---

## 七、决策清单（v0.7 全部锁定）

```
Q1 多 KEY 消费策略       ✅ B fallback chain（与现有 KeyChain 对齐）
Q2 状态有效性判定       ✅ D 手动 + 被动（0 cron 运维负担）
Q3 SecretVersion rotation ✅ B 用并存替代（加新 + 老标 inactive）
Q4 KEY 编辑形态         ✅ C 抽屉（drawer，列表不被遮挡）
Q5 与 DistributableKey 合并 ✅ A 不合并（最小 surface）
Q6 admin / BYOK 共享组件 ✅ v0.2 已决策（共享 <MultiKeyTable>）
Q7 多 TAB 划分          ✅ v0.4 已决策（KEY 管理 / 状态总览）
Q8 状态 TAB 不要操作杂物 ✅ v0.5 已决策（无 Apply/Configure/分组）
Q9 状态 TAB 真表格化     ✅ v0.6 已决策（checkbox/排序/筛选/批量/分页）
Q10 状态 TAB 列          ✅ v0.7 已决策（NAME / CATEGORY / STATUS 三列）

可选 TAB：
- 分类视图：❌ 不做（KEY 管理 tab 已有筛选）
- 审计日志：❌ 不做（等用户后续要时单独加）

Phase: P1 (1w schema+API) → P2 (1.5w admin+BYOK 双 TAB UI) → P3 (1w 业务侧) ✅
```

**全部决策已 lock，进入 P1 实施。**

---

## 七'、P1 + P2 + P3 落地状态（2026-05-06，端到端完成）

| Phase | 子步骤                                                                     | commit      | 状态    |
| ----- | -------------------------------------------------------------------------- | ----------- | ------- |
| P1    | schema + migration + design doc                                            | `b22b9d549` | ✅ 已落 |
| P1    | service + admin controller + spec (12 tests)                               | `f88518fc1` | ✅ 已落 |
| P1    | doc 回填 commit hash                                                       | `a5f8e0809` | ✅ 已落 |
| P2    | admin frontend：drawer + 状态总览 tab + multikeytable                      | `cee6a4992` | ✅ 已落 |
| P3    | 业务侧透明迁移（getValueInternal 委托 + dual-write）                       | `301e35e1e` | ✅ 已落 |
| P2    | BYOK label 暴露 + UserApiKeyMultiKeyPanel 复用 multikeytable               | `1c384ecdd` | ✅ 已落 |
| P3    | 8 个 regression spec（委托 + dual-write + markSuccess/Failure）            | `a4e7a8432` | ✅ 已落 |
| —     | 深度检视报告（50+ 业务分支仿真）                                           | `cac871460` | ✅ 已落 |
| P4    | BYOK panel 状态与父组件解耦（深度检视 bug fix）                            | `c6babd703` | ✅ 已落 |
| P4    | backend 加固：getValue 委托 / 审计补全 / 事务化 / 软删联动 / mark 接 keyId | `1a2f9a4a5` | ✅ 已落 |
| P4    | frontend 加固：byok 隐藏假按钮 + 删旧表格 + 错误 toast                     | `f5fdb3a26` | ✅ 已落 |

**实施差异**（vs 原 v0.7 plan）：

1. **业务侧切换零侵入**：原 plan 要求改 23 处 caller 加 `getSecretKey + markSuccess/Failure`，实际改成 `SecretsService.getValueInternal` 内部委托给 `SecretKeysService.getSecretKey`（含 fallback chain + 5min 熔断 + dual-track 兜底）。所有 23 处调用方零改动获得多 KEY 能力。`markSecretSuccess/Failure` 作为可选 public API 暴露给愿意主动 feed 健康反馈的 caller。
2. **BYOK endpoint 补齐**：原 plan 要求新增 `/me/api-keys/*` 多 key endpoint。实际发现 PUT/DELETE `/user/api-keys/:provider` 的 label 参数已支持（schema PR-2），仅缺 `listUserApiKeys` 的 select 暴露 label 字段。改 1 行加 `label: true` 即完成。
3. **共享组件**：`<MultiKeyTable>` 在 admin 抽屉 + BYOK provider 卡片下方折叠面板**两处**消费，视觉与行为完全一致。

**Dual-track 兼容窗口（P4 待办）**：

- `secrets.encrypted_value` / `iv` / `key_version` 列保留为 Secret 表的兼容字段。
- 新创建的 secret 自动 dual-write 到 `secret_keys.primary`；老 secret 通过 migration `INSERT...SELECT` 一次性回填。
- 业务侧 `SecretKeysService.getSecretKey` 在 `secret_keys` 表 0 行时自动降级读 `Secret.encryptedValue`（兜底）。
- 待生产观察 1-2 周稳定后，单独发 P4 commit 删除旧 3 列 + dual-write 代码。

---

## 八、关联

- `backend/src/modules/platform/credentials/secrets/` 当前实现
- `backend/src/modules/platform/credentials/` 三套 BYOK 机制（含 BYOK key 解析、UserApiKeys、secrets 子模块）
- `frontend/app/admin/access/secrets/` 当前 UI
- 用户截图：`debug/Screenshot_20.png` （`/admin/access/secrets` 编辑 Modal）

## 维护

- **维护者**：Claude Code（每完成 Phase 回填 commit hash）
- **版本**：v0.2（2026-05-06 修订：admin / BYOK 共享组件，P2 同时上线）
- **设计原则**：[CLAUDE.md "架构决策必须确认"] + [Karpathy "暴露多义性"]

## 修订历史

| 版本 | 日期       | 变更                                                                                                                                                                                                                                                                                                |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1 | 2026-05-06 | 初版，admin/BYOK 串行（Phase 1-4）                                                                                                                                                                                                                                                                  |
| v0.2 | 2026-05-06 | 用户反馈"BYOK 多 KEY 展示一样有问题，应该和管理员一样"→ 改共享组件 + P2 同时上线                                                                                                                                                                                                                    |
| v0.3 | 2026-05-06 | 用户反馈"为什么没有目录" + 截图 21/22 偏好确认 → 加 TOC；明确列表页保留现样；改进 §4.5 给出多 KEY 表格抽屉详细形态 + `<MultiKeyTable>` props；强化 §一.4 BYOK UI 现状描述                                                                                                                           |
| v0.4 | 2026-05-06 | 用户反馈截图 23/24（状态/分组/引导不该混在 KEY 管理页）+ "可以多 TAB 呈现"→ 加 §4.5.0 多 TAB 划分（KEY 管理 / 状态总览 / 可选分类视图 / 可选审计日志）；明确移除 Screenshot_23 的统计标题/Apply-Configure/折叠分组；状态 tab 仅采用 Screenshot_24 简洁徽章形态；BYOK UI 同结构                      |
| v0.5 | 2026-05-06 | 用户反馈"状态只显示状态即可，不要显示其他的内容"→ 状态 tab 极简化：仅 NAME + STATUS 两列，删除 category/access count/value/操作按钮/Apply-Configure/分组等所有非状态信息；加 ASCII 形态示意                                                                                                         |
| v0.6 | 2026-05-06 | 用户反馈"不能（非）表格化管理"→ 状态 tab 改为**真正的表格形态**（不是纯文本列表）：保留 2 列规则不变，加 checkbox 选择 / 搜索 / Status 筛选 / 列头排序 / 批量 Test Selected / Test All / 分页 + 状态聚合统计；文档路径迁到 `docs/architecture/ai-infra/secrets/`（与 backend modules 1:1 镜像）     |
| v0.7 | 2026-05-06 | 用户反馈"为什么要严格两列呢，没有这个要求啊"→ 状态 tab 列**不强制 2 列**，恢复 Screenshot_24 形态（NAME / CATEGORY / STATUS 三列）；红线只是**不要操作引导杂物**（Apply/Configure / 统计 header / 分组面板 / 行级操作图标），不是限列数。同时锁定 Q1-Q5 决策（按专业建议默认值），可选 TAB 全部不做 |
