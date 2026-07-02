/**
 * 快照等同测试（L3 W1 零下降保障第 3 层）：
 * 用真实 PolicyConfigService（mock prisma）验证 DB 空 / flag 关时，
 * dual-read 返回的 prompt 模板与代码常量同引用（逐字节相等）。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PolicyConfigService } from "../../../../platform/facade";
import { POLICY_DB_MODULES_ENV } from "../../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { InsightPromptPolicyService } from "../insight-prompt-policy.service";
import {
  DIMENSION_RESEARCH_SYSTEM_PROMPT,
  SECTION_WRITING_SYSTEM_PROMPT,
} from "../dimension-research.prompt";
import { REPORT_SYNTHESIS_SYSTEM_PROMPT } from "../report-synthesis.prompt";
import { REPORT_EDITING_SYSTEM_PROMPT } from "../report-editing.prompt";

describe("InsightPromptPolicyService (快照等同)", () => {
  let service: InsightPromptPolicyService;

  const mockPolicyConfigTable = {
    findFirst: jest.fn(),
  };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightPromptPolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(InsightPromptPolicyService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
  });

  it("flag 未开时 4 个模板与代码常量同引用（且不查 DB）", async () => {
    expect(await service.dimensionResearch()).toBe(
      DIMENSION_RESEARCH_SYSTEM_PROMPT,
    );
    expect(await service.sectionWriting()).toBe(SECTION_WRITING_SYSTEM_PROMPT);
    expect(await service.reportSynthesis()).toBe(
      REPORT_SYNTHESIS_SYSTEM_PROMPT,
    );
    expect(await service.reportEditing()).toBe(REPORT_EDITING_SYSTEM_PROMPT);
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 开但 DB 空时仍与代码常量同引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "insight";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    expect(await service.sectionWriting()).toBe(SECTION_WRITING_SYSTEM_PROMPT);
    expect(await service.reportEditing()).toBe(REPORT_EDITING_SYSTEM_PROMPT);
  });

  it("flag 开且 DB 有 active 行时返回 DB 模板", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "insight";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { template: "DB 覆盖的 prompt 模板" },
      version: 2,
      contentHash: "0123456789abcdef",
    });

    expect(await service.sectionWriting()).toBe("DB 覆盖的 prompt 模板");
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "insight.prompt.section-writing", isActive: true },
      }),
    );
  });

  it("DB 行 value 形状不对（缺 template）时回代码常量，防止 undefined 注入", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "insight";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { wrongShape: true },
      version: 1,
      contentHash: "0123456789abcdef",
    });

    expect(await service.reportSynthesis()).toBe(
      REPORT_SYNTHESIS_SYSTEM_PROMPT,
    );
  });

  it("DB 异常时 fail-open 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "insight";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    expect(await service.dimensionResearch()).toBe(
      DIMENSION_RESEARCH_SYSTEM_PROMPT,
    );
  });
});
