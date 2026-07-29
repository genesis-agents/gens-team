---
name: feedback-cache-shape-breaking-change-must-invalidate
description: Cache 存储对象 shape 加新必需字段时必须考虑旧 cache 残留——300s TTL 内命中旧 shape 会按 undefined fallback；getPersonalKey 加 label 字段后必须 cache shape 校验
metadata:
  node_type: memory
  type: feedback
  originSessionId: 933c799f-71fb-4062-b1b9-de537fec0c47
---

## 规则

**Cache 存储对象 shape 加新必需字段时，必须在读取侧加 shape 校验：旧 shape 视为 stale 强制 fallback 到真源。**

## Why（2026-05-12 BYOK HITS 未统计事故）

PR `318a9cb18` 修 `getPersonalKey` 返回真实 label（之前没返回）让 KeyResolver 构正确 healthKeyId。但 Redis cache TTL=300s 内还有 5 分钟的旧 cache 没 label 字段。命中后：

```ts
const label = personal.label ?? "default"; // ← 旧 cache personal.label=undefined
healthKeyId: buildPersonalKeyId(userId, provider, label),
```

退化回 `"default"` → `persistDbHealthOutcome` 按 "default" 反查 user_api_keys 找不到记录 → Prisma P2025 → 用户 BYOK 抽屉 HITS=--- LAST USED=---。

修复要等 5 分钟所有 cache 自然过期才生效——但截图里那 1 个 key 是 5 分钟前刚被用，cache 至少撑 4 分多钟。

## How to apply

### Case 1：加新字段且 caller 依赖它

读取侧加 shape 校验：

```ts
const cached = await this.cacheService.get<Result>(key);
// 新字段 'label' 必须存在；旧 cache shape 没有 → 视为 stale
if (cached && cached.label) {
  return cached;
}
// fallthrough 走 DB 重拉 + 新 shape 重新缓存
```

### Case 2：加新字段是 optional

可以接受 undefined，不需要校验——但 caller 必须 explicit 处理 undefined 而不是依赖 type system 保证。

### Case 3：删字段或改语义

必须显式 bump cache key version：

```ts
// 之前：const cacheKey = `${PREFIX}${userId}`;
// 改成：const cacheKey = `${PREFIX}v2:${userId}`;
```

## 测试要求

加 spec 验证 legacy cache shape fallback：

```ts
it("treats legacy cache without <new field> as stale → DB fallback", async () => {
  const stale = {
    /* 缺新字段 */
  };
  mockCache.get.mockResolvedValue(stale);
  await service.method();
  expect(mockDb.findFirst).toHaveBeenCalled();
});
```

## 友邻

- [[project_byok_thorough_cleanup_2026_05_12]] — 这次 PR-1 的 healthKeyId="default" 兼容残留是更深的源头
