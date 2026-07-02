import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PolicyConfigService } from "../policy-config.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { POLICY_DB_MODULES_ENV } from "../abstractions/policy-config.types";

describe("PolicyConfigService", () => {
  let service: PolicyConfigService;

  const mockPolicyConfig = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const mockPrisma = {
    policyConfig: mockPolicyConfig,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ policyConfig: mockPolicyConfig }),
    ),
  };

  const activeRow = {
    value: { template: "db prompt" },
    version: 3,
    contentHash: "abc123def4567890",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(PolicyConfigService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
  });

  // ==================== resolve (dual-read) ====================

  describe("resolve", () => {
    const CODE_FALLBACK = { template: "code prompt", nested: { n: 1 } };

    it("returns code fallback without touching DB when flag env is unset", async () => {
      const result = await service.resolve(
        "insight.prompt.section-writing",
        CODE_FALLBACK,
      );

      expect(result).toEqual({ value: CODE_FALLBACK, source: "code" });
      expect(mockPolicyConfig.findFirst).not.toHaveBeenCalled();
    });

    it("returns code fallback without touching DB when module not in whitelist", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "writing, teams";

      const result = await service.resolve(
        "insight.prompt.section-writing",
        CODE_FALLBACK,
      );

      expect(result.source).toBe("code");
      expect(mockPolicyConfig.findFirst).not.toHaveBeenCalled();
    });

    it("returns code fallback byte-identical when DB has no active row (零下降快照等同)", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "insight";
      mockPolicyConfig.findFirst.mockResolvedValue(null);

      const result = await service.resolve(
        "insight.prompt.section-writing",
        CODE_FALLBACK,
      );

      expect(result.value).toBe(CODE_FALLBACK); // 同一引用，逐字节等同
      expect(result.source).toBe("code");
      expect(result.version).toBeUndefined();
    });

    it("returns DB value with version and hash when active row exists", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "insight";
      mockPolicyConfig.findFirst.mockResolvedValue(activeRow);

      const result = await service.resolve("insight.prompt.section-writing", {
        template: "code prompt",
      });

      expect(result).toEqual({
        value: { template: "db prompt" },
        source: "db",
        version: 3,
        contentHash: "abc123def4567890",
      });
    });

    it("fail-open: returns code fallback when DB throws", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "insight";
      mockPolicyConfig.findFirst.mockRejectedValue(
        new Error("connection refused"),
      );

      const result = await service.resolve(
        "insight.prompt.section-writing",
        CODE_FALLBACK,
      );

      expect(result).toEqual({ value: CODE_FALLBACK, source: "code" });
    });

    it("caches active row within TTL (second resolve hits no DB)", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "insight";
      mockPolicyConfig.findFirst.mockResolvedValue(activeRow);

      await service.resolve("insight.prompt.section-writing", {});
      await service.resolve("insight.prompt.section-writing", {});

      expect(mockPolicyConfig.findFirst).toHaveBeenCalledTimes(1);
    });

    it("caches null result too (DB-empty key not re-queried within TTL)", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "insight";
      mockPolicyConfig.findFirst.mockResolvedValue(null);

      await service.resolve("insight.prompt.section-writing", {});
      await service.resolve("insight.prompt.section-writing", {});

      expect(mockPolicyConfig.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== propose ====================

  describe("propose", () => {
    const validInput = {
      key: "insight.prompt.section-writing",
      kind: "PROMPT" as const,
      value: { template: "new prompt" },
      createdBy: "human:admin@test.com",
      changeReason: "initial migration from prompt-version.ts v3.1",
    };

    it("creates version 1 when key has no rows", async () => {
      mockPolicyConfig.findFirst.mockResolvedValue(null);
      mockPolicyConfig.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: "p1", ...data }),
      );

      const result = await service.propose(validInput);

      expect(result.version).toBe(1);
      expect(mockPolicyConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: validInput.key,
          version: 1,
          kind: "PROMPT",
          changeReason: validInput.changeReason,
        }),
      });
    });

    it("increments version from latest", async () => {
      mockPolicyConfig.findFirst.mockResolvedValue({ version: 4 });
      mockPolicyConfig.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: "p5", ...data }),
      );

      const result = await service.propose(validInput);

      expect(result.version).toBe(5);
    });

    it("stamps sha256 16-hex contentHash of the value", async () => {
      mockPolicyConfig.findFirst.mockResolvedValue(null);
      mockPolicyConfig.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: "p1", ...data }),
      );

      const result = await service.propose(validInput);

      expect(result.contentHash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("retries once on unique-conflict (P2002) and succeeds", async () => {
      mockPolicyConfig.findFirst
        .mockResolvedValueOnce({ version: 1 })
        .mockResolvedValueOnce({ version: 2 });
      const conflict = new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2002",
        clientVersion: "test",
      });
      mockPolicyConfig.create
        .mockRejectedValueOnce(conflict)
        .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: "p3", ...data }),
        );

      const result = await service.propose(validInput);

      expect(result.version).toBe(3);
      expect(mockPolicyConfig.create).toHaveBeenCalledTimes(2);
    });

    it("rejects empty changeReason", async () => {
      await expect(
        service.propose({ ...validInput, changeReason: "  " }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPolicyConfig.create).not.toHaveBeenCalled();
    });

    it("rejects empty createdBy", async () => {
      await expect(
        service.propose({ ...validInput, createdBy: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      "InsightPromptSectionWriting", // 非 kebab-case
      "insight.prompt", // 只有 2 段
      "insight..section", // 空段
      "insight.prompt.Section_Writing", // 大写/下划线
    ])("rejects malformed key %s", async (key) => {
      await expect(service.propose({ ...validInput, key })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ==================== activate / deactivate ====================

  describe("activate", () => {
    it("throws NotFound for missing version", async () => {
      mockPolicyConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.activate("insight.prompt.section-writing", 9, "human:a@b.c"),
      ).rejects.toThrow(NotFoundException);
    });

    it("deactivates previous active rows and activates target in one transaction", async () => {
      mockPolicyConfig.findUnique.mockResolvedValue({ id: "p2", version: 2 });
      mockPolicyConfig.updateMany.mockResolvedValue({ count: 1 });
      mockPolicyConfig.update.mockResolvedValue({
        id: "p2",
        version: 2,
        isActive: true,
      });

      const result = await service.activate(
        "insight.prompt.section-writing",
        2,
        "human:a@b.c",
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPolicyConfig.updateMany).toHaveBeenCalledWith({
        where: { key: "insight.prompt.section-writing", isActive: true },
        data: { isActive: false },
      });
      expect(mockPolicyConfig.update).toHaveBeenCalledWith({
        where: {
          key_version: { key: "insight.prompt.section-writing", version: 2 },
        },
        data: expect.objectContaining({
          isActive: true,
          activatedBy: "human:a@b.c",
        }),
      });
      expect(result.isActive).toBe(true);
    });

    it("invalidates resolve cache after activation", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "insight";
      // 先填缓存
      mockPolicyConfig.findFirst.mockResolvedValue(activeRow);
      await service.resolve("insight.prompt.section-writing", {});
      // activate
      mockPolicyConfig.findUnique.mockResolvedValue({ id: "p4", version: 4 });
      mockPolicyConfig.updateMany.mockResolvedValue({ count: 1 });
      mockPolicyConfig.update.mockResolvedValue({ id: "p4", isActive: true });
      await service.activate("insight.prompt.section-writing", 4, "human:x");
      // 再 resolve 应重新查 DB
      await service.resolve("insight.prompt.section-writing", {});

      expect(mockPolicyConfig.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe("deactivate", () => {
    it("clears active flag and cache (consumers fall back to code)", async () => {
      process.env[POLICY_DB_MODULES_ENV] = "insight";
      mockPolicyConfig.findFirst.mockResolvedValue(activeRow);
      await service.resolve("insight.prompt.section-writing", {});

      mockPolicyConfig.updateMany.mockResolvedValue({ count: 1 });
      await service.deactivate("insight.prompt.section-writing", "human:x");

      mockPolicyConfig.findFirst.mockResolvedValue(null);
      const result = await service.resolve("insight.prompt.section-writing", {
        code: true,
      });

      expect(result.source).toBe("code");
      expect(mockPolicyConfig.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== rollback ====================

  describe("rollback", () => {
    it("copies old value as new version with audited reason, then activates", async () => {
      const oldRow = {
        id: "p1",
        key: "insight.prompt.section-writing",
        version: 1,
        kind: "PROMPT",
        value: { template: "v1 prompt" },
      };
      mockPolicyConfig.findUnique
        .mockResolvedValueOnce(oldRow) // rollback: 读源行
        .mockResolvedValueOnce({ id: "p6", version: 6 }); // activate: 读目标行
      mockPolicyConfig.findFirst.mockResolvedValue({ version: 5 }); // propose: latest
      mockPolicyConfig.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: "p6", ...data }),
      );
      mockPolicyConfig.updateMany.mockResolvedValue({ count: 1 });
      mockPolicyConfig.update.mockResolvedValue({
        id: "p6",
        version: 6,
        isActive: true,
      });

      await service.rollback(
        "insight.prompt.section-writing",
        1,
        "human:a@b.c",
        "v5 degraded eval scores",
      );

      expect(mockPolicyConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 6,
          value: { template: "v1 prompt" },
          changeReason: "rollback to v1: v5 degraded eval scores",
          createdBy: "human:a@b.c",
        }),
      });
      expect(mockPolicyConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            key_version: { key: "insight.prompt.section-writing", version: 6 },
          },
        }),
      );
    });

    it("throws NotFound when source version missing", async () => {
      mockPolicyConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.rollback("insight.prompt.section-writing", 99, "h:x", "r"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== history ====================

  describe("history", () => {
    it("returns all versions newest-first", async () => {
      mockPolicyConfig.findMany.mockResolvedValue([
        { version: 2 },
        { version: 1 },
      ]);

      const rows = await service.history("insight.prompt.section-writing");

      expect(mockPolicyConfig.findMany).toHaveBeenCalledWith({
        where: { key: "insight.prompt.section-writing" },
        orderBy: { version: "desc" },
      });
      expect(rows).toHaveLength(2);
    });
  });
});
