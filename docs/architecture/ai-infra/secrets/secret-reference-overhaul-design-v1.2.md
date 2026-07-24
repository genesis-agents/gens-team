# 密钥引用机制彻底治理方案 v1.2

> 日期：2026-05-07
> 状态：**第 3 轮草案**（吸收 v1.1 第 2 轮 4 路评审 18 条新 concerns / 残余 partial）
> 前序：v1.0 / v1.1
> 触发：Screenshot_5 N:1 串号事故已修 (commit `53cb299cf`)

## 0. 第 2 轮评审 fix-list 索引

每条标注 `[NN1/NCN/NS1/...]` 对应：

- 架构师 N1-N5：split-brain / ownerToolId / phase gate
- DB NC-1~NC-5：migration files / 410 path / dual-read coupling
- 安全 NS1-NS5：salt impl / auto-revert auth / CSRF / dashboard / fixture / byokOverride audit
- 运维 NO1-NO6：thresholds / timeline / state machine / chicken-egg / mission cancel / fixture scope / Phase 4-5 parallelism

---

## 1. 问题陈述（不变）

5 重存储 / N:1 错配 / 双 ID 漂移 / Read-time inference / 无统一 resolver / 无删除级联 / category 过滤脆弱。

## 2. 目标态架构

### 2.1 北极星

> **1 个 secret 1 处定义、1 处引用、1 个 resolver。**

### 2.2 数据模型

#### 保留

- `Secret` / `SecretKey` / `UserApiKey` / `ToolConfig`

#### 改造（v1.2 修订）

新增字段（含归属 PR 与 migration 文件名）`[NC-1]`：

| 字段                      | 类型         | 默认  | PR    | Migration 文件                                            |
| ------------------------- | ------------ | ----- | ----- | --------------------------------------------------------- |
| `Secret.isAutoManaged`    | boolean      | false | PR-S1 | `20260514a_secret_add_is_auto_managed/migration.sql`      |
| `Secret.ownerToolId`      | string\|null | null  | PR-S1 | `20260514b_secret_add_owner_tool_id/migration.sql` `[N2]` |
| `ToolConfig.useResolver`  | boolean      | false | PR-S1 | `20260514c_tool_config_add_use_resolver/migration.sql`    |
| `ToolConfig.byokOverride` | string\|null | null  | PR-S1 | `20260514d_tool_config_add_byok_override/migration.sql`   |

迁移脚本要求（统一）：`IF NOT EXISTS` 幂等，无 `DO $$ ... EXCEPTION`，仅简单 `ALTER TABLE ADD COLUMN`，回滚 = drop column。

#### `Secret.ownerToolId` 写入路径 guard `[N2]`

```typescript
// secrets.service.ts
async create(dto: CreateSecretDto): Promise<Secret> {
  if (dto.isAutoManaged && !dto.ownerToolId) {
    throw new ConflictException('auto-managed secret must declare ownerToolId');
  }
  // ... 原逻辑
}

// updateToolConfig
async updateToolConfig(toolId, update) {
  if (update.secretKey) {
    const sec = await this.prisma.secret.findUnique({ where: { name: update.secretKey } });
    if (sec?.isAutoManaged && sec.ownerToolId !== toolId) {
      throw new ConflictException(
        `auto-secret '${update.secretKey}' is owned by '${sec.ownerToolId}', cannot bind to '${toolId}'`,
      );
    }
  }
  // ... 原逻辑
}
```

#### 删除（不变）

5 个 legacy endpoint 实质 = `system_settings` 行（key 模式 `search.perplexity.apiKey` 等）。`[D1]`

### 2.3 ToolApiKeyResolver

层级：`backend/src/modules/ai-infra/credentials/tool-api-key-resolver/`

API：`resolve(secretName: string, opts: ResolveOptions): Promise<ResolvedKeyHandle | null>`

依赖：仅 `SecretKeysService` + `UserApiKeysService` 两个。

#### Dual-read 阶段（v1.2 澄清，**避免 god-class**）`[NC-3]`

PR-S6a 引入的 dual-read **不在 resolver 内部实现**。规则：

