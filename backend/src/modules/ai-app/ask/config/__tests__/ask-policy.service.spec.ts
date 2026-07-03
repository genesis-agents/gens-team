/**
 * 快照等同测试（L3 W1 零下降保障第 3 层）：
 * 用真实 PolicyConfigService（mock prisma）验证 DB 空 / flag 关时，
 * dual-read 返回值与代码常量逐字节相等（string/array 同引用）。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PolicyConfigService } from "../../../../platform/facade";
import { POLICY_DB_MODULES_ENV } from "../../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  AskPolicyService,
  ASK_POLICY_KEYS,
  DEFAULT_DEBATE_ROUNDS,
} from "../ask-policy.service";
import {
  ASK_BASE_SYSTEM_PROMPT,
  ASK_RESPONSE_GUIDELINES,
  RESPONSE_REQUIREMENTS,
} from "../../prompts/ask-system.prompt";
import { PROJECT_KEYWORDS } from "../../constants/project-context";

describe("AskPolicyService (快照等同)", () => {
  let service: AskPolicyService;

  const mockPolicyConfigTable = {
    findFirst: jest.fn(),
  };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AskPolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AskPolicyService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
  });

  it("flag 未开时 5 项策略与代码常量同引用（逐字节等同，且不查 DB）", async () => {
    expect(await service.baseSystemPrompt()).toBe(ASK_BASE_SYSTEM_PROMPT);
    expect(await service.responseGuidelines()).toBe(ASK_RESPONSE_GUIDELINES);
    expect(await service.responseRequirements()).toBe(RESPONSE_REQUIREMENTS);
    expect(await service.projectKeywords()).toBe(PROJECT_KEYWORDS);
    expect(await service.debateDefaultRounds()).toBe(DEFAULT_DEBATE_ROUNDS);
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 开但 DB 空时仍与代码常量同引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "ask";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    expect(await service.baseSystemPrompt()).toBe(ASK_BASE_SYSTEM_PROMPT);
    expect(await service.responseGuidelines()).toBe(ASK_RESPONSE_GUIDELINES);
    expect(await service.responseRequirements()).toBe(RESPONSE_REQUIREMENTS);
    expect(await service.projectKeywords()).toBe(PROJECT_KEYWORDS);
    expect(await service.debateDefaultRounds()).toBe(DEFAULT_DEBATE_ROUNDS);
  });

  it("flag 开且 DB 有 active 行时返回 DB 值（prompt {template} 形状）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "ask";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { template: "你是一个更好的助手。" },
      version: 2,
      contentHash: "0123456789abcdef",
    });

    expect(await service.baseSystemPrompt()).toBe("你是一个更好的助手。");
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: ASK_POLICY_KEYS.BASE_SYSTEM, isActive: true },
      }),
    );
  });

  it("flag 开且 DB 有 active 行时返回 DB 值（string[] 逐元素比对）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "ask";
    const dbList = ["1. 只用英文回答", "2. 回答不超过 100 字"];
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: dbList,
      version: 3,
      contentHash: "abcdef0123456789",
    });

    const result = await service.responseRequirements();
    expect(result).toHaveLength(dbList.length);
    dbList.forEach((item, i) => expect(result[i]).toBe(item));
  });

  it("flag 开且 DB 有 active 行时返回 DB 值（number 阈值）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "ask";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: 5,
      version: 2,
      contentHash: "fedcba9876543210",
    });

    expect(await service.debateDefaultRounds()).toBe(5);
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: ASK_POLICY_KEYS.DEBATE_DEFAULT_ROUNDS,
          isActive: true,
        },
      }),
    );
  });

  it("DB 行 value 形状非法时回代码常量（缺 template / 非数组 / 非正整数）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "ask";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { wrong: "shape" },
      version: 2,
      contentHash: "0000000000000000",
    });

    expect(await service.baseSystemPrompt()).toBe(ASK_BASE_SYSTEM_PROMPT);
    expect(await service.responseRequirements()).toBe(RESPONSE_REQUIREMENTS);
    expect(await service.projectKeywords()).toBe(PROJECT_KEYWORDS);
    expect(await service.debateDefaultRounds()).toBe(DEFAULT_DEBATE_ROUNDS);
  });

  it("DB 异常时 fail-open 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "ask";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    expect(await service.baseSystemPrompt()).toBe(ASK_BASE_SYSTEM_PROMPT);
    expect(await service.responseGuidelines()).toBe(ASK_RESPONSE_GUIDELINES);
    expect(await service.responseRequirements()).toBe(RESPONSE_REQUIREMENTS);
    expect(await service.projectKeywords()).toBe(PROJECT_KEYWORDS);
    expect(await service.debateDefaultRounds()).toBe(DEFAULT_DEBATE_ROUNDS);
  });
});
