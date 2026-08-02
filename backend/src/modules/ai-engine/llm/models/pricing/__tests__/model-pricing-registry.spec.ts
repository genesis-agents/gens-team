import { ModelPricingRegistry } from "../model-pricing.registry";

describe("ModelPricingRegistry", () => {
  function make() {
    // Pass undefined prisma (optional) — test mode only
    return new ModelPricingRegistry(undefined);
  }

  describe("register / get", () => {
    it("registers and retrieves a model", () => {
      const reg = make();
      reg.register({
        modelId: "gpt-4o",
        tier: "strong",
        inputPricePerM: 5,
        outputPricePerM: 15,
      });
      const p = reg.get("gpt-4o");
      expect(p).not.toBeNull();
      expect(p!.tier).toBe("strong");
    });

    it("returns null for unregistered model", () => {
      expect(make().get("unknown")).toBeNull();
    });

    it("does not duplicate modelId in tier list", () => {
      const reg = make();
      reg.register({
        modelId: "gpt-4o",
        tier: "strong",
        inputPricePerM: 5,
        outputPricePerM: 15,
      });
      reg.register({
        modelId: "gpt-4o",
        tier: "strong",
        inputPricePerM: 6,
        outputPricePerM: 16,
      });
      const list = reg.list();
      expect(list.filter((m) => m.modelId === "gpt-4o").length).toBe(1);
    });
  });

  describe("estimateCost", () => {
    it("calculates cost correctly", () => {
      const reg = make();
      reg.register({
        modelId: "m1",
        tier: "standard",
        inputPricePerM: 1,
        outputPricePerM: 2,
      });
      // 500k input tokens + 200k output tokens
      const cost = reg.estimateCost("m1", 500_000, 200_000);
      expect(cost).toBeCloseTo(0.5 + 0.4); // 0.9
    });

    it("returns null for unknown model (no silent zero)", () => {
      const reg = make();
      const cost = reg.estimateCost("unknown", 1000, 500);
      expect(cost).toBeNull();
    });

    it("calculates with cacheRead tokens", () => {
      const reg = make();
      reg.register({
        modelId: "m1",
        tier: "strong",
        inputPricePerM: 10,
        outputPricePerM: 20,
        cacheReadPricePerM: 1,
      });
      // 1000 prompt, 100 cache-read, 500 completion
      const cost = reg.estimateCost("m1", 1000, 500, 100);
      // netInput = 900, output = 500, cacheRead = 100
      const expected = (900 / 1e6) * 10 + (500 / 1e6) * 20 + (100 / 1e6) * 1;
      expect(cost).toBeCloseTo(expected);
    });

    it("calculates with cacheWrite tokens", () => {
      const reg = make();
      reg.register({
        modelId: "claude-3-5",
        tier: "strong",
        inputPricePerM: 3,
        outputPricePerM: 15,
        cacheReadPricePerM: 0.3,
        cacheWritePricePerM: 3.75,
      });
      // 1000 prompt, 200 cache-read, 100 cache-write, 500 completion
      const cost = reg.estimateCost("claude-3-5", 1000, 500, 200, 100);
      // netInput = 1000 - 200 = 800
      const expected =
        (800 / 1e6) * 3 +
        (500 / 1e6) * 15 +
        (200 / 1e6) * 0.3 +
        (100 / 1e6) * 3.75;
      expect(cost).toBeCloseTo(expected);
    });

    it("excludes cacheWrite cost when cacheWritePricePerM is not set", () => {
      const reg = make();
      reg.register({
        modelId: "gpt-4o-no-write",
        tier: "strong",
        inputPricePerM: 5,
        outputPricePerM: 15,
      });
      // 1000 prompt, 0 cache-read, 100 cache-write — no write price configured
      const cost = reg.estimateCost("gpt-4o-no-write", 1000, 500, 0, 100);
      // cacheWriteTokens > 0 but no cacheWritePricePerM → write cost is 0
      const expected = (1000 / 1e6) * 5 + (500 / 1e6) * 15;
      expect(cost).toBeCloseTo(expected);
    });

    it("only warns once per unknown modelId", () => {
      const reg = make();
      reg.estimateCost("ghost", 100, 50);
      reg.estimateCost("ghost", 100, 50);
      // Should not throw — warning is de-duped internally
    });

    it("returns null for registered-but-unpriced model (tier set, prices missing in DB)", () => {
      const reg = make();
      // hydrateFromDb 对 priceInput/Output 均为 null 的行注册 unpriced:true（0 价占位）
      reg.register({
        modelId: "deepseek-v4-flash",
        tier: "standard",
        inputPricePerM: 0,
        outputPricePerM: 0,
        unpriced: true,
      });
      expect(reg.estimateCost("deepseek-v4-flash", 31_087, 3_381)).toBeNull();
      // unpriced 标记经 get() 暴露给 cost 面板（显示「未计价」而非 $0）
      expect(reg.get("deepseek-v4-flash")!.unpriced).toBe(true);
      // tier 仍可用于 downgrade 选型
      expect(reg.pickModelForTier("standard")).toBe("deepseek-v4-flash");
    });

    it("explicit zero price WITHOUT unpriced flag still computes $0 (genuinely free model)", () => {
      const reg = make();
      reg.register({
        modelId: "local-llama",
        tier: "basic",
        inputPricePerM: 0,
        outputPricePerM: 0,
      });
      expect(reg.estimateCost("local-llama", 1000, 500)).toBe(0);
    });
  });

  describe("pickModelForTier", () => {
    it("picks first model in tier", () => {
      const reg = make();
      reg.register({
        modelId: "a",
        tier: "basic",
        inputPricePerM: 0.5,
        outputPricePerM: 1,
      });
      reg.register({
        modelId: "b",
        tier: "basic",
        inputPricePerM: 0.5,
        outputPricePerM: 1,
      });
      expect(reg.pickModelForTier("basic")).toBe("a");
    });

    it("returns null when no models for tier", () => {
      expect(make().pickModelForTier("strong")).toBeNull();
    });
  });

  describe("promoteToPrimary", () => {
    it("promotes model to first in tier", () => {
      const reg = make();
      reg.register({
        modelId: "a",
        tier: "strong",
        inputPricePerM: 5,
        outputPricePerM: 15,
      });
      reg.register({
        modelId: "b",
        tier: "strong",
        inputPricePerM: 5,
        outputPricePerM: 15,
      });
      reg.promoteToPrimary("strong", "b");
      expect(reg.pickModelForTier("strong")).toBe("b");
    });

    it("throws if model not registered before promotion", () => {
      const reg = make();
      expect(() => reg.promoteToPrimary("strong", "ghost")).toThrow();
    });
  });

  describe("list()", () => {
    it("returns all registered models", () => {
      const reg = make();
      reg.register({
        modelId: "m1",
        tier: "strong",
        inputPricePerM: 5,
        outputPricePerM: 15,
      });
      reg.register({
        modelId: "m2",
        tier: "basic",
        inputPricePerM: 0.5,
        outputPricePerM: 1,
      });
      expect(reg.list().length).toBe(2);
    });
  });

  describe("onApplicationBootstrap", () => {
    it("warns and returns early when prisma is missing", async () => {
      const reg = make();
      // No prisma -> should complete without throwing
      await expect(reg.onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it("hydrates from db with mock prisma", async () => {
      const mockPrisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "gpt-4o",
              costTier: "strong",
              priceInputPerMillion: "5",
              priceOutputPerMillion: "15",
              priceCacheReadPerMillion: null,
              priceCacheWritePerMillion: null,
            },
            {
              modelId: "gpt-3.5",
              costTier: null,
              priceInputPerMillion: "0.5",
              priceOutputPerMillion: "1",
              priceCacheReadPerMillion: null,
              priceCacheWritePerMillion: null,
            },
            {
              modelId: "bad-tier",
              costTier: "invalid",
              priceInputPerMillion: "1",
              priceOutputPerMillion: "2",
              priceCacheReadPerMillion: null,
              priceCacheWritePerMillion: null,
            },
          ]),
        },
        userModelConfig: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const reg = new ModelPricingRegistry(mockPrisma as never);
      await reg.onApplicationBootstrap();
      expect(reg.get("gpt-4o")).not.toBeNull();
      // null costTier is skipped
      expect(reg.get("gpt-3.5")).toBeNull();
      // invalid tier is skipped
      expect(reg.get("bad-tier")).toBeNull();
    });

    it("uses tier-default pricing when DB row has costTier but no explicit price (closes $0 budget hole)", async () => {
      // 2026-06-16: 价格未配但有 costTier → 用档位默认价估算（护栏先生效），
      // 不再标 unpriced 落到 $0。
      const mockPrisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "deepseek-v4-flash",
              costTier: "standard",
              priceInputPerMillion: null,
              priceOutputPerMillion: null,
              priceCacheReadPerMillion: null,
              priceCacheWritePerMillion: null,
            },
          ]),
        },
        userModelConfig: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const reg = new ModelPricingRegistry(mockPrisma as never);
      await reg.onApplicationBootstrap();

      const entry = reg.get("deepseek-v4-flash");
      expect(entry).not.toBeNull();
      // 标记来自档位估算（cost 面板可显示「≈ 档位估算」），且不再是 unpriced
      expect(entry!.estimatedFromTier).toBe(true);
      expect(entry!.unpriced).toBeFalsy();

      // estimateCost 现在返回 standard 档位默认价的真实数值，而非 null → 预算可计
      const cost = reg.estimateCost("deepseek-v4-flash", 1000, 500);
      expect(cost).not.toBeNull();
      // standard: input 3 / output 12 per 1M
      const expected = (1000 / 1e6) * 3 + (500 / 1e6) * 12;
      expect(cost).toBeCloseTo(expected);
    });

    it("hydrates cacheWrite price from db when set", async () => {
      const mockPrisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "claude-3-opus",
              costTier: "strong",
              priceInputPerMillion: "15",
              priceOutputPerMillion: "75",
              priceCacheReadPerMillion: "1.5",
              priceCacheWritePerMillion: "18.75",
            },
          ]),
        },
        userModelConfig: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const reg = new ModelPricingRegistry(mockPrisma as never);
      await reg.onApplicationBootstrap();
      const entry = reg.get("claude-3-opus");
      expect(entry).not.toBeNull();
      expect(entry!.cacheWritePricePerM).toBeCloseTo(18.75);
      // 100 cache-write tokens should be costed
      const cost = reg.estimateCost("claude-3-opus", 1000, 500, 0, 100);
      expect(cost).not.toBeNull();
      expect(cost!).toBeGreaterThan(0);
      const expected =
        (1000 / 1e6) * 15 + (500 / 1e6) * 75 + (100 / 1e6) * 18.75;
      expect(cost).toBeCloseTo(expected);
    });

    it("handles db error gracefully", async () => {
      const mockPrisma = {
        aIModel: {
          findMany: jest.fn().mockRejectedValue(new Error("DB error")),
        },
      };
      const reg = new ModelPricingRegistry(mockPrisma as never);
      await expect(reg.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(reg.list().length).toBe(0);
    });

    it("BYOK 用户模型吸价：UserModelConfig 填了价格的行注册进 registry（平台行优先）", async () => {
      const mockPrisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "shared-model",
              costTier: "strong",
              priceInputPerMillion: "5",
              priceOutputPerMillion: "15",
              priceCacheReadPerMillion: null,
              priceCacheWritePerMillion: null,
            },
          ]),
        },
        userModelConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "deepseek-v4-flash",
              priceInputPerMillion: "0.14",
              priceOutputPerMillion: "0.28",
            },
            {
              // 与平台行同名 → 平台行优先，不覆盖
              modelId: "shared-model",
              priceInputPerMillion: "999",
              priceOutputPerMillion: "999",
            },
          ]),
        },
      };
      const reg = new ModelPricingRegistry(mockPrisma as never);
      await reg.onApplicationBootstrap();

      const byok = reg.get("deepseek-v4-flash");
      expect(byok).not.toBeNull();
      expect(byok!.tier).toBe("standard");
      const cost = reg.estimateCost("deepseek-v4-flash", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(0.14 + 0.28);

      // 平台行价格未被 BYOK 行覆盖
      expect(reg.get("shared-model")!.inputPricePerM).toBe(5);
    });

    // ── 2026-08-02 回归：没填价的 BYOK 行整行不注册 ────────────────────────
    //
    // 用户实证 prod：`modelId="grok-4.5" not in pricing registry ... Budget
    // enforcement will treat this call as $0`。此前 userModelConfig 查询带
    // `OR: [price not null]` 过滤，没填价的行**整行不注册** → estimateCost
    // 返回 null → 预算护栏对 BYOK 用户完全失效。而 BYOK 恰恰最容易没填价：
    // 用户自己加模型，界面上根本没让他填单价。
    //
    // admin AIModel 那条路 2026-06-16 就已经是「无价 + 有 costTier → 档位默认价
    // 估算，护栏先生效」，这里是把同一套策略补到 BYOK 路，不是新开口子。
    it("BYOK 未填单价 → 按 standard 档位默认价注册（预算护栏生效，不再 $0）", async () => {
      const mockPrisma = {
        aIModel: { findMany: jest.fn().mockResolvedValue([]) },
        userModelConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "grok-4.5",
              priceInputPerMillion: null,
              priceOutputPerMillion: null,
            },
          ]),
        },
      };
      const reg = new ModelPricingRegistry(mockPrisma as never);
      await reg.onApplicationBootstrap();

      const entry = reg.get("grok-4.5");
      expect(entry).not.toBeNull();
      expect(entry!.tier).toBe("standard");
      // 标记为估算值 —— 成本面板据此区分「实价」与「估算」，不谎称是真实单价
      expect(entry!.estimatedFromTier).toBe(true);

      // 关键断言：不再返回 null（返回 null 时预算把整次调用算成 $0）
      const cost = reg.estimateCost("grok-4.5", 1_000_000, 1_000_000);
      expect(cost).not.toBeNull();
      expect(cost!).toBeGreaterThan(0);
      // standard 档位默认价：input 3 / output 12 per 1M
      expect(cost).toBeCloseTo(3 + 12);
    });

    it("BYOK 填了单价 → 用实价，不打估算标记（不回归）", async () => {
      const mockPrisma = {
        aIModel: { findMany: jest.fn().mockResolvedValue([]) },
        userModelConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "priced-byok",
              priceInputPerMillion: "0.5",
              priceOutputPerMillion: "1.5",
            },
          ]),
        },
      };
      const reg = new ModelPricingRegistry(mockPrisma as never);
      await reg.onApplicationBootstrap();

      const entry = reg.get("priced-byok");
      expect(entry!.estimatedFromTier).toBeFalsy();
      expect(reg.estimateCost("priced-byok", 1_000_000, 1_000_000)).toBeCloseTo(
        0.5 + 1.5,
      );
    });
  });
});