- resolver 始终保持 2-deps、`resolve(secretName)` 接口纯净
- dual-read 在 **tool 执行器**层做：先尝试 `resolver.resolve(toolConfig.secretKey)`，若返回 null 且 `toolConfig.config.apiKey` 不为空，使用后者并 fire-and-forget 调用一个**临时辅助函数** `legacyConfigKeyAdapter(toolId, plaintext)` 把 plaintext 包装成 `ResolvedKeyHandle{ source: 'system', keyId: null }`
- 该辅助函数随 PR-S6e 的字段 drop 一并删除
- resolver 模块本身在整个 S6 序列中不变更接口

### 2.4 Provider/Registry ID 收敛

`GET /admin/ai/tool-aliases` 必须 `@UseGuards(JwtAuthGuard, AdminGuard)`。

### 2.5 Secret 删除策略

- softDelete 仅写 `Secret.deletedAt` + `isActive=false`，**不清** `ToolConfig.secretKey`
- resolver 读到 `deletedAt != NULL` → fallback + markFailure(`SECRET_DELETED`)
- admin 删除 dialog 的服务端确认接口 `[NS3 N1]`：

```typescript
// 1. admin GET /admin/secrets/:name/delete-confirmation
//    → 服务端生成 nonce, 存 Redis TTL 60s, 返回 { confirmationToken, refsCount }
// 2. admin DELETE /admin/secrets/:name
//    body: { confirmationToken, choice: 'rebuild'|'unbind'|'keep-disabled' }
//    服务端 校验 token + 校验 Origin/Referer + class-validator 枚举 choice
//    成功后 invalidate token，单次有效
```

- 全过程 `prisma.$transaction` 包裹
- 审计日志写 `hadRefs: boolean`，不写 count

### 2.6 ConfigureModal name-pattern 推荐

按 `secret.name` 含 `toolId` 模糊匹配 + ★ 标。`isAutoManaged=true` 的 secret **不出现在选项中**。

---

## 3. PR 序列（v1.2）

### Phase 0：前置（必须 4/4 完成才能进 Phase 1）

| PR             | 目标                                                   | 来源    |
| -------------- | ------------------------------------------------------ | ------- |
| **PR-S-prep1** | SETTINGS_ENCRYPTION_SALT + 重加密迁移                  | `[NS1]` |
| **PR-S0a**     | alias map 单源 + admin-guarded endpoint + 前端 hook    | —       |
| **PR-S0b**     | observability：7 metric + dashboard + auto-revert 服务 | `[NO1]` |
| **PR-S0c**     | E2e harness                                            | —       |
| **PR-S0d**     | BYOK 现状审计 + 锁定 D2                                | —       |

#### PR-S-prep1 详细规格 `[NS1]`

迁移脚本（应用层，`scripts/migrate-prep1-encryption-salt-rotation.ts`）：

```typescript
// 顺序：
// 1. 校验 env：SETTINGS_ENCRYPTION_KEY 已存在；新加 SETTINGS_ENCRYPTION_SALT（32 字节随机）
// 2. 修复 deriveKey() 截断 bug：当前 substring(0, 32) 在 hex key 上只有 16 字节熵
//    → 改为 Buffer.from(key, 'hex') 取 32 字节，或 PBKDF2 输出固定 32 字节
// 3. 数据迁移（resume-able）：
//    a. 加 secrets.encryption_version smallint default 1（migration `20260512a_secret_add_encryption_version`）
//    b. for each row WHERE encryption_version = 1:
//       i.  TX BEGIN
//       ii. decrypted = oldDecrypt(row.encrypted_value, row.iv)  // 用旧 salt 派生 key
//       iii. { encrypted, iv } = newEncrypt(decrypted)  // 用新 salt 派生 key
//       iv. UPDATE row SET encrypted_value=encrypted, iv=iv, encryption_version=2
//       v.  TX COMMIT
//    c. SecretKey / SecretVersion 同款 loop（独立 encryption_version）
//    d. ToolConfig.config 中可能含 plaintext apiKey 不动（PR-S6 处理）
// 4. 校验：随机抽样 20 行 readback decrypt，全部 match 原值
// 5. atomicity 保证：每行独立 TX；resume 通过 encryption_version=1 过滤；中断重启幂等
// 6. 双 salt 读窗口：迁移完成后 oldDecrypt 函数保留 30 天，确保 30 天内任何回滚 / 漏掉的行都能解；30 天后 hard-remove oldDecrypt + dead code
// 7. **绝不 log decryptedValue**——logger 只 log row id / encryption_version；error 路径只 log error.code 不 log error.message（可能 echo input）
```

CLI: `npm run migrate:prep1 -- --batch=100 --max-runtime=10m`，可重复运行。

