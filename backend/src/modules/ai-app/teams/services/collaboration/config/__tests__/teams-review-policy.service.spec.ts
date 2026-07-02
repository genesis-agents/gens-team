/**
 * 快照等同测试（L3 W1 teams 零下降保障）：
 * overlay 未刷新 / flag 关 / DB 空 / value 非法 / DB 异常时，
 * getReviewResultPatterns() 与 REVIEW_RESULT_PATTERNS 代码常量同引用。
 */

import { Test } from "@nestjs/testing";
import { PolicyConfigService } from "@/modules/platform/facade";
import { POLICY_DB_MODULES_ENV } from "@/modules/platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "@/common/prisma/prisma.service";
import { REVIEW_RESULT_PATTERNS } from "../../prompt/prompt-templates";
import { parseReviewResult } from "../../utils/parsing.utils";
import {
  TEAMS_REVIEW_POLICY_KEY,
  TeamsReviewPolicyService,
  __resetTeamsReviewPolicyOverlayForTest,
  getReviewResultPatterns,
} from "../teams-review-policy.service";

describe("TeamsReviewPolicyService (快照等同)", () => {
  const mockPolicyConfigTable = { findFirst: jest.fn() };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };
  let service: TeamsReviewPolicyService;

  const buildService = async (): Promise<TeamsReviewPolicyService> => {
    const module = await Test.createTestingModule({
      providers: [
        TeamsReviewPolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    return module.get(TeamsReviewPolicyService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];
    __resetTeamsReviewPolicyOverlayForTest();
    service = await buildService();
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
    __resetTeamsReviewPolicyOverlayForTest();
  });

  it("overlay 从未刷新时与代码常量同引用（逐字节等同）", () => {
    expect(getReviewResultPatterns()).toBe(REVIEW_RESULT_PATTERNS);
  });

  it("flag 未开时 refresh 不查 DB 且仍同引用", async () => {
    await service.refreshReviewPatternOverlay();

    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
    expect(getReviewResultPatterns()).toBe(REVIEW_RESULT_PATTERNS);
  });

  it("flag 开但 DB 空时仍同引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "teams";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    await service.refreshReviewPatternOverlay();

    expect(getReviewResultPatterns()).toBe(REVIEW_RESULT_PATTERNS);
  });

  it("DB 有 active 行时 overlay 生效（部分覆盖，未覆盖列表回代码常量）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "teams";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: {
        APPROVE_PATTERNS: [{ pattern: "lgtm", weight: 0.9 }],
      },
      version: 2,
      contentHash: "0123456789abcdef",
    });

    await service.refreshReviewPatternOverlay();

    const patterns = getReviewResultPatterns();
    expect(patterns.APPROVE_PATTERNS).toEqual([
      { pattern: "lgtm", weight: 0.9 },
    ]);
    // 未覆盖的列表与 RegExp 回代码常量（同引用）
    expect(patterns.REJECT_PATTERNS).toBe(
      REVIEW_RESULT_PATTERNS.REJECT_PATTERNS,
    );
    expect(patterns.REVISION_NEEDED_PATTERNS).toBe(
      REVIEW_RESULT_PATTERNS.REVISION_NEEDED_PATTERNS,
    );
    expect(patterns.SUBSTANTIVE_FEEDBACK_KEYWORDS).toBe(
      REVIEW_RESULT_PATTERNS.SUBSTANTIVE_FEEDBACK_KEYWORDS,
    );
    expect(patterns.STANDARD_FORMAT).toBe(
      REVIEW_RESULT_PATTERNS.STANDARD_FORMAT,
    );
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: TEAMS_REVIEW_POLICY_KEY, isActive: true },
      }),
    );
    // 同步消费方 parseReviewResult 吃到新措辞（不发版新增通过标记）
    const result = parseReviewResult("lgtm");
    expect(result.isApproved).toBe(true);
    expect(result.matchedPattern).toBe("lgtm");
  });

  it("DB value 形状非法时忽略 overlay（weight 超界），保持代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "teams";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: {
        REJECT_PATTERNS: [{ pattern: "不通过", weight: 2 }],
      },
      version: 1,
      contentHash: "0123456789abcdef",
    });

    await service.refreshReviewPatternOverlay();

    expect(getReviewResultPatterns()).toBe(REVIEW_RESULT_PATTERNS);
  });

  it("DB 异常时 fail-open 回代码常量（不抛出、不阻断审核）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "teams";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    await expect(service.refreshReviewPatternOverlay()).resolves.not.toThrow();
    expect(getReviewResultPatterns()).toBe(REVIEW_RESULT_PATTERNS);
  });

  it("再次 refresh 到 DB 空会清掉旧 overlay（deactivate 生效路径）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "teams";
    mockPolicyConfigTable.findFirst.mockResolvedValueOnce({
      value: { APPROVE_PATTERNS: [{ pattern: "lgtm", weight: 0.9 }] },
      version: 2,
      contentHash: "0123456789abcdef",
    });
    await service.refreshReviewPatternOverlay();
    expect(getReviewResultPatterns()).not.toBe(REVIEW_RESULT_PATTERNS);

    // PolicyConfigService 缓存 60s——用新实例模拟缓存失效后的下一次刷新
    const service2 = await buildService();
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);
    await service2.refreshReviewPatternOverlay();

    expect(getReviewResultPatterns()).toBe(REVIEW_RESULT_PATTERNS);
  });
});
