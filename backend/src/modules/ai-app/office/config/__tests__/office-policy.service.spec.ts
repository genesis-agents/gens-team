/**
 * 快照等同测试（L3 W1 零下降保障第 3 层）：
 * 用真实 PolicyConfigService（mock prisma）验证 DB 空 / flag 关 / DB 异常时，
 * dual-read 返回值与代码常量逐字节相等（同引用）；DB 有 active 行时生效。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PolicyConfigService } from "../../../../platform/facade";
import { POLICY_DB_MODULES_ENV } from "../../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  OfficePolicyService,
  OFFICE_POLICY_KEYS,
  getOfficeStrategy,
  __resetOfficeStrategyOverlaysForTest,
} from "../office-policy.service";
import {
  CONTENT_ANALYSIS_SYSTEM_PROMPT,
  CONTENT_ANALYSIS_USER_PROMPT,
} from "../../content-analysis/content-analysis.prompts";
import {
  SLIDE_DESIGN_SYSTEM_PROMPT,
  SLIDE_DESIGN_SYSTEM_BASE_PROMPT,
} from "../../prompts/slide-design-system.prompt";

/** 代表 sync 阈值消费点的代码常量（与 template-matcher.skill 的 MATCH_WEIGHTS 同形） */
const CODE_WEIGHTS = {
  keywordMatch: 0.3,
  contentCapacity: 0.2,
  narrativePosition: 0.15,
  contextFit: 0.15,
  diversity: 0.1,
  emotionalMatch: 0.1,
};

const CODE_PAGE_DENSITY = {
  MAX_SECTIONS_PER_PAGE: 6,
  MAX_CHARS_PER_PAGE: 800,
};