### Phase 1：核心 resolver（必须等 Phase 0 全部完成）

**PR-S1**：

- 落 `ToolApiKeyResolver` (2 deps) at `ai-infra/credentials/tool-api-key-resolver/`
- 4 个 schema 字段（见 §2.2 表）+ 4 个 migration .sql 文件
- arch spec 断言：capability/registry 行 secretKey IS NULL
- ownerToolId 写路径 guard（§2.2）`[N2]`
- byokOverride RBAC：3 层 caller hint < user-profile < ToolConfig.byokOverride，admin-only 改 + 写 `SecretAccessLog` action `BYOK_OVERRIDE_CHANGED`（含 operatorId / oldValue / newValue）`[NS5]`
- facade 暴露 + ESLint 边界守护

### Phase 2：tool callsite 切流（5 sub-PR）

**前置硬规则 `[NO3]`**：PR-S2x 任一开始前必须验证：

- ☑ PR-S-prep1 / S0a / S0b / S0c / S0d / S1 全部 deployed + 稳定 ≥48h
- ☑ admin 可访问 migration progress dashboard
- ☑ auto-revert 服务（PR-S0b）已就绪 + 接收过测试 alert
- ☑ e2e harness（PR-S0c）覆盖该 sub-PR 涉及的所有 tool

| PR     | 范围                                        | tool 数 |
| ------ | ------------------------------------------- | ------- |
| PR-S2a | search 类                                   | 4       |
| PR-S2b | extraction 类                               | 4       |
| PR-S2c | youtube + tts 类                            | ~3      |
| PR-S2d | academic + finance + weather + image search | ~10     |
| PR-S2e | dev tools + policy + 收尾                   | ~10     |

每个 PR 灰度：单 tool 24h → 全开 → 下一类。

#### Per-tool feature flag 一致性 `[N1]`

**v1.2 决议**：用 **DB column 直读 + 30s in-process TTL**（不用 Redis pub/sub —— gens.team 当前架构未引入跨 pod pub/sub，临时为此引入开销大于收益）。

实现：

```typescript
@Injectable()
export class ToolFeatureFlagService {
  private cache = new Map<string, { value: boolean; expiresAt: number }>();

  async useResolver(toolId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.cache.get(toolId);
    if (cached && cached.expiresAt > now) return cached.value;
    const row = await this.prisma.toolConfig.findUnique({
      where: { toolId },
      select: { useResolver: true },
    });
    const value = row?.useResolver ?? false;
    this.cache.set(toolId, { value, expiresAt: now + 30_000 });
    return value;
  }
}
```

**最坏不一致窗口 = 30s**（vs v1.1 的 5min）。在多 pod Railway 架构下 30s 可接受 —— 远短于人看到 monitoring 异常 → 决策 → 操作的反应时间，不会引入歧义状态。`[N1]`

### Phase 3：Secret 删除策略（**v1.2 序列调整 `[A6]`**）

**前置硬规则**：Phase 3 必须在 Phase 1 PR-S1 deployed + 稳定 ≥48h 后才能开始。可以与 Phase 2 部分 sub-PR 并行（不冲突 callsite），但不能与 Phase 1 同时改 `secrets.service.ts`。

| PR    | 目标                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------- |
| PR-S3 | softDelete 不清 ref + admin dialog 服务端 confirmationToken + transaction 包裹 + 审计 hadRefs 布尔 |
| PR-S4 | ConfigureModal name-pattern + auto-secret 不显示                                                   |

### Phase 4：legacy 数据迁移（5 步）

| PR         | 目标                                             |
| ---------- | ------------------------------------------------ |
| **PR-S5a** | system_settings → Secret 应用层 migration script |
| **PR-S5b** | 老 endpoint 标 410 GONE `[NC-2]`                 |
| **PR-S5c** | 验证 2w                                          |
| **PR-S5d** | 删 system_settings 老 key + pg_dump 归档         |

#### PR-S5b 410 GONE 实现规格 `[NC-2]`

具体 endpoint 路径列表（来自 admin.controller.ts）：

- `PATCH /admin/search-config`
- `PATCH /admin/extraction-config`
- `PATCH /admin/youtube-config`
- `PATCH /admin/tts-config`
- `PATCH /admin/skillsmp-config`
- 对应的 `GET` 也一并 410（前端读路径）

实现选 **`throw new GoneException('this endpoint is deprecated, use /admin/ai/tools/:toolId')`**（不是 `@HttpCode(410)`），原因：

