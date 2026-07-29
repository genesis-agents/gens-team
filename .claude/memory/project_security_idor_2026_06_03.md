---
name: project_security_idor_2026_06_03
description: 2026-05-30 安全评审 P0 IDOR 落地状态（agents-api 已修、harness checkpoint 本次修）
metadata:
  node_type: memory
  type: project
  originSessionId: 5bc373e3-e2e9-499d-9c89-b0b5f95b3469
---

承接 [2026-05-30 安全评审](docs/architecture/platform-review/2026-05-30-layered-review-v2.md) rank 1（IDOR，企业级一票否决项）。MECE 结构线干透后转此。

**OAPI-001（agents-api，实际暴露的 IDOR）= 已被他 session 修**：`open-api/agents-api/agents.service.ts` 的 getTask/getArtifacts/getArtifactDownload/cancelTask 全部 `where:{id,userId}` + artifact 经父 task.userId 校验（有 "★ IDOR 防护" 注释）。无需再动。

**HARNESS-SEC-001（harness checkpoint）= 本次修（PR #247=`c089dfa2b`）**：`harness_checkpoints` 无 owner 列、`PrismaCheckpointStore.save` 硬编码 `scope:Prisma.JsonNull`，`HarnessFacade.resume/fork` 按可枚举 id 加载任意断点零过滤（envelope 含对话/工具结果/产物）。**关键判断：currently 是 defense-in-depth 缺口非活跃 IDOR**——`HarnessFacade.resume/fork` **零生产调用方**、checkpoint 列表端点是 admin-only。所以：

- 加 `owner_user_id` 列+索引（手写迁移 `prisma/migrations/20260609_harness_checkpoint_owner_user_id`）。
- `snapshot()` 捕获 `envelope.memory?.userId`（**坑：userId 在 envelope.memory 下不是 envelope 顶层**；且必须 optional chain——有 spec mock 传无 memory 的 envelope，`.memory.userId` 直接 throw 挂 changedSince 全量跑）。
- store save 落库 + fromRow 回读 ownerUserId。
- `resume/fork` 加**必填** `requestingUserId`，非属主返回 null（null owner=系统/匿名放行）。**因零调用方，必填参数 secure-by-construction 零破坏**——未来谁接 endpoint 被强制传。
- 2 个非属主拒绝 IDOR 证明 spec。

**坑**：①迁移目录日期要 ≥ 现存最新（repo 已有 20260606-08 future-dated，用 20260609 保 deploy 顺序）。②`jest --changedSince`（pre-push step）因 prisma schema 改动 pull 567 套件，envelope.memory throw 才暴露——单 spec isolation 不复现，必跑 changedSince。

**SSRF（rank 2）部分落地**：发现统一 `SsrfGuard`（`ai-engine/safety/security/ssrf/ssrf-guard.ts`，`assertUrlSafe` DNS解析+私网/元数据/loopback IP 拦 + `safeFetch` 逐跳 redirect:manual）**已存在**，content-fetch + webhook **他 session 已接线**。本次（**PR #253=`4af36eea8`**）接 **ENG-002 MCP**：streamable-http MCP client doConnect 加 `assertUrlSafe(url, {allowedPorts:[...,configPort]})`——**端口放行**(MCP 跑任意端口，SSRF 关切是目的 IP 非端口)。3 个真闸门证明 spec(metadata/private/loopback→拒)。**legacy SSE MCP 暂缓**：其单测用 setImmediate emit + connect()，doConnect 内任何新增 `await`(SSRF check)都打乱时序挂 5 测——fragile，单独跟进。坑：MCP 测试连 localhost:3001 被 guard 拦→protocol spec 须 mock assertUrlSafe pass-through(`jest.mock`+requireActual)，真闸门验证放独立无mock spec。social url-validator 是 regex-only 死代码(0消费)跳过。

**剩余安全 backlog（高 ROI，未做）**：SSRF 收尾（SSE MCP fragile 测、proxy/flaresolverr 传 user URL）· 分布式状态→Redis（限流/配额，rank 3）· 统一 append-only 审计表（rank 4）。承接 [[project_mece_w1_execution_2026_06_03]]。
