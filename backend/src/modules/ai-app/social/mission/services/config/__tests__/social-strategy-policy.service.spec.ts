/**
 * 快照等同测试（L3 W1 零下降保障第 3 层）：
 * 用真实 PolicyConfigService（mock prisma）验证 DB 空 / flag 关时，
 * dual-read 返回值与代码常量逐字节相等（string/number 为同引用或同值）。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PolicyConfigService } from "@/modules/platform/facade";
import { POLICY_DB_MODULES_ENV } from "@/modules/platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  CONTENT_OVERFLOW_THRESHOLD,
  FORBIDDEN_WORDS,
  SOCIAL_POLICY_KEYS,
  SocialStrategyPolicyService,
  TITLE_OVERFLOW_THRESHOLD,
} from "../social-strategy-policy.service";
import {
  BILINGUAL_FORMAT_GUIDE,
  WECHAT_ARTICLE_SYSTEM_PROMPT,
  XIAOHONGSHU_NOTE_BILINGUAL_ADDENDUM,
  XIAOHONGSHU_NOTE_SYSTEM_PROMPT,
} from "../../../skills/social-transformer.prompt";
import {
  WECHAT_ADAPTATION_SYSTEM_PROMPT,
  XIAOHONGSHU_ADAPTATION_SYSTEM_PROMPT,
} from "../../../skills/social-version.prompt";

describe("SocialStrategyPolicyService (快照等同)", () => {
  let service: SocialStrategyPolicyService;

  const mockPolicyConfigTable = {
    findFirst: jest.fn(),
  };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };

  const expectAllCodeConstants = async () => {
    expect(await service.wechatArticleSystemPrompt()).toBe(
      WECHAT_ARTICLE_SYSTEM_PROMPT,
    );
    expect(await service.xiaohongshuNoteSystemPrompt()).toBe(
      XIAOHONGSHU_NOTE_SYSTEM_PROMPT,
    );
    expect(await service.bilingualFormatGuide()).toBe(BILINGUAL_FORMAT_GUIDE);
    expect(await service.xiaohongshuNoteBilingualAddendum()).toBe(
      XIAOHONGSHU_NOTE_BILINGUAL_ADDENDUM,
    );
    expect(await service.wechatAdaptationSystemPrompt()).toBe(
      WECHAT_ADAPTATION_SYSTEM_PROMPT,
    );
    expect(await service.xiaohongshuAdaptationSystemPrompt()).toBe(
      XIAOHONGSHU_ADAPTATION_SYSTEM_PROMPT,
    );
    expect(await service.contentOverflowThreshold()).toBe(
      CONTENT_OVERFLOW_THRESHOLD,
    );
    expect(await service.titleOverflowThreshold()).toBe(
      TITLE_OVERFLOW_THRESHOLD,
    );
    expect(await service.forbiddenWords()).toBe(FORBIDDEN_WORDS);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialStrategyPolicyService,
        PolicyConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(SocialStrategyPolicyService);
  });

  afterAll(() => {
    delete process.env[POLICY_DB_MODULES_ENV];
  });

  it("flag 未开时全部策略与代码常量同引用（逐字节等同，且不查 DB）", async () => {
    await expectAllCodeConstants();
    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
  });

  it("flag 开但 DB 空时仍与代码常量同引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "social";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    await expectAllCodeConstants();
  });

  it("flag 开且 DB 有 active 行时 prompt 用 DB 模板", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "social";
    const dbTemplate = "DB 版微信文章 prompt\n### 3. 结尾部分\n结束语";
    mockPolicyConfigTable.findFirst.mockResolvedValue({
      value: { template: dbTemplate },
      version: 2,
      contentHash: "0123456789abcdef",
    });

    expect(await service.wechatArticleSystemPrompt()).toBe(dbTemplate);
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: SOCIAL_POLICY_KEYS.WECHAT_ARTICLE_SYSTEM,
          isActive: true,
        },
      }),
    );
  });

  it("flag 开且 DB 有 active 行时阈值/违禁词用 DB 值", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "social";
    mockPolicyConfigTable.findFirst
      .mockResolvedValueOnce({
        value: { ratio: 1.35 },
        version: 3,
        contentHash: "aaaa000011112222",
      })
      .mockResolvedValueOnce({
        value: ["违禁词A", "违禁词B"],
        version: 1,
        contentHash: "bbbb000011112222",
      });

    expect(await service.contentOverflowThreshold()).toBe(1.35);
    expect(await service.forbiddenWords()).toEqual(["违禁词A", "违禁词B"]);
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: SOCIAL_POLICY_KEYS.FORBIDDEN_WORDS, isActive: true },
      }),
    );
  });

  it("DB 异常时 fail-open 回代码常量", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "social";
    mockPolicyConfigTable.findFirst.mockRejectedValue(new Error("db down"));

    await expectAllCodeConstants();
  });

  it("DB 行 value 形状非法时回代码常量（prompt 缺 template / ratio 非正数 / 违禁词非 string[]）", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "social";

    mockPolicyConfigTable.findFirst.mockResolvedValueOnce({
      value: { wrong: "shape" },
      version: 1,
      contentHash: "cccc000011112222",
    });
    expect(await service.xiaohongshuNoteSystemPrompt()).toBe(
      XIAOHONGSHU_NOTE_SYSTEM_PROMPT,
    );

    mockPolicyConfigTable.findFirst.mockResolvedValueOnce({
      value: { ratio: -1 },
      version: 1,
      contentHash: "dddd000011112222",
    });
    expect(await service.titleOverflowThreshold()).toBe(
      TITLE_OVERFLOW_THRESHOLD,
    );

    mockPolicyConfigTable.findFirst.mockResolvedValueOnce({
      value: ["ok", 42],
      version: 1,
      contentHash: "eeee000011112222",
    });
    expect(await service.forbiddenWords()).toBe(FORBIDDEN_WORDS);
  });

  it("锚点契约：wechat-article prompt 必须含 '### 3. 结尾部分'（双语 guide 注入点）", () => {
    // content-transformer.service 靠此锚点 replace 注入 BILINGUAL_FORMAT_GUIDE；
    // DB 覆盖版 prompt 同样必须保留该锚点，否则双语样式静默丢失
    expect(WECHAT_ARTICLE_SYSTEM_PROMPT).toContain("### 3. 结尾部分");
  });
});