- `GoneException` 是 NestJS 内置（`@nestjs/common`），自动 serialize 为 `{ statusCode: 410, message }`，前端可解析展示
- 同步抛错使方法体清空，避免误调用残留逻辑
- 错误堆栈带 endpoint path，便于排查

每个 controller 方法保留 2 行：抛 `GoneException` + log warn `[deprecated-endpoint] ...`。

### Phase 5：direct input → auto-secret（5 步双轨）

每步必须 ≥48h 间隔 + state machine guard `[NO2]`：

```typescript
// scripts/check-s6-state.ts
// 部署前自动跑：DB 中读取当前 dual-read/dual-write 状态
// state ∈ { 'pre-S6', 'S6a-dualRead', 'S6b-dualWrite', 'S6c-readSwitched', 'S6d-writeStopped', 'S6e-fieldDropped' }
// 拒绝跳步：从 S6a 必须先到 S6b 才能到 S6c
// state 存 system_settings.value at key `migration.s6.state`
```

| PR     | step        | guard 校验             |
| ------ | ----------- | ---------------------- |
| PR-S6a | dual-read   | state=pre-S6           |
| PR-S6b | dual-write  | state=S6a-dualRead     |
| PR-S6c | switch read | state=S6b-dualWrite    |
| PR-S6d | stop write  | state=S6c-readSwitched |
| PR-S6e | drop field  | state=S6d-writeStopped |

##### Phase 4-5 并行规则 `[NO6]`

PR-S5c 2w 验证期间 Phase 5 **可并行**（动数据范围不重叠 —— S5 操作 system_settings，S6 操作 tool_configs.config），但 PR-S6e（drop field）必须等 PR-S5d 完成（避免连续 destructive）。

### 不再实现

- ~~PR-S7 DB CHECK~~ → arch spec 断言 + 服务层 guard

---

## 4. 关键设计决策点

### D1 直接输入模式

保留，内部走 auto-secret + `isAutoManaged` + `ownerToolId` 双重 guard。

### D2 BYOK 优先级

PR-S0d 现状审计后锁定，不预设。

### D3 Migration 数据策略

应用层 migration script + 5 步双轨。

### D4 Capability row secretKey 字段

保留字段 + 应用层 guard + arch spec 断言。

### D5 PR-S2 callsite 改造

按 category 5 sub-PR + per-tool feature flag (DB column + 30s LRU)。

### D6 Feature flag 一致性

DB column 直读 + 30s in-process TTL（**不**引入 Redis pub/sub）。最坏不一致窗口 30s。

### D7 Railway deploy 窗口

单 env，~15-20 次 deploy 跨 6w，每次 deploy 检查 active mission + graceful cancel via MissionLivenessGuard checkpoint resume `[NO4]`。

### D8 Auto-revert 触发权限模型 `[NS2 N3 HIGH]`

- 触发主体：**内部 monitoring service** (`ToolFeatureFlagAutoRevertService`)，不是 webhook
- 服务调用 internal admin-only endpoint `POST /internal/tools/:toolId/auto-revert`，使用 service-account JWT (新 env `INTERNAL_AUTO_REVERT_TOKEN`)
- endpoint 限定操作：**仅** `useResolver = false` 翻转，不允许其他字段
- endpoint 写审计日志 `AUTO_REVERT_TRIGGERED` 含触发指标 + 阈值
- token 60 天轮换 + 不进 git
- 不暴露给外部 webhook，对 adversary 无攻击面

### D9 Auto-revert 阈值 `[NO1]`

| 指标                                         | 阈值              | 窗口  | 动作                                  |
| -------------------------------------------- | ----------------- | ----- | ------------------------------------- |
| 单 tool secret.resolver.resolve.null_count   | > 0 次            | 1h    | per-tool flip useResolver=false       |
| 单 tool secret.tool.call.outcome auth_failed | 突增 >5x baseline | 10min | per-tool flip + PagerDuty             |
| 全局 error_rate                              | > 5%              | 5min  | git revert + 立即 deploy + 全员 alert |
| resolver P99 latency                         | > 150ms           | 10min | 仅告警，不 revert                     |

### D10 Phase 排序硬规则 `[A6]`