describe("OfficePolicyService (快照等同)", () => {
  let service: OfficePolicyService;

  const mockPolicyConfigTable = {
    findFirst: jest.fn(),
  };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];
    __resetOfficeStrategyOverlaysForTest();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficePolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(OfficePolicyService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
    __resetOfficeStrategyOverlaysForTest();
  });

  it("flag 未开时 prompt 与代码常量同引用（逐字节等同，且不查 DB）", async () => {
    expect(
      await service.prompt(
        OFFICE_POLICY_KEYS.SLIDE_DESIGN_SYSTEM,
        SLIDE_DESIGN_SYSTEM_PROMPT,
      ),
    ).toBe(SLIDE_DESIGN_SYSTEM_PROMPT);
    expect(
      await service.prompt(
        OFFICE_POLICY_KEYS.SLIDE_DESIGN_SYSTEM_BASE,
        SLIDE_DESIGN_SYSTEM_BASE_PROMPT,
      ),
    ).toBe(SLIDE_DESIGN_SYSTEM_BASE_PROMPT);
    expect(
      await service.prompt(
        OFFICE_POLICY_KEYS.CONTENT_ANALYSIS_SYSTEM,
        CONTENT_ANALYSIS_SYSTEM_PROMPT,
      ),
    ).toBe(CONTENT_ANALYSIS_SYSTEM_PROMPT);
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 未开时 refresh 后 sync getter 与代码常量同引用（且不查 DB）", async () => {
    await service.refreshStrategyOverlays();

    expect(
      getOfficeStrategy(
        OFFICE_POLICY_KEYS.TEMPLATE_MATCH_WEIGHTS,
        CODE_WEIGHTS,
      ),
    ).toBe(CODE_WEIGHTS);
    expect(
      getOfficeStrategy(OFFICE_POLICY_KEYS.PAGE_DENSITY, CODE_PAGE_DENSITY),
    ).toBe(CODE_PAGE_DENSITY);
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 开但 DB 空时仍与代码常量同引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "office";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    expect(
      await service.prompt(
        OFFICE_POLICY_KEYS.CONTENT_ANALYSIS_USER,
        CONTENT_ANALYSIS_USER_PROMPT,
      ),
    ).toBe(CONTENT_ANALYSIS_USER_PROMPT);

    await service.refreshStrategyOverlays();
    expect(
      getOfficeStrategy(
        OFFICE_POLICY_KEYS.TEMPLATE_MATCH_WEIGHTS,
        CODE_WEIGHTS,
      ),
    ).toBe(CODE_WEIGHTS);
  });

  it("flag 开且 DB 有 active 行时 prompt 返回 DB 模板", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "office";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { template: "DB 版内容压缩 prompt" },
      version: 2,
      contentHash: "0123456789abcdef",
    });

    const result = await service.prompt(
      OFFICE_POLICY_KEYS.CONTENT_COMPRESSION_SYSTEM,
      "代码版内容压缩 prompt",
    );

    expect(result).toBe("DB 版内容压缩 prompt");
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: "office.prompt.content-compression-system",
          isActive: true,
        },
      }),
    );
  });

  it("flag 开且 DB 有 active 行时 sync getter 返回 DB 阈值", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "office";
    const dbWeights = { ...CODE_WEIGHTS, keywordMatch: 0.5 };
    mockPolicyConfigTable.findFirst.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === OFFICE_POLICY_KEYS.TEMPLATE_MATCH_WEIGHTS
            ? { value: dbWeights, version: 3, contentHash: "abcd" }
            : null,
        ),
    );

    await service.refreshStrategyOverlays();

    const weights = getOfficeStrategy(
      OFFICE_POLICY_KEYS.TEMPLATE_MATCH_WEIGHTS,
      CODE_WEIGHTS,
    );
    expect(weights.keywordMatch).toBe(0.5);
    // 未覆盖的 key 仍回代码常量
    expect(
      getOfficeStrategy(OFFICE_POLICY_KEYS.PAGE_DENSITY, CODE_PAGE_DENSITY),
    ).toBe(CODE_PAGE_DENSITY);
  });

  it("DB 行形状非法时回代码常量（prompt 缺 template / 阈值缺字段）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "office";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { wrong: "shape" },
      version: 1,
      contentHash: "ffff",
    });

    expect(
      await service.prompt(
        OFFICE_POLICY_KEYS.DATA_EXTRACTION,
        "代码版数据提取 prompt",
      ),
    ).toBe("代码版数据提取 prompt");

    await service.refreshStrategyOverlays();
    expect(
      getOfficeStrategy(
        OFFICE_POLICY_KEYS.TEMPLATE_MATCH_WEIGHTS,
        CODE_WEIGHTS,
      ),
    ).toBe(CODE_WEIGHTS);
  });

  it("DB 异常时 fail-open 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "office";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    expect(
      await service.prompt(
        OFFICE_POLICY_KEYS.SLIDES_AUTO_ROUTER,
        "代码版路由 prompt",
      ),
    ).toBe("代码版路由 prompt");

    await service.refreshStrategyOverlays();
    expect(
      getOfficeStrategy(OFFICE_POLICY_KEYS.PAGE_DENSITY, CODE_PAGE_DENSITY),
    ).toBe(CODE_PAGE_DENSITY);
  });

  it("DB 值被 deactivate 后（DB 空）overlay 清空回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "office";
    const dbDensity = { MAX_SECTIONS_PER_PAGE: 8, MAX_CHARS_PER_PAGE: 1000 };
    mockPolicyConfigTable.findFirst.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === OFFICE_POLICY_KEYS.PAGE_DENSITY
            ? { value: dbDensity, version: 1, contentHash: "aa" }
            : null,
        ),
    );
    await service.refreshStrategyOverlays();
    expect(
      getOfficeStrategy(OFFICE_POLICY_KEYS.PAGE_DENSITY, CODE_PAGE_DENSITY)
        .MAX_SECTIONS_PER_PAGE,
    ).toBe(8);

    // 用新 PolicyConfigService 实例模拟 deactivate 后的下一次 mission
    // （绕开其实例级 60s 解析缓存）
    mockPolicyConfigTable.findFirst.mockReset();
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);
    const freshModule: TestingModule = await Test.createTestingModule({
      providers: [
        OfficePolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    await freshModule.get(OfficePolicyService).refreshStrategyOverlays();
    expect(
      getOfficeStrategy(OFFICE_POLICY_KEYS.PAGE_DENSITY, CODE_PAGE_DENSITY),
    ).toBe(CODE_PAGE_DENSITY);
  });
});
