/**
 * 快照等同测试（L3 W1 零下降保障第 3 层）：
 * 用真实 PolicyConfigService（mock prisma）验证 DB 空 / flag 关时，
 * dual-read 返回值与 prompt-locale 代码常量逐字节相等。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PolicyConfigService } from "@/modules/platform/facade";
import { POLICY_DB_MODULES_ENV } from "@/modules/platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  RESEARCH_POLICY_KEYS,
  ResearchStrategyPolicyService,
} from "../research-strategy-policy.service";
import { REFLECTION_PROMPTS, STEP_COUNT_GUIDE } from "../prompt-locale";

describe("ResearchStrategyPolicyService (快照等同)", () => {
  let service: ResearchStrategyPolicyService;

  const mockPolicyConfigTable = {
    findFirst: jest.fn(),
  };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchStrategyPolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(ResearchStrategyPolicyService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
  });

  it("flag 未开时步数指导与代码常量同引用、反思 prompt 逐字节相同（且不查 DB）", async () => {
    expect(await service.planStepCountGuide()).toBe(STEP_COUNT_GUIDE);
    expect(await service.reflectionSystemPrompt("zh-CN")).toBe(
      REFLECTION_PROMPTS["zh-CN"].systemPrompt,
    );
    expect(await service.reflectionSystemPrompt("en-US")).toBe(
      REFLECTION_PROMPTS["en-US"].systemPrompt,
    );
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 开但 DB 空时仍与代码常量逐字节相同", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "research";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    expect(await service.planStepCountGuide()).toBe(STEP_COUNT_GUIDE);
    expect(await service.reflectionSystemPrompt("zh-CN")).toBe(
      REFLECTION_PROMPTS["zh-CN"].systemPrompt,
    );
    expect(await service.reflectionSystemPrompt("en-US")).toBe(
      REFLECTION_PROMPTS["en-US"].systemPrompt,
    );
  });

  it("flag 开且 DB 有 active 行时步数指导返回 DB 值", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "research";
    const dbValue = {
      ...STEP_COUNT_GUIDE,
      "zh-CN": { ...STEP_COUNT_GUIDE["zh-CN"], standard: "4-6 个步骤" },
    };
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: dbValue,
      version: 2,
      contentHash: "0123456789abcdef",
    });

    const result = await service.planStepCountGuide();

    expect(result["zh-CN"].standard).toBe("4-6 个步骤");
    expect(result["en-US"].quick).toBe(STEP_COUNT_GUIDE["en-US"].quick);
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: RESEARCH_POLICY_KEYS.PLAN_STEP_COUNT,
          isActive: true,
        },
      }),
    );
  });

  it("flag 开且 DB 有 active 行时反思 prompt 返回 DB template", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "research";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { template: "DB 覆盖的反思 system prompt" },
      version: 3,
      contentHash: "fedcba9876543210",
    });

    expect(await service.reflectionSystemPrompt("zh-CN")).toBe(
      "DB 覆盖的反思 system prompt",
    );
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: RESEARCH_POLICY_KEYS.REFLECTION_SYSTEM["zh-CN"],
          isActive: true,
        },
      }),
    );
  });

  it("DB 行 value 缺 template 时反思 prompt 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "research";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { wrong: "shape" },
      version: 1,
      contentHash: "0000000000000000",
    });

    expect(await service.reflectionSystemPrompt("en-US")).toBe(
      REFLECTION_PROMPTS["en-US"].systemPrompt,
    );
  });

  it("DB 异常时 fail-open 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "research";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    expect(await service.planStepCountGuide()).toBe(STEP_COUNT_GUIDE);
    expect(await service.reflectionSystemPrompt("zh-CN")).toBe(
      REFLECTION_PROMPTS["zh-CN"].systemPrompt,
    );
  });
});