```
Phase 0 (PR-S-prep1 + S0a-d) ─→ Phase 1 (PR-S1) ─┬─→ Phase 2 (PR-S2a..e)
                                                  ├─→ Phase 3 (PR-S3 / S4)
                                                  └─→ Phase 4 (PR-S5a..d) ─┬─→ Phase 5 (PR-S6a..e)
                                                                            │
                                                                            └ S5c 期间 S6 可并行（除 S6e）
```

每 phase 完成 = 全部 PR deployed + 48h 无 alert。

---

## 5. 安全要求

| #     | 来源       | 要求                                                                                                    |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Sec-1 | `[S1+NS1]` | PR-S-prep1 必先；含 deriveKey substring bug fix + per-row TX + 30 天双 salt 读窗口                      |
| Sec-2 | `[S2+N2]`  | `Secret.isAutoManaged` + `Secret.ownerToolId` + 服务层 guard 拒绝 cross-tool 绑定                       |
| Sec-3 | `[S3+N1]`  | softDelete 服务端 confirmationToken (Redis TTL 60s) + class-validator choice 枚举 + Origin/Referer 校验 |
| Sec-4 | `[S4]`     | byokPolicy 3 层 + ToolConfig.byokOverride 改写写审计 `BYOK_OVERRIDE_CHANGED` `[NS5]`                    |
| Sec-5 | `[S5]`     | migration 永不 log decryptedValue；error 仅 log code 不 log message；TX per row                         |
| Sec-6 | `[S6+NS3]` | `GET /admin/ai/tool-aliases` + dashboard endpoints 全部 `@AdminGuard` + spec test 显式断言              |
| Sec-7 | `[NS2 N3]` | auto-revert 走内部 service-account token + 限定 useResolver flip + 写审计                               |
| Sec-8 | `[NS4 N5]` | PR-S0c fixture spec 不 console.log resolved value；CI log scrubbing 替换 `sk-*` / `Bearer *` 等 prefix  |

---

## 6. 运维要求

### 6.1 Telemetry 7 项

| metric                              | type      | tag              | alert                                    |
| ----------------------------------- | --------- | ---------------- | ---------------------------------------- |
| secret.resolver.resolve.duration_ms | histogram | tool_id, source  | P99 > 100ms                              |
| secret.resolver.resolve.null_count  | counter   | tool_id          | > 0/1h → per-tool revert                 |
| secret.tool.call.outcome            | counter   | tool_id, outcome | auth_failed > 5x baseline/10min → revert |
| secret.byok_vs_system_ratio         | gauge     | tool_id          | informational                            |
| secret.tool.feature_flag_state      | gauge     | tool_id          | informational                            |
| secret.legacy_path_hit_count        | counter   | source           | should be 0 after S5d                    |
| secret.auto_secret_create_failure   | counter   | reason           | namespace_collision/etc                  |

### 6.2 Migration progress dashboard

PR-S0b 引入 admin 内 dashboard：每 tool useResolver / 24h success&failure / BYOK ratio / 最近 markFailure 详情。

实现：扩展现有 `observability-admin.controller.ts`（不新建 controller） `[NC-4]`，新增 endpoint `GET /admin/observability/secrets-migration` 带 `@AdminGuard` + spec test。

### 6.3 Deploy Playbook

每次 deploy 前后：

```
PRE-DEPLOY:
  1. SELECT COUNT(*) FROM missions WHERE status='running' AND last_heartbeat > NOW() - INTERVAL '2 min'
  2. if count > 0:
     - announce in #engineering 30 min ahead
     - graceful cancel via MissionLivenessGuard.cancelMissionGracefully(missionId)  [NO4]
       (该方法已存在，触发 checkpoint persist + emit cancel event；用户后续可 resume)
     - wait until count = 0
  3. proceed

POST-DEPLOY (5 min watch):
  - error_rate > 5% in 5min → trigger D9 全局 revert
  - resolver null_count > 0 → trigger D9 per-tool revert
  - manual smoke: 1 search + 1 extraction tool e2e
```

### 6.4 Rollback

- 每 PR 必有"revert 步骤"段
- migration script 必有逆向脚本（强制 review checklist 项）
- 字段添加回滚 = drop column

---

## 7. 测试策略

### 7.1 PR-S0c E2e harness 范围限定 `[NO5]`

- **第 1 期（PR-S0c MVP）**：覆盖 5 个核心 tool：perplexity / tavily / firecrawl / supadata / elevenlabs（覆盖 search/extraction/youtube/tts 4 个 category）
- 每个 tool 3 场景：BYOK / system / null fallback
- 第 2 期（与 PR-S2d 同节奏）：扩到 academic + finance + weather + image search
- 不做全 31 tool 排列组合（fixture 维护成本不合算）

