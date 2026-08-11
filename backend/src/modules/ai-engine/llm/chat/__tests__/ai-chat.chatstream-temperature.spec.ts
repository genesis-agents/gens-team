import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { AiChatService } from "../ai-chat.service";
import { TaskProfileMapperService } from "../task-profile-mapper.service";
import {
  AiModelConfigService,
  AIModelConfig,
} from "../../models/config/ai-model-config.service";
import { AiApiCallerService } from "../../providers/ai-api-caller.service";
import { AiStreamHandlerService } from "../ai-stream-handler.service";
import { AIMetricsService } from "@/modules/platform/monitoring";
import { GuardrailsPipelineService } from "../../../safety/guardrails/guardrails-pipeline.service";
import { EntityHealthRegistry } from "../../../reliability/entity-health/entity-health.registry";
import { AiConnectionTestService } from "../../byok/ai-connection-test.service";
import { AiModelDiscoveryService } from "../../models/catalog/ai-model-discovery.service";
import { AiDirectKeyService } from "../../byok/ai-direct-key.service";
import { AiImageGenerationService } from "../../image/ai-image-generation.service";
import { AiChatRetryService } from "../ai-chat-retry.service";
import { EventEmitter2 } from "@nestjs/event-emitter";

/**
 * chatStream() 的 temperature 门禁 —— 生产事故防回归（2026-08-10）。
 *
 * 事故：ask SSE 对 BYOK 推理模型 gpt-5.6-luna 返回 HTTP 400。该模型的
 * user_model_configs 行明确 is_reasoning=true / supports_temperature=false，
 * toAIModelConfigFromUserConfig 原样透传，但 chatStream 只做
 * `effectiveTemperature ?? 0.7` 兜底、不读这两个字段 → temperature 上了 wire。
 * 非流式 callAPIWithConfig 与连接测试早已各自处理，chatStream 是第三处漏网。
 *
 * 单独成文件（而非并入 ai-chat.service.spec.ts）：后者已 2466 行，pre-push
 * god-class 守卫对 >2500 行文件限制单次推送净增 50 行。
 */

function modelConfig(overrides: Partial<AIModelConfig> = {}): AIModelConfig {
  return {
    id: "id",
    name: "name",
    displayName: "name",
    provider: "openai",
    modelId: "gpt-4o",
    apiEndpoint: "https://api.openai.com/v1",
    apiKey: "k",
    maxTokens: 4000,
    temperature: 0.7,
    isEnabled: true,
    isDefault: false,
    isReasoning: false,
    apiFormat: "openai",
    supportsTemperature: true,
    tokenParamName: "max_tokens",
    defaultTimeoutMs: 120000,
    ...overrides,
  };
}

describe("AiChatService.chatStream() — temperature 门禁", () => {
  let service: AiChatService;
  let mockModelConfigService: Record<string, jest.Mock>;
  let mockStreamHandler: { streamOpenAICompatible: jest.Mock };

  beforeEach(async () => {
    mockModelConfigService = {
      getModelConfig: jest.fn().mockResolvedValue(null),
      getDefaultModelConfig: jest.fn().mockResolvedValue(null),
      getDefaultModelByType: jest.fn().mockResolvedValue(null),
      resolveApiKey: jest.fn().mockResolvedValue({
        apiKey: "sk-test",
        source: "personal",
        apiEndpoint: "https://api.openai.com/v1",
      }),
    };

    mockStreamHandler = {
      streamOpenAICompatible: jest.fn(() =>
        (async function* () {
          yield { content: "", done: true };
        })(),
      ),
    };

    const noop = () => undefined;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiChatService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, dflt?: unknown) =>
              key === "GUARDRAILS_ENABLED" ? "false" : (dflt ?? ""),
            ),
          },
        },
        {
          provide: TaskProfileMapperService,
          // 真实 mapper 永远返回 number temperature —— 门禁必须在 chatStream 里，
          // 不能指望 mapper 给 undefined。这里如实模拟该行为。
          useValue: {
            mapToParameters: jest.fn(() => ({
              temperature: 0.7,
              maxTokens: 4000,
            })),
          },
        },
        { provide: AiModelConfigService, useValue: mockModelConfigService },
        { provide: AiApiCallerService, useValue: {} },
        { provide: AiStreamHandlerService, useValue: mockStreamHandler },
        { provide: AiChatRetryService, useValue: {} },
        { provide: AIMetricsService, useValue: { recordMetric: noop } },
        { provide: GuardrailsPipelineService, useValue: {} },
        // chatStream 会 incrementLoad / decrementLoad（circuitBreaker 注入的就是这个 token）
        {
          provide: EntityHealthRegistry,
          useValue: {
            incrementLoad: noop,
            decrementLoad: noop,
            recordSuccess: noop,
            recordFailure: noop,
          },
        },
        { provide: AiConnectionTestService, useValue: {} },
        { provide: AiModelDiscoveryService, useValue: {} },
        { provide: AiDirectKeyService, useValue: {} },
        { provide: AiImageGenerationService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<AiChatService>(AiChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /** 位置参数 5 = temperature（endpoint, key, modelId, messages, maxTokens, temperature, ...） */
  const wireTemperature = () =>
    mockStreamHandler.streamOpenAICompatible.mock.calls[0][5] as
      | number
      | undefined;

  async function drain(options: Parameters<AiChatService["chatStream"]>[0]) {
    for await (const _chunk of service.chatStream(options)) {
      // 仅驱动生成器，chunk 内容与本用例无关
    }
  }

  it("不给 supportsTemperature=false 的推理模型发 temperature", async () => {
    mockModelConfigService.getModelConfig.mockResolvedValue(
      modelConfig({
        modelId: "gpt-5.6-luna",
        isReasoning: true,
        supportsTemperature: false,
      }),
    );

    await drain({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.6-luna",
      // ask 的真实 profile：creativity medium → mapper 给 0.7
      taskProfile: { creativity: "medium", outputLength: "standard" },
    });

    expect(wireTemperature()).toBeUndefined();
  });

  it("DB 漏标 isReasoning 时靠模型名启发式兜底，同样不发 temperature", async () => {
    mockModelConfigService.getModelConfig.mockResolvedValue(
      modelConfig({
        modelId: "gpt-5.6-luna",
        isReasoning: false, // 列是 NOT NULL default false，漏标塌缩成 false
        supportsTemperature: true,
      }),
    );

    await drain({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.6-luna",
      taskProfile: { creativity: "medium", outputLength: "standard" },
    });

    expect(wireTemperature()).toBeUndefined();
  });

  it("非推理模型照常发 caller 指定的 temperature", async () => {
    mockModelConfigService.getModelConfig.mockResolvedValue(
      modelConfig({ modelId: "gpt-4o" }),
    );

    await drain({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-4o",
      temperature: 0.3,
    });

    expect(wireTemperature()).toBe(0.3);
  });

  it("非推理模型但 DB 标 supportsTemperature=false → 尊重 DB，不发", async () => {
    mockModelConfigService.getModelConfig.mockResolvedValue(
      modelConfig({ modelId: "some-chat-model", supportsTemperature: false }),
    );

    await drain({
      messages: [{ role: "user", content: "Hello" }],
      model: "some-chat-model",
      temperature: 0.3,
    });

    expect(wireTemperature()).toBeUndefined();
  });
});
