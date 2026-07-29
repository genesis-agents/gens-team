import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { RadarSourceService } from "../radar-source.service";
import { PrismaService } from "../../../../../../../common/prisma/prisma.service";
import { RadarTopicService } from "../../topic/radar-topic.service";
import { CollectorRouter } from "../../collectors/collector-router.service";

const mockTopic = {
  id: "topic-1",
  userId: "user-1",
  title: "Test",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  radarSource: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockTopics = {
  getOwnedById: jest.fn().mockResolvedValue(mockTopic),
};

const mockCollectorRouter = {
  fanOut: jest.fn().mockResolvedValue([]),
};

describe("RadarSourceService", () => {
  let service: RadarSourceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RadarSourceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RadarTopicService, useValue: mockTopics },
        { provide: CollectorRouter, useValue: mockCollectorRouter },
      ],
    }).compile();
    service = module.get<RadarSourceService>(RadarSourceService);
  });

  describe("create", () => {
    it("writes isPublicSource=true for a plain RSS URL with no auth", async () => {
      const fakeSource = { id: "src-1", isPublicSource: true };
      mockPrisma.radarSource.create.mockResolvedValue(fakeSource);

      await service.create("user-1", "topic-1", {
        type: "RSS" as never,
        identifier: "https://feeds.arstechnica.com/arstechnica/index",
        enabled: true,
      });

      expect(mockPrisma.radarSource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPublicSource: true }),
        }),
      );
    });

    it("writes isPublicSource=false for an RSS URL with basic auth credentials", async () => {
      const fakeSource = { id: "src-2", isPublicSource: false };
      mockPrisma.radarSource.create.mockResolvedValue(fakeSource);

      await service.create("user-1", "topic-1", {
        type: "RSS" as never,
        identifier: "https://user:secret@internal.example.com/feed",
        enabled: true,
      });

      expect(mockPrisma.radarSource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPublicSource: false }),
        }),
      );
    });

    it("passes authorityWeight through to prisma when provided", async () => {
      mockPrisma.radarSource.create.mockResolvedValue({ id: "src-3" });

      await service.create("user-1", "topic-1", {
        type: "RSS" as never,
        identifier: "https://stratechery.com/feed/",
        authorityWeight: 5,
      });

      expect(mockPrisma.radarSource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ authorityWeight: 5 }),
        }),
      );
    });

    it("leaves authorityWeight undefined so prisma applies @default(3)", async () => {
      mockPrisma.radarSource.create.mockResolvedValue({ id: "src-4" });

      await service.create("user-1", "topic-1", {
        type: "RSS" as never,
        identifier: "https://semianalysis.com/feed/",
      });

      const arg = mockPrisma.radarSource.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(arg.data.authorityWeight).toBeUndefined();
    });
  });

  describe("update", () => {
    it("writes authorityWeight when provided", async () => {
      mockPrisma.radarSource.findUnique.mockResolvedValue({
        id: "src-1",
        topic: { userId: "user-1" },
      });
      mockPrisma.radarSource.update.mockResolvedValue({ id: "src-1" });

      await service.update("user-1", "src-1", { authorityWeight: 4 });

      expect(mockPrisma.radarSource.update).toHaveBeenCalledWith({
        where: { id: "src-1" },
        data: { authorityWeight: 4 },
      });
    });

    it("omits authorityWeight from the update payload when absent", async () => {
      mockPrisma.radarSource.findUnique.mockResolvedValue({
        id: "src-1",
        topic: { userId: "user-1" },
      });
      mockPrisma.radarSource.update.mockResolvedValue({ id: "src-1" });

      await service.update("user-1", "src-1", { enabled: false });

      expect(mockPrisma.radarSource.update).toHaveBeenCalledWith({
        where: { id: "src-1" },
        data: { enabled: false },
      });
    });
  });

  /**
   * bulkCreate 是 AI accept 与手工批量导入的唯一实现，两条路径只差
   * opts.isAiRecommended，所以下面同时锁定"手工导入不被标成 AI 推荐"。
   */
  describe("bulkCreate", () => {
    const rssA = {
      type: "RSS" as never,
      identifier: "https://stratechery.com/feed/",
      label: "Stratechery",
      authorityWeight: 5,
    };
    const rssB = {
      type: "RSS" as never,
      identifier: "https://semianalysis.com/feed/",
    };

    function dataOf(callIndex: number): Record<string, unknown> {
      const arg = mockPrisma.radarSource.create.mock.calls[callIndex][0] as {
        data: Record<string, unknown>;
      };
      return arg.data;
    }

    it("creates every reachable source with isAiRecommended=false for 手工导入", async () => {
      mockCollectorRouter.fanOut.mockResolvedValue([
        { type: "RSS" },
        { type: "RSS" },
      ]);
      mockPrisma.radarSource.create
        .mockResolvedValueOnce({ id: "src-1" })
        .mockResolvedValueOnce({ id: "src-2" });

      const res = await service.bulkCreate("user-1", "topic-1", [rssA, rssB], {
        isAiRecommended: false,
      });

      expect(res.created).toHaveLength(2);
      expect(res.skipped).toEqual([]);
      expect(dataOf(0)).toMatchObject({
        identifier: rssA.identifier,
        label: "Stratechery",
        authorityWeight: 5,
        enabled: true,
        isAiRecommended: false,
      });
      // 未传 authorityWeight → 留 undefined 走 Prisma @default(3)
      expect(dataOf(1).authorityWeight).toBeUndefined();
    });

    it("marks isAiRecommended=true when called from the accept path", async () => {
      mockCollectorRouter.fanOut.mockResolvedValue([{ type: "RSS" }]);
      mockPrisma.radarSource.create.mockResolvedValue({ id: "src-1" });

      await service.bulkCreate("user-1", "topic-1", [rssB], {
        isAiRecommended: true,
      });

      expect(dataOf(0).isAiRecommended).toBe(true);
    });

    it("keeps creating the rest when one source fails shape / preflight / P2002", async () => {
      const badShape = { type: "RSS" as never, identifier: "not-a-url" };
      const unreachable = {
        type: "RSS" as never,
        identifier: "https://dead.example.com/feed",
      };
      const duplicate = {
        type: "RSS" as never,
        identifier: "https://dup.example.com/feed",
      };
      // shape 校验在 fanOut 之前，所以 fanOut 只拿到后 3 条
      mockCollectorRouter.fanOut.mockResolvedValue([
        { type: "RSS", error: "404 Not Found" },
        { type: "RSS" },
        { type: "RSS" },
      ]);
      mockPrisma.radarSource.create
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError("dup", {
            code: "P2002",
            clientVersion: "test",
          }),
        )
        .mockResolvedValueOnce({ id: "src-1" });

      const res = await service.bulkCreate(
        "user-1",
        "topic-1",
        [badShape, unreachable, duplicate, rssA],
        { isAiRecommended: false },
      );

      expect(res.created).toEqual([{ id: "src-1" }]);
      expect(res.skipped).toEqual([
        expect.objectContaining({ identifier: "not-a-url" }),
        expect.objectContaining({
          identifier: unreachable.identifier,
          reason: "404 Not Found",
        }),
        expect.objectContaining({
          identifier: duplicate.identifier,
          reason: "已存在同 type+identifier 数据源",
        }),
      ]);
    });

    it("rethrows non-P2002 prisma errors instead of swallowing them into skipped", async () => {
      mockCollectorRouter.fanOut.mockResolvedValue([{ type: "RSS" }]);
      mockPrisma.radarSource.create.mockRejectedValue(new Error("db down"));

      await expect(
        service.bulkCreate("user-1", "topic-1", [rssB], {
          isAiRecommended: false,
        }),
      ).rejects.toThrow("db down");
    });
  });
});
