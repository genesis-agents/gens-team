/**
 * ReportCitationBackfillService 单测 —— 存量报告引用回填
 *
 * 覆盖：白名单重算（存量 65 分分析师源修正后过闸门）/ 强信号类型不被覆盖 /
 * off-load 行跳过 / v1（无 citations）跳过 / dryRun 透传 / limit·missionId 过滤。
 */

import { ReportCitationBackfillService } from "../report-citation-backfill.service";

type PrismaMock = {
  agentPlaygroundMission: { findMany: jest.Mock };
};

function makeService(
  missions: Array<{
    id: string;
    reportFull: unknown;
    reportFullUri?: string | null;
  }>,
  curated: Array<{ domain: string; name: string; credibilityScore: number }> = [
    { domain: "semianalysis.com", name: "SemiAnalysis", credibilityScore: 0.9 },
  ],
) {
  const prisma: PrismaMock = {
    agentPlaygroundMission: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          missions.map((m) => ({ reportFullUri: null, ...m })),
        ),
    },
  };
  const importListener = {
    importCitations: jest.fn().mockResolvedValue({
      imported: 1,
      failed: 0,
      gated: 0,
      capped: 0,
    }),
  };
  const registry = {
    getCuratedDomainScores: jest.fn().mockResolvedValue(curated),
  };
  const service = new ReportCitationBackfillService(
    prisma as never,
    importListener as never,
    registry as never,
  );
  return { service, prisma, importListener, registry };
}

function missionWithCitations(id: string, citations: unknown[]) {
  return { id, reportFull: { citations } };
}

describe("ReportCitationBackfillService", () => {
  it("白名单重算：存量 semianalysis industry/65 修正为 industry/90 再进导入", async () => {
    const { service, importListener } = makeService([
      missionWithCitations("m1", [
        {
          url: "https://semianalysis.com/p/gpu",
          domain: "semianalysis.com",
          sourceType: "industry",
          credibilityScore: 65, // 管道修复前的存量分
        },
      ]),
    ]);
    await service.backfill();
    const [missionId, citations] = importListener.importCitations.mock.calls[0];
    expect(missionId).toBe("m1");
    expect(citations[0]).toMatchObject({
      sourceType: "industry",
      credibilityScore: 90,
    });
  });

  it("强信号类型不被白名单覆盖：arxiv academic/92 保持不变（分取 max）", async () => {
    const { service, importListener } = makeService(
      [
        missionWithCitations("m1", [
          {
            url: "https://arxiv.org/abs/2401.1",
            domain: "arxiv.org",
            sourceType: "academic",
            credibilityScore: 92,
          },
        ]),
      ],
      [{ domain: "arxiv.org", name: "arXiv", credibilityScore: 0.7 }],
    );
    await service.backfill();
    const citations = importListener.importCitations.mock.calls[0][1];
    expect(citations[0]).toMatchObject({
      sourceType: "academic",
      credibilityScore: 92,
    });
  });

  it("白名单未命中：citation 原样透传", async () => {
    const { service, importListener } = makeService([
      missionWithCitations("m1", [
        {
          url: "https://random.example.com/x",
          domain: "random.example.com",
          sourceType: "blog",
          credibilityScore: 50,
        },
      ]),
    ]);
    await service.backfill();
    const citations = importListener.importCitations.mock.calls[0][1];
    expect(citations[0]).toMatchObject({
      sourceType: "blog",
      credibilityScore: 50,
    });
  });

  it("off-load 行（reportFull=null + reportFullUri）跳过并计数；v1 无 citations 跳过", async () => {
    const { service, importListener } = makeService([
      { id: "offloaded", reportFull: null, reportFullUri: "r2://key" },
      { id: "v1", reportFull: { content: "old markdown" } },
      missionWithCitations("m3", [
        {
          url: "https://reuters.com/a",
          sourceType: "news",
          credibilityScore: 85,
        },
      ]),
    ]);
    const summary = await service.backfill();
    expect(summary.missionsScanned).toBe(3);
    expect(summary.offloadedSkipped).toBe(1);
    expect(summary.missionsWithCitations).toBe(1);
    expect(importListener.importCitations).toHaveBeenCalledTimes(1);
    expect(importListener.importCitations.mock.calls[0][0]).toBe("m3");
  });

  it("dryRun 透传给 importCitations，汇总标记 dryRun", async () => {
    const { service, importListener } = makeService([
      missionWithCitations("m1", [
        {
          url: "https://semianalysis.com/p/1",
          domain: "semianalysis.com",
          sourceType: "industry",
          credibilityScore: 65,
        },
      ]),
    ]);
    const summary = await service.backfill({ dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(importListener.importCitations.mock.calls[0][2]).toEqual({
      dryRun: true,
    });
  });

  it("limit 与 missionId 进查询条件", async () => {
    const { service, prisma } = makeService([]);
    await service.backfill({ limit: 50, missionId: "mx" });
    const where = prisma.agentPlaygroundMission.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      where: { status: "completed", reportArtifactVersion: 2, id: "mx" },
      take: 50,
    });
  });

  it("白名单加载失败降级：按存量分继续（不抛错）", async () => {
    const { service, importListener, registry } = makeService([
      missionWithCitations("m1", [
        {
          url: "https://reuters.com/a",
          sourceType: "news",
          credibilityScore: 85,
        },
      ]),
    ]);
    registry.getCuratedDomainScores.mockRejectedValue(new Error("db down"));
    const summary = await service.backfill();
    expect(summary.missionsWithCitations).toBe(1);
    expect(importListener.importCitations).toHaveBeenCalledTimes(1);
  });
});
