/**
 * CitationImportPurgeService 单测 —— 存量引用导入的闸门补齐清理
 *
 * 覆盖：谓词命中分类（聚合页/docs/首页）、正常内容不误伤、dryRun 不写库、
 * 实跑时有用户数据的归档而非删除、审计事件落地。
 */

import { CitationImportPurgeService } from "../citation-import-purge.service";

type PrismaMock = {
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  resource: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    updateMany: jest.Mock;
  };
};

function makeService(rows: Array<{ id: string; source_url: string }>) {
  const tx = {
    resource: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma: PrismaMock = {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    resource: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const lifecycle = { recordBatch: jest.fn().mockResolvedValue(undefined) };
  const service = new CitationImportPurgeService(
    prisma as never,
    lifecycle as never,
  );
  return { service, prisma, lifecycle, tx };
}

const AGGREGATOR = {
  id: "r1",
  source_url: "https://www.semanticscholar.org/paper/Scaling/abc",
};
const DOCS = {
  id: "r2",
  source_url: "https://docs.anthropic.com/en/docs/claude-code/security",
};
const HOMEPAGE = { id: "r3", source_url: "https://bair.berkeley.edu/" };
const KEEP = {
  id: "r4",
  source_url: "https://semianalysis.com/p/gpu-shortage",
};

describe("CitationImportPurgeService", () => {
  it("按闸门谓词分类命中，正常内容不进候选", async () => {
    const { service } = makeService([AGGREGATOR, DOCS, HOMEPAGE, KEEP]);
    const summary = await service.purge({ dryRun: true });

    expect(summary.scanned).toBe(4);
    expect(summary.matched).toBe(3);
    expect(summary.byReason).toEqual({
      aggregator: 1,
      docs: 1,
      homepage: 1,
    });
    expect(summary.topDomains).toEqual(
      expect.arrayContaining([
        { domain: "semanticscholar.org", count: 1 },
        { domain: "docs.anthropic.com", count: 1 },
      ]),
    );
    // semianalysis 正文页不在候选里
    expect(
      summary.topDomains.some((d) => d.domain === "semianalysis.com"),
    ).toBe(false);
  });

  it("dryRun：只统计，不写 lifecycle、不进事务", async () => {
    const { service, prisma, lifecycle } = makeService([AGGREGATOR]);
    prisma.resource.findMany
      .mockResolvedValueOnce([
        {
          id: "r1",
          sourceUrl: AGGREGATOR.source_url,
          title: "t",
          type: "REPORT",
        },
      ])
      .mockResolvedValueOnce([]);

    const summary = await service.purge({ dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.deleted).toBe(1);
    expect(summary.archived).toBe(0);
    expect(lifecycle.recordBatch).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("实跑：无用户数据的删除、有 notes/comments 的只归档，且先写审计", async () => {
    const { service, prisma, lifecycle, tx } = makeService([
      AGGREGATOR,
      HOMEPAGE,
    ]);
    prisma.resource.findMany
      // 第一次查 = 可删除（无 notes/comments）
      .mockResolvedValueOnce([
        {
          id: "r1",
          sourceUrl: AGGREGATOR.source_url,
          title: "a",
          type: "REPORT",
        },
      ])
      // 第二次查 = 需归档（有用户数据）
      .mockResolvedValueOnce([
        {
          id: "r3",
          sourceUrl: HOMEPAGE.source_url,
          title: "b",
          type: "REPORT",
        },
      ]);
    tx.resource.deleteMany.mockResolvedValue({ count: 1 });
    tx.resource.updateMany.mockResolvedValue({ count: 1 });

    const summary = await service.purge({ dryRun: false });

    expect(summary.deleted).toBe(1);
    expect(summary.archived).toBe(1);
    expect(lifecycle.recordBatch).toHaveBeenCalledTimes(1);
    const events = lifecycle.recordBatch.mock.calls[0][0];
    expect(events).toEqual([
      expect.objectContaining({
        resourceId: "r1",
        action: "HARD_DELETED",
        reason: "citation-import-gate-purge",
      }),
      expect.objectContaining({ resourceId: "r3", action: "ARCHIVED" }),
    ]);
    // 删除条件二次叠加 notes/comments none（防 select→delete 之间写笔记）
    expect(tx.resource.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["r1"] },
        notes: { none: {} },
        comments: { none: {} },
      },
    });
    expect(tx.resource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["r3"] } },
      data: { linkHealth: "ARCHIVED" },
    });
  });

  it("无命中：不查资源、不写库", async () => {
    const { service, prisma, lifecycle } = makeService([KEEP]);
    const summary = await service.purge({ dryRun: false });

    expect(summary.matched).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(prisma.resource.findMany).not.toHaveBeenCalled();
    expect(lifecycle.recordBatch).not.toHaveBeenCalled();
  });
});
