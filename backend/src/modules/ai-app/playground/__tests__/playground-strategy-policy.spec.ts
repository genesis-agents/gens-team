/**
 * 快照等同测试（L3 W1 批 2c 零下降保障）：
 * overlay 未刷新 / DB 空 / flag 关 / value 非法时，策略阈值与
 * loadPlaygroundRuntimeConfig()（DEFAULTS → profile → env）逐字节相等。
 */

import { Test } from "@nestjs/testing";
import { PolicyConfigService } from "../../../platform/facade";
import { POLICY_DB_MODULES_ENV } from "../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { loadPlaygroundRuntimeConfig } from "../runtime/playground-runtime.config";
import {
  PLAYGROUND_STRATEGY_POLICY_KEY,
  __resetPlaygroundStrategyOverlayForTest,
  getPlaygroundStrategyThresholds,
  refreshPlaygroundStrategyOverlay,
} from "../runtime/playground-strategy-policy";

describe("playground-strategy-policy (快照等同)", () => {
  const mockPolicyConfigTable = { findFirst: jest.fn() };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };
  let policyConfig: PolicyConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];
    __resetPlaygroundStrategyOverlayForTest();

    const module = await Test.createTestingModule({
      providers: [
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    policyConfig = module.get(PolicyConfigService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
    __resetPlaygroundStrategyOverlayForTest();
  });

  it("overlay 从未刷新时与 runtime config 逐字节相等", () => {
    const base = loadPlaygroundRuntimeConfig();
    const t = getPlaygroundStrategyThresholds();

    expect(t.minFindingsThreshold).toBe(base.minFindingsThreshold);
    expect(t.chapterToleranceRatio).toBe(base.chapterToleranceRatio);
  });

  it("flag 关时 refresh 不查 DB 且行为不变", async () => {
    await refreshPlaygroundStrategyOverlay(policyConfig);

    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
    const base = loadPlaygroundRuntimeConfig();
    expect(getPlaygroundStrategyThresholds().minFindingsThreshold).toBe(
      base.minFindingsThreshold,
    );
  });

  it("flag 开但 DB 空时行为不变", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    await refreshPlaygroundStrategyOverlay(policyConfig);

    const base = loadPlaygroundRuntimeConfig();
    const t = getPlaygroundStrategyThresholds();
    expect(t.minFindingsThreshold).toBe(base.minFindingsThreshold);
    expect(t.chapterToleranceRatio).toBe(base.chapterToleranceRatio);
  });

  it("DB 有 active 行时 overlay 生效（部分覆盖，未覆盖旋钮回 env/profile）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { minFindingsThreshold: 8 },
      version: 3,
      contentHash: "0123456789abcdef",
    });

    await refreshPlaygroundStrategyOverlay(policyConfig);

    const base = loadPlaygroundRuntimeConfig();
    const t = getPlaygroundStrategyThresholds();
    expect(t.minFindingsThreshold).toBe(8);
    expect(t.chapterToleranceRatio).toBe(base.chapterToleranceRatio);
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: PLAYGROUND_STRATEGY_POLICY_KEY, isActive: true },
      }),
    );
  });

  it("DB value 形状非法时忽略 overlay（负数/超界），保持现状", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { minFindingsThreshold: -1, chapterToleranceRatio: 2 },
      version: 1,
      contentHash: "0123456789abcdef",
    });

    await refreshPlaygroundStrategyOverlay(policyConfig);

    const base = loadPlaygroundRuntimeConfig();
    const t = getPlaygroundStrategyThresholds();
    expect(t.minFindingsThreshold).toBe(base.minFindingsThreshold);
    expect(t.chapterToleranceRatio).toBe(base.chapterToleranceRatio);
  });

  it("再次 refresh 到 DB 空会清掉旧 overlay（deactivate 生效路径）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    mockPolicyConfigTable.findFirst.mockResolvedValueOnce({
      value: { minFindingsThreshold: 8 },
      version: 3,
      contentHash: "0123456789abcdef",
    });
    await refreshPlaygroundStrategyOverlay(policyConfig);
    expect(getPlaygroundStrategyThresholds().minFindingsThreshold).toBe(8);

    // PolicyConfigService 缓存 60s——用新实例模拟缓存失效后的下一次 mission 启动
    const module2 = await Test.createTestingModule({
      providers: [
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);
    await refreshPlaygroundStrategyOverlay(module2.get(PolicyConfigService));

    expect(getPlaygroundStrategyThresholds().minFindingsThreshold).toBe(
      loadPlaygroundRuntimeConfig().minFindingsThreshold,
    );
  });
});