### 7.2 Arch spec 断言

- `tool_configs WHERE tool_id IN (multiProviderRegistryIds) AND secret_key IS NOT NULL` 必为 0
- `secrets WHERE is_auto_managed = true AND owner_tool_id IS NULL` 必为 0
- `tool_configs WHERE tool_id != X AND secret_key IN (SELECT name FROM secrets WHERE is_auto_managed = true AND owner_tool_id = X)` 必为 0

### 7.3 Fixture 安全 `[NS4]`

- E2e fixture 用确定性假 KEY (`fake-perplexity-key-001` 等)，永不接触真实 prod key
- assertion 仅校验 `keyId` / `source`，不 log `value`
- CI step 加 log scrubber：`s/sk-[A-Za-z0-9]{20,}/***REDACTED***/g`

---

## 8. PR 依赖图（v1.2 修订）

```
PR-S-prep1 (salt fix + deriveKey bug)
    │
    ├─→ PR-S0a (alias map)
    ├─→ PR-S0b (observability + auto-revert service)
    ├─→ PR-S0c (e2e harness, 5 core tools)
    └─→ PR-S0d (BYOK audit)
                    │
                    ↓ ALL FOUR + prep1 deployed + 48h stable
                    ↓
                PR-S1 (resolver 2-deps + 4 schema fields + 4 .sql migrations + ownerToolId guard + byokOverride audit)
                    │
                    ↓ deployed + 48h stable
                    ↓
        ┌───────────┼─────────────┬─────────────┐
        ↓           ↓             ↓             ↓
     PR-S2a..e   PR-S3        PR-S4         PR-S5a→b→c→d
     (灰度链)    (softDelete) (ConfigureModal) (legacy migrate)
                                                      │
                                          (S5c 期间 S6 可并行)
                                                      ↓
                                              PR-S6a→b→c→d→e
                                              (state machine guard)
                                                      │
                                                      ↓ S6e 必须等 S5d 完
                                                      ↓
                                                   全部完成
```

---

## 9. 工作量重新估算 `[NO5+timeline]`

**v1.2 实事求是估算（单 Railway env + 多 session 并行项目背景）**：

| Phase   | 名义 | 实际预期（含 deploy 窗口协调 + 验证期）      |
| ------- | ---- | -------------------------------------------- |
| Phase 0 | 3w   | 4w（5 PR 部分并行 + 各自验证 48h）           |
| Phase 1 | 1w   | 2w（schema + spec + e2e 验证）               |
| Phase 2 | 3w   | 5w（5 sub-PR × 24h 灰度 + 48h 间隔）         |
| Phase 3 | 1w   | 2w（含 dialog UX 评审）                      |
| Phase 4 | 4w   | 4w（含 2w 验证不变）                         |
| Phase 5 | 3w   | 4w（5 步 × ≥48h 间隔 + state machine guard） |

**总计 ~21w**（v1.0 6-8w / v1.1 15w / v1.2 21w —— 每轮加严要求 + 实事求是 deploy 节奏）。

**减少 scope 的可选项**：

- 不做 PR-S6（保留 ToolConfig.config.apiKey 直接嵌入 + 只加服务层 guard 防止滥用）→ 减 4w → 17w
- 不做 PR-S0d 全量审计（仅采样 5 callsite）→ 减 1w → 20w
- 不做 ConfigureModal name-pattern（PR-S4）→ 减 0.5w → 20.5w

建议：**初版按 21w 全量推进**；中途若团队带宽不足，按上述清单按优先级降级。**不可降级**：PR-S-prep1 (security)、PR-S0b (observability)、PR-S0c (e2e harness)、PR-S1 (resolver)、PR-S2 (callsite migration)。

---

## 10. 不在本方案范围

- 多租户隔离 / KMS 集成 / 自动 rotation / 审计日志查询 UI

## 11. 决议历史

- v1.0 (2026-05-07)：初稿
- v1.1 (2026-05-07)：吸收第 1 轮 26 条 concerns
- v1.2 (2026-05-07)：吸收第 2 轮 18 条新 concerns / partial（架构师 N1/N2/A6 + DB NC-1/2/3 + 安全 NS1/NS2/NS3/NS4/NS5/N3 + 运维 NO1-NO6）
