/**
 * RuntimeEnvironmentService — branch coverage supplement
 *
 * Targets uncovered branches in discoverModels, discoverTools, discoverUserKeys,
 * discoverAgents, isValidCostTier, and snapshot model paths.
 */

import { RuntimeEnvironmentService } from "../runtime/runtime-environment.service";

function makeService(
  overrides: {
    prisma?: any;
    agentRegistry?: any;
    toolRegistry?: any;
    skillRegistry?: any;
    specAgentRegistry?: any;
    modelConfigService?: any;
    keyResolver?: any;
    secrets?: any;
    toolCircuitBreaker?: any;
  } = {},
) {
  return new RuntimeEnvironmentService(
    overrides.prisma,
    overrides.agentRegistry,
    overrides.toolRegistry,
    overrides.skillRegistry,
    overrides.specAgentRegistry,
    overrides.modelConfigService,
    overrides.keyResolver,
    overrides.secrets,
    overrides.toolCircuitBreaker,
  );
}

describe("RuntimeEnvironmentService — supplement", () => {
  describe("discoverModels", () => {
    it("returns empty when prisma not injected", async () => {
      const svc = makeService();
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.models.CHAT).toEqual([]);
      expect(snap.models.REASONING).toEqual([]);
    });

    // ── 2026-08-02 回归：非 CHAT/EMBEDDING 的文本模型被静默吞掉 ──────────
    //
    // 此前主分桶是 `result[row.modelType as RuntimeModelType]` + `if (bucket)`。
    // DB 的 AIModelType（用途分层）与 RuntimeModelType（能力视图）是两套词表，
    // 只有 CHAT / EMBEDDING 偶然同名 —— CHAT_FAST / CODE / MULTIMODAL /
    // EVALUATOR 这些同样是文本聊天的枚举值全部落空且无任何日志。
    //
    // 后果不只是统计难看：validateModels 的「所有模型均不可用」闸判定条件是
    // `allModels.length > 0 && healthy.length === 0`，全被吞掉时 length===0，
    // 闸直接失效 —— 只配了快速聊天/代码模型的用户失去这层保护。
    it.each([["CHAT_FAST"], ["CODE"], ["MULTIMODAL"], ["EVALUATOR"]])(
      "modelType=%s 的文本模型进 CHAT 池（此前被静默丢弃）",
      async (dbType) => {
        const prisma = {
          aIModel: {
            findMany: jest.fn().mockResolvedValue([
              {
                modelId: `m-${dbType}`,
                provider: "openai",
                modelType: dbType,
                maxTokens: 4096,
                isReasoning: false,
                supportsVision: false,
                costTier: "basic",
              },
            ]),
          },
          $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        };
        const svc = makeService({ prisma });
        const snap = await svc.snapshot({ userId: "u1" });
        const found = snap.models.CHAT.find((m) => m.modelId === `m-${dbType}`);
        expect(found).toBeDefined();
        // DB 原值保留给排障——能力桶是有损映射，出问题时要看得见真实类型
        expect(found?.sourceModelType).toBe(dbType);
      },
    );

    it("图像/重排序类不进 chat 池（不是回归，是本就不属于该能力视图）", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "dall-e-3",
              provider: "openai",
              modelType: "IMAGE_GENERATION",
              maxTokens: 4096,
              isReasoning: false,
              supportsVision: false,
              costTier: "standard",
            },
            {
              modelId: "rerank-v3",
              provider: "cohere",
              modelType: "RERANK",
              maxTokens: 4096,
              isReasoning: false,
              supportsVision: false,
              costTier: "basic",
            },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.models.CHAT).toEqual([]);
      expect(snap.models.EMBEDDING).toEqual([]);
    });

    it("modelType=EMBEDDING 仍进 EMBEDDING 池（不回归）", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "text-embedding-3-small",
              provider: "openai",
              modelType: "EMBEDDING",
              maxTokens: 8191,
              isReasoning: false,
              supportsVision: false,
              costTier: "basic",
            },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.models.EMBEDDING.map((m) => m.modelId)).toEqual([
        "text-embedding-3-small",
      ]);
      expect(snap.models.CHAT).toEqual([]);
    });

    it("model with errorRate < 0.5 → healthy", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "gpt-4",
              provider: "openai",
              modelType: "CHAT",
              maxTokens: 4096,
              isReasoning: false,
              supportsVision: false,
              costTier: "standard",
            },
          ]),
        },
        $queryRawUnsafe: jest
          .fn()
          .mockResolvedValue([
            { model_id: "gpt-4", calls: BigInt(10), errors: BigInt(2) },
          ]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      const model = snap.models.CHAT.find((m) => m.modelId === "gpt-4");
      expect(model?.healthy).toBe("healthy");
      expect(model?.costTier).toBe("standard");
    });

    it("model with errorRate >= 0.5 → unhealthy", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "bad-model",
              provider: "openai",
              modelType: "CHAT",
              maxTokens: 4096,
              isReasoning: false,
              supportsVision: false,
              costTier: null,
            },
          ]),
        },
        $queryRawUnsafe: jest
          .fn()
          .mockResolvedValue([
            { model_id: "bad-model", calls: BigInt(10), errors: BigInt(6) },
          ]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      const model = snap.models.CHAT.find((m) => m.modelId === "bad-model");
      expect(model?.healthy).toBe("unhealthy");
      expect(model?.costTier).toBe("unknown");
    });

    it("model with no error data → unknown", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "new-model",
              provider: "anthropic",
              modelType: "CHAT",
              maxTokens: 100000,
              isReasoning: false,
              supportsVision: false,
              costTier: "basic",
            },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      const model = snap.models.CHAT.find((m) => m.modelId === "new-model");
      expect(model?.healthy).toBe("unknown");
      expect(model?.costTier).toBe("basic");
    });

    it("model with calls=0 → no error rate (unknown healthy)", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "zero-calls",
              provider: "openai",
              modelType: "CHAT",
              maxTokens: 4096,
              isReasoning: false,
              supportsVision: false,
              costTier: "strong",
            },
          ]),
        },
        $queryRawUnsafe: jest
          .fn()
          .mockResolvedValue([
            { model_id: "zero-calls", calls: BigInt(0), errors: BigInt(0) },
          ]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      const model = snap.models.CHAT.find((m) => m.modelId === "zero-calls");
      expect(model?.healthy).toBe("unknown");
    });

    it("isReasoning=true model added to REASONING bucket", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "o1-preview",
              provider: "openai",
              modelType: "CHAT",
              maxTokens: 128000,
              isReasoning: true,
              supportsVision: false,
              costTier: "strong",
            },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(
        snap.models.REASONING.some((m) => m.modelId === "o1-preview"),
      ).toBe(true);
      expect(snap.models.CHAT.some((m) => m.modelId === "o1-preview")).toBe(
        true,
      );
    });

    it("isReasoning=null, modelConfigService says true → REASONING bucket", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "deepseek-r1",
              provider: "deepseek",
              modelType: "CHAT",
              maxTokens: 64000,
              isReasoning: null,
              supportsVision: false,
              costTier: null,
            },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const modelConfigService = {
        isReasoningModel: jest.fn().mockReturnValue(true),
      };
      const svc = makeService({ prisma, modelConfigService });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(
        snap.models.REASONING.some((m) => m.modelId === "deepseek-r1"),
      ).toBe(true);
    });

    it("isReasoning=false skips modelConfigService", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "gpt-3.5",
              provider: "openai",
              modelType: "CHAT",
              maxTokens: 4096,
              isReasoning: false,
              supportsVision: false,
              costTier: null,
            },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const modelConfigService = {
        isReasoningModel: jest.fn().mockReturnValue(true),
      };
      const svc = makeService({ prisma, modelConfigService });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.models.REASONING.some((m) => m.modelId === "gpt-3.5")).toBe(
        false,
      );
      expect(modelConfigService.isReasoningModel).not.toHaveBeenCalled();
    });

    it("supportsVision=true model added to VISION bucket", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "gpt-4-vision",
              provider: "openai",
              modelType: "CHAT",
              maxTokens: 128000,
              isReasoning: false,
              supportsVision: true,
              costTier: null,
            },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.models.VISION.some((m) => m.modelId === "gpt-4-vision")).toBe(
        true,
      );
    });

    it("ai_engine_metrics table missing → all unknown healthy (catch branch)", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockResolvedValue([
            {
              modelId: "m1",
              provider: "openai",
              modelType: "CHAT",
              maxTokens: 4096,
              isReasoning: false,
              supportsVision: false,
              costTier: null,
            },
          ]),
        },
        $queryRawUnsafe: jest
          .fn()
          .mockRejectedValue(new Error("relation does not exist")),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      const model = snap.models.CHAT.find((m) => m.modelId === "m1");
      expect(model?.healthy).toBe("unknown");
    });

    it("aIModel.findMany throws → empty models (outer catch)", async () => {
      const prisma = {
        aIModel: {
          findMany: jest.fn().mockRejectedValue(new Error("db down")),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const svc = makeService({ prisma });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.models.CHAT).toEqual([]);
    });
  });

  describe("discoverAgents — specAgentRegistry", () => {
    it("both agentRegistry and specAgentRegistry contribute agents (deduped)", async () => {
      const agentRegistry = {
        getAllIds: jest.fn().mockReturnValue(["a1", "shared"]),
      };
      const specAgentRegistry = {
        getAllIds: jest.fn().mockReturnValue(["b1", "shared"]),
      };
      const svc = makeService({ agentRegistry, specAgentRegistry });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.agents).toContain("a1");
      expect(snap.agents).toContain("b1");
      expect(snap.agents).toContain("shared");
      expect(snap.agents.filter((a) => a === "shared")).toHaveLength(1);
    });

    it("specAgentRegistry throws → still returns agentRegistry ids", async () => {
      const agentRegistry = { getAllIds: jest.fn().mockReturnValue(["a1"]) };
      const specAgentRegistry = {
        getAllIds: jest.fn().mockImplementation(() => {
          throw new Error("fail");
        }),
      };
      const svc = makeService({ agentRegistry, specAgentRegistry });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.agents).toEqual(["a1"]);
    });

    it("agentRegistry throws → still returns specAgentRegistry ids", async () => {
      const agentRegistry = {
        getAllIds: jest.fn().mockImplementation(() => {
          throw new Error("fail");
        }),
      };
      const specAgentRegistry = {
        getAllIds: jest.fn().mockReturnValue(["b1"]),
      };
      const svc = makeService({ agentRegistry, specAgentRegistry });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.agents).toEqual(["b1"]);
    });
  });

  describe("discoverTools — circuit breaker states", () => {
    it("circuit breaker open → unhealthy", async () => {
      const toolRegistry = {
        getAll: jest
          .fn()
          .mockReturnValue([
            { id: "t1", name: "Tool1", category: "search", enabled: true },
          ]),
      };
      const toolCircuitBreaker = {
        getState: jest.fn().mockReturnValue("open"),
      };
      const svc = makeService({ toolRegistry, toolCircuitBreaker });
      const snap = await svc.snapshot({ userId: "u1" });
      const t = snap.tools.find((x) => x.toolId === "t1");
      expect(t?.healthy).toBe("unhealthy");
      expect(t?.note).toContain("circuit breaker open");
    });

    it("circuit breaker half-open → unknown with note", async () => {
      const toolRegistry = {
        getAll: jest
          .fn()
          .mockReturnValue([
            { id: "t2", name: "Tool2", category: "rag", enabled: true },
          ]),
      };
      const toolCircuitBreaker = {
        getState: jest.fn().mockReturnValue("half-open"),
      };
      const svc = makeService({ toolRegistry, toolCircuitBreaker });
      const snap = await svc.snapshot({ userId: "u1" });
      const t = snap.tools.find((x) => x.toolId === "t2");
      expect(t?.healthy).toBe("unknown");
      expect(t?.note).toContain("half-open");
    });

    it("circuit breaker closed → unknown, no note", async () => {
      const toolRegistry = {
        getAll: jest
          .fn()
          .mockReturnValue([
            { id: "t3", name: "Tool3", category: "search", enabled: true },
          ]),
      };
      const toolCircuitBreaker = {
        getState: jest.fn().mockReturnValue("closed"),
      };
      const svc = makeService({ toolRegistry, toolCircuitBreaker });
      const snap = await svc.snapshot({ userId: "u1" });
      const t = snap.tools.find((x) => x.toolId === "t3");
      expect(t?.healthy).toBe("unknown");
      expect(t?.note).toBeUndefined();
    });

    it("toolRegistry.getAll throws → empty tools", async () => {
      const toolRegistry = {
        getAll: jest.fn().mockImplementation(() => {
          throw new Error("registry fail");
        }),
      };
      const svc = makeService({ toolRegistry });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.tools).toEqual([]);
    });
  });

  describe("discoverUserKeys", () => {
    it("keyResolver returns providers → hasByok=true", async () => {
      const keyResolver = {
        getAvailableProviders: jest.fn().mockResolvedValue(["openai"]),
      };
      const svc = makeService({ keyResolver });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.userKeys.hasByok).toBe(true);
      expect(snap.userKeys.byokProviders).toEqual(["openai"]);
    });

    it("keyResolver throws → hasByok=false", async () => {
      const keyResolver = {
        getAvailableProviders: jest.fn().mockRejectedValue(new Error("fail")),
      };
      const svc = makeService({ keyResolver });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.userKeys.hasByok).toBe(false);
    });

    it("secrets returns providers → sharedKeyAvailable=true", async () => {
      const secrets = {
        listAvailableProviders: jest.fn().mockResolvedValue(["openai"]),
      };
      const svc = makeService({ secrets });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.userKeys.sharedKeyAvailable).toBe(true);
    });

    it("secrets throws → sharedKeyAvailable=false", async () => {
      const secrets = {
        listAvailableProviders: jest.fn().mockRejectedValue(new Error("fail")),
      };
      const svc = makeService({ secrets });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.userKeys.sharedKeyAvailable).toBe(false);
    });
  });

  describe("discoverSkills — throws", () => {
    it("skillRegistry.getAll throws → empty skills", async () => {
      const skillRegistry = {
        getAll: jest.fn().mockImplementation(() => {
          throw new Error("fail");
        }),
      };
      const svc = makeService({ skillRegistry });
      const snap = await svc.snapshot({ userId: "u1" });
      expect(snap.skills).toEqual([]);
    });
  });

  describe("snapshot params.force=false with no cache → fresh build", () => {
    it("snapshot with force=false hits fresh on first call", async () => {
      const agentRegistry = { getAllIds: jest.fn().mockReturnValue(["a1"]) };
      const svc = makeService({ agentRegistry });
      const snap1 = await svc.snapshot({ userId: "ux", force: false });
      expect(snap1.agents).toEqual(["a1"]);
    });
  });
});
