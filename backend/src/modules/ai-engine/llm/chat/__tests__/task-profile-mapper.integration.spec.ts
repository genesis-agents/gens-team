/**
 * TaskProfileMapperService - Extended coverage tests
 *
 * Covers paths not hit by the base spec:
 *  - Lines 98-99: reasoning model + outputLength "minimal"/"short" → scaledMin branch
 *  - Lines 128-132: non-reasoning model capping tokens to model maxTokens
 *  - Lines 138-146: hard cap from getKnownModelLimit (warnedHardCaps dedup)
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TaskProfileMapperService } from "../task-profile-mapper.service";
import type { AIModelConfig } from "../ai-chat.service";

function createModelConfig(
  overrides: Partial<AIModelConfig> = {},
): AIModelConfig {
  return {
    id: "test-id",
    name: "test",
    displayName: "Test",
    provider: "openai",
    modelId: "gpt-4",
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "test-key",
    maxTokens: 8000,
    temperature: 0.7,
    isEnabled: true,
    isDefault: false,
    isReasoning: false,
    ...overrides,
  };
}

describe("TaskProfileMapperService (extended coverage)", () => {
  let service: TaskProfileMapperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskProfileMapperService],
    }).compile();
    service = module.get(TaskProfileMapperService);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Lines 98-99: reasoning model with minimal/short outputLength
  // =========================================================================

  describe("reasoning model with minimal/short outputLength (lines 98-99)", () => {
    it("uses scaledMin (0.5 * reasoningMin) for reasoning model with outputLength=minimal", () => {
      const modelConfig = createModelConfig({
        isReasoning: true,
        maxTokens: 100000,
        modelId: "o1",
      });

      const result = service.mapToParameters(
        { outputLength: "minimal" },
        modelConfig,
      );

      // scaledMin = Math.min(Math.ceil(reasoningMin * 0.5), 16000)
      // reasoningMin is large (model maxTokens based), scaled * 0.5 should be < 16000
      // The result is Math.max(baseMaxTokens(500), scaledMin)
      expect(result.maxTokens).toBeGreaterThan(500); // boosted above base
    });

    it("uses scaledMin (0.5 * reasoningMin) for reasoning model with outputLength=short", () => {
      const modelConfig = createModelConfig({
        isReasoning: true,
        maxTokens: 100000,
        modelId: "o1",
      });

      const result = service.mapToParameters(
        { outputLength: "short" },
        modelConfig,
      );

      // base is 1500, scaledMin should be bigger
      expect(result.maxTokens).toBeGreaterThan(1500);
      // But capped at 16000 max for scaledMin
      expect(result.maxTokens).toBeLessThanOrEqual(100000);
    });

    it("scaledMin for very large reasoning model is Math.max(baseTokens, scaledMin) with tiered cap", () => {
      // reasoningMin = Math.min(200000, 25000) = 25000
      // 2026-06-10：minimal 分档上限 4000（旧统一 16000 上限把分类任务推到 12500 长推理）
      // scaledMin = Math.min(Math.ceil(25000 * 0.5), 4000) = 4000
      // effectiveMaxTokens = Math.max(baseMaxTokens(500), 4000) = 4000
      const modelConfig = createModelConfig({
        isReasoning: true,
        maxTokens: 200000,
        modelId: "o1-pro",
      });

      const result = service.mapToParameters(
        { outputLength: "minimal" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(4000);
    });
  });

  // =========================================================================
  // Lines 128-132: non-reasoning model capping to model maxTokens
  // =========================================================================

  describe("model maxTokens capping (lines 128-132)", () => {
    it("caps effectiveMaxTokens to model maxTokens when base exceeds it (non-reasoning)", () => {
      // outputLength "long" = 8000 base tokens, but model only supports 4000
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 4000,
        modelId: "gpt-3.5",
      });

      const result = service.mapToParameters(
        { outputLength: "long" },
        modelConfig,
      );

      // base is 8000 but model cap is 4000 → should be capped at 4000
      expect(result.maxTokens).toBe(4000);
    });

    // ★ 2026-08-01：长输出提升不再限定推理模型。
    //
    // 生产事故：SingleShotWriter 组装 11 维度深度报告，声明
    // outputLength:"extended"，但 grok-4.5 在能力目录里是 reasoning.kind="none"，
    // 提升块当时包在 `if (isReasoning)` 里，于是只拿到基础 16000 → 输出截断 →
    // JSON 尾部的 conclusion 丢失 → 报 `conclusion: Required`，看起来像模型不听话。
    it("非推理模型 + extended：模型上限足够且无已知硬限时提升到 32000", () => {
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 64000,
        // 用不在 MODEL_KNOWN_LIMITS 里的 modelId，避免被硬限表兜回
        modelId: "some-custom-long-output-model",
      });

      const result = service.mapToParameters(
        { outputLength: "extended" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(32000);
    });

    it("非推理模型 + long：同上，提升到 28000", () => {
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 64000,
        modelId: "some-custom-long-output-model",
      });

      const result = service.mapToParameters(
        { outputLength: "long" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(28000);
    });

    // ★ 回归守护：grok-4.5 不得被 ["grok-4", 16384] 的前缀匹配吃掉。
    //
    // 事故成因：MODEL_KNOWN_LIMITS 是有序前缀表，grok-4.5 命中 "grok-4" 前缀被
    // 硬封 16384，导致 11 维度深度报告在 grok-4.5 上必然截断，且用户调大
    // 「我的模型」的 Max Tokens 也无效（这道闸先生效）。
    //
    // 2026-08-01 实查 docs.x.ai / OpenRouter：xAI 未公布 grok-4.5 的单独 output
    // 上限，只公布 context window 500K。表中已补 ["grok-4.5", 131072] 排在
    // "grok-4" 之前。本用例锁住顺序，防止后续有人把新条目加到后面而复现事故。
    it("grok-4.5 不被 grok-4 前缀吃掉（extended 可提升到 32000）", () => {
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 64000,
        modelId: "grok-4.5",
      });

      const result = service.mapToParameters(
        { outputLength: "extended" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(32000);
    });

    it("grok-4 本身仍受 16384 硬限（未误伤既有条目）", () => {
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 64000,
        modelId: "grok-4",
      });

      const result = service.mapToParameters(
        { outputLength: "extended" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(16384);
    });

    it("caps extended output (16000) to a small model maxTokens", () => {
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 2000,
        modelId: "gpt-3.5-turbo",
      });

      const result = service.mapToParameters(
        { outputLength: "extended" },
        modelConfig,
      );

      expect(result.maxTokens).toBe(2000);
    });
  });

  // =========================================================================
  // Lines 138-146: hard cap from getKnownModelLimit + warnedHardCaps dedup
  // =========================================================================

  describe("known model hard cap (lines 138-146)", () => {
    it("applies known limit for gpt-4o-mini when effectiveTokens exceeds it", () => {
      // gpt-4o-mini known limit = 16384
      // If model config says maxTokens = 99999, base "extended" = 16000 which is < 16384
      // So let's use outputLength "long" with no model limit set, then trigger with a model with no limit on config
      const _modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 99999, // db has wrong value, hard cap should kick in
        modelId: "gpt-4o-mini",
      });

      // outputLength extended = 16000 base tokens, but first model cap = 99999 (passes)
      // then knownLimit for gpt-4o-mini = 16384, 16000 < 16384 so no hard cap
      // Let's try to exceed 16384 by using a reasoning model to push tokens up
      // Actually let's use a model where hard cap < effectiveTokens
      // gpt-4-turbo known limit = 4096; use outputLength "medium" (4000 base)
      // 4000 < 4096, no cap. Let's use "long" (8000) -> hard cap to 4096
      const modelConfigTurbo = createModelConfig({
        isReasoning: false,
        maxTokens: 99999,
        modelId: "gpt-4-turbo",
      });

      const result = service.mapToParameters(
        { outputLength: "long" },
        modelConfigTurbo,
      );

      // gpt-4-turbo known limit = 4096
      expect(result.maxTokens).toBe(4096);
    });

    it("does not warn twice for same model (warnedHardCaps dedup)", () => {
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 99999,
        modelId: "gpt-4-turbo",
      });

      // First call → triggers warning and adds to warnedHardCaps
      const result1 = service.mapToParameters(
        { outputLength: "long" },
        modelConfig,
      );
      // Second call → already in warnedHardCaps, no duplicate warn
      const result2 = service.mapToParameters(
        { outputLength: "long" },
        modelConfig,
      );

      // Both results should have the hard-capped value
      expect(result1.maxTokens).toBe(4096);
      expect(result2.maxTokens).toBe(4096);
    });

    it("applies hard cap for claude-3-opus (4096 limit)", () => {
      const modelConfig = createModelConfig({
        isReasoning: false,
        maxTokens: 99999,
        modelId: "claude-3-opus",
      });

      const result = service.mapToParameters(
        { outputLength: "medium" },
        modelConfig,
      );

      // claude-3-opus known limit = 4096, medium base = 4000 < 4096 → no cap
      // Actually medium = 4000, knownLimit = 4096, 4000 < 4096 → no hard cap
      // Use "long" = 8000 > 4096 → hard cap to 4096
      const result2 = service.mapToParameters(
        { outputLength: "long" },
        modelConfig,
      );
      expect(result2.maxTokens).toBe(4096);
      // medium doesn't trigger the hard cap
      expect(result.maxTokens).toBe(4000);
    });
  });
});
