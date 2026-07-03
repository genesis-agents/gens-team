/**
 * 快照等同测试（L3 W1 零下降保障第 3 层）：
 * 用真实 PolicyConfigService（mock prisma）验证 DB 空 / flag 关 / DB 异常时，
 * dual-read 返回值与 simulation-policy.config 代码常量逐字节相等。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PolicyConfigService } from "../../../../platform/facade";
import { POLICY_DB_MODULES_ENV } from "../../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  SIMULATION_POLICY_KEYS,
  SimulationPolicyService,
} from "../simulation-policy.service";
import {
  AGENT_ROUND_PROMPT,
  AGENT_SYSTEM_PROMPT_TEMPLATE,
  BLACK_SWAN_EVENTS,
  COMPANY_METRICS_BY_TYPE,
  COMPANY_METRICS_SYSTEM_PROMPT,
  INDUSTRY_ANALYSIS_SYSTEM_PROMPT,
  INDUSTRY_ANALYSIS_USER_PROMPT,
  INDUSTRY_MODIFIERS,
  SUGGEST_PARAMS_HEURISTICS,
  TEAM_ROLE_PROMPTS,
} from "../simulation-policy.config";

describe("SimulationPolicyService (快照等同)", () => {
  let service: SimulationPolicyService;

  const mockPolicyConfigTable = {
    findFirst: jest.fn(),
  };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };

  const expectAllCodeConstants = async () => {
    expect(await service.blackSwanEvents()).toBe(BLACK_SWAN_EVENTS);

    const agentPrompts = await service.agentPromptPolicy();
    expect(agentPrompts.systemTemplate).toBe(AGENT_SYSTEM_PROMPT_TEMPLATE);
    expect(agentPrompts.teamRoles).toBe(TEAM_ROLE_PROMPTS);
    expect(agentPrompts.round).toBe(AGENT_ROUND_PROMPT);

    expect(await service.companyMetricsTemplates()).toBe(
      COMPANY_METRICS_BY_TYPE,
    );
    expect(await service.industryModifiers()).toBe(INDUSTRY_MODIFIERS);
    expect(await service.industryAnalysisSystemPrompt()).toBe(
      INDUSTRY_ANALYSIS_SYSTEM_PROMPT,
    );
    expect(await service.industryAnalysisUserPrompt()).toBe(
      INDUSTRY_ANALYSIS_USER_PROMPT,
    );
    expect(await service.companyMetricsSystemPrompt()).toBe(
      COMPANY_METRICS_SYSTEM_PROMPT,
    );
    expect(await service.suggestParamsHeuristics()).toBe(
      SUGGEST_PARAMS_HEURISTICS,
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulationPolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(SimulationPolicyService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
  });

  it("flag 未开时全部策略与代码常量同引用（逐字节等同，且不查 DB）", async () => {
    await expectAllCodeConstants();
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 开但 DB 空时仍与代码常量同引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "simulation";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    await expectAllCodeConstants();
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalled();
  });

  it("flag 开且 DB 有 active 行时返回 DB 值（阈值类）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "simulation";
    const dbValue = {
      ...SUGGEST_PARAMS_HEURISTICS,
      baseline: { ...SUGGEST_PARAMS_HEURISTICS.baseline, chaosProb: 0.4 },
    };
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: dbValue,
      version: 2,
      contentHash: "0123456789abcdef",
    });

    const result = await service.suggestParamsHeuristics();

    expect(result.baseline.chaosProb).toBe(0.4);
    expect(result.baseline.rounds).toBe(
      SUGGEST_PARAMS_HEURISTICS.baseline.rounds,
    );
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: SIMULATION_POLICY_KEYS.SUGGEST_PARAMS_HEURISTICS,
          isActive: true,
        },
      }),
    );
  });

  it("flag 开且 DB 有 active 行时返回 DB 值（prompt 模板类）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "simulation";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { template: "DB 覆盖的行业分析 system prompt" },
      version: 3,
      contentHash: "fedcba9876543210",
    });

    expect(await service.industryAnalysisSystemPrompt()).toBe(
      "DB 覆盖的行业分析 system prompt",
    );
  });

  it("prompt 模板类 DB 行 value 形状不对（缺 template）时回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "simulation";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { wrongShape: true },
      version: 2,
      contentHash: "0123456789abcdef",
    });

    expect(await service.industryAnalysisSystemPrompt()).toBe(
      INDUSTRY_ANALYSIS_SYSTEM_PROMPT,
    );
  });

  it("DB 异常时 fail-open 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "simulation";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    await expectAllCodeConstants();
  });
});
