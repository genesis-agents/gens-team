/**
 * 快照等同测试（L3 W1 零下降保障第 3 层）：
 * 用真实 PolicyConfigService（mock prisma）验证 DB 空 / flag 关时，
 * dual-read 返回值与 quality-thresholds.config 代码常量逐字节相等。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PolicyConfigService } from "../../../../../platform/facade";
import { POLICY_DB_MODULES_ENV } from "../../../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import { WritingQualityPolicyService } from "../writing-quality-policy.service";
import {
  CONTENT_GATE,
  CRITIQUE_REFINE,
  STRUCTURAL_GATE,
} from "../quality-thresholds.config";

describe("WritingQualityPolicyService (快照等同)", () => {
  let service: WritingQualityPolicyService;

  const mockPolicyConfigTable = {
    findFirst: jest.fn(),
  };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WritingQualityPolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(WritingQualityPolicyService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
  });

  it("flag 未开时三组阈值与代码常量同引用（逐字节等同，且不查 DB）", async () => {
    expect(await service.structuralGate()).toBe(STRUCTURAL_GATE);
    expect(await service.contentGate()).toBe(CONTENT_GATE);
    expect(await service.critiqueRefine()).toBe(CRITIQUE_REFINE);
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 开但 DB 空时仍与代码常量同引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "writing";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    expect(await service.structuralGate()).toBe(STRUCTURAL_GATE);
    expect(await service.contentGate()).toBe(CONTENT_GATE);
    expect(await service.critiqueRefine()).toBe(CRITIQUE_REFINE);
  });

  it("flag 开且 DB 有 active 行时返回 DB 值", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "writing";
    const dbValue = { ...CRITIQUE_REFINE, MAX_ITERATIONS: 5 };
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: dbValue,
      version: 2,
      contentHash: "0123456789abcdef",
    });

    const result = await service.critiqueRefine();

    expect(result.MAX_ITERATIONS).toBe(5);
    expect(result.SKIP_THRESHOLD).toBe(CRITIQUE_REFINE.SKIP_THRESHOLD);
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "writing.threshold.critique-refine", isActive: true },
      }),
    );
  });

  it("DB 异常时 fail-open 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "writing";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    expect(await service.contentGate()).toBe(CONTENT_GATE);
  });

  it("DB 行形状不兼容（缺 DIMENSION_WEIGHTS / 数字变字符串）时回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "writing";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { MIN_OVERALL_SCORE: "70" }, // 类型漂移 + 缺其余字段
      version: 2,
      contentHash: "0123456789abcdef",
    });

    expect(await service.contentGate()).toBe(CONTENT_GATE);
  });

  it("DB 行形状兼容但多余键（向前兼容）时正常生效", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "writing";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { ...CRITIQUE_REFINE, MAX_ITERATIONS: 5, futureKnob: true },
      version: 3,
      contentHash: "0123456789abcdef",
    });

    const result = await service.critiqueRefine();
    expect(result.MAX_ITERATIONS).toBe(5);
  });
});
