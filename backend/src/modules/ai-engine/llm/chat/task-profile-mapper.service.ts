import { Injectable, Logger } from "@nestjs/common";
import {
  TaskProfile,
  CreativityLevel,
  OutputLengthLevel,
  ReasoningDepth,
  CREATIVITY_TO_TEMPERATURE,
  OUTPUT_LENGTH_TO_TOKENS,
  getReasoningMinTokens,
  JSON_OUTPUT_MAX_TEMPERATURE,
  getKnownModelLimit,
} from "../types";
import { AIModelConfig } from "./ai-chat.service";

/**
 * TaskProfile 参数映射结果
 */
export interface MappedParameters {
  temperature: number;
  maxTokens: number;
  /** Mapped reasoning depth for API callers (only set when model isReasoning AND profile has reasoningDepth) */
  reasoningDepth?: ReasoningDepth;
}

/**
 * TaskProfileMapperService - 将语义化任务配置映射为模型参数
 *
 * 职责：
 * - 将 TaskProfile 的语义化描述映射为具体的模型参数
 * - 根据模型特性（如推理模型）自动调整参数
 * - 处理输出格式对参数的影响
 *
 * 这是 AI Engine 中唯一了解模型参数细节的服务，
 * AI App 层不应直接操作 temperature/maxTokens
 */
@Injectable()
export class TaskProfileMapperService {
  private readonly logger = new Logger(TaskProfileMapperService.name);

  /** 已警告过的模型硬限制，避免日志洪水 */
  private readonly warnedHardCaps = new Set<string>();

  /**
   * 将 TaskProfile 映射为具体模型参数
   *
   * @param profile 任务配置
   * @param modelConfig 模型配置（用于获取 isReasoning、maxTokens 上限等）
   * @returns 映射后的参数
   */
  mapToParameters(
    profile: TaskProfile | undefined,
    modelConfig: AIModelConfig | null,
  ): MappedParameters {
    // 如果没有 profile，返回模型默认值或系统默认值
    if (!profile) {
      const defaultParams = {
        temperature: modelConfig?.temperature ?? 0.7,
        maxTokens: modelConfig?.maxTokens ?? 4096,
      };
      this.logger.debug(
        `[mapToParameters] No TaskProfile provided, using defaults: ` +
          `temp=${defaultParams.temperature}, maxTokens=${defaultParams.maxTokens}`,
      );
      return defaultParams;
    }

    // 1. 基础映射
    const baseTemperature = this.mapCreativityToTemperature(profile.creativity);
    const baseMaxTokens = this.mapOutputLengthToTokens(profile.outputLength);

    this.logger.debug(
      `[mapToParameters] Base mapping: ` +
        `creativity=${profile.creativity ?? "default"} → temp=${baseTemperature}, ` +
        `outputLength=${profile.outputLength ?? "default"} → tokens=${baseMaxTokens}`,
    );

    // 2. 推理模型调整
    // ★ 推理模型需要大量额外 tokens 用于内部 Chain of Thought
    // 实际输出可能只占 completion_tokens 的 10-20%
    const isReasoning = modelConfig?.isReasoning ?? false;
    const modelMaxTokens = modelConfig?.maxTokens;
    let effectiveMaxTokens = baseMaxTokens;

    if (isReasoning) {
      const originalTokens = effectiveMaxTokens;

      // ★ 根据 outputLength 分级计算推理模型 token 需求
      // 推理模型内部 CoT 消耗大量 tokens，但 minimal/short 场景不需要满额
      const reasoningMin = getReasoningMinTokens(modelMaxTokens);
      if (
        profile.outputLength === "minimal" ||
        profile.outputLength === "short"
      ) {
        // minimal/short 分档上限：统一 0.5 倍率 + 16000 上限会把分类/标签类任务
        // （minimal 500）也推到 12500，模型把预算全花在长推理上（2026-06-10 日志实测）。
        // minimal=分类/提取（CoT 2-3k + visible <1k 足够）；short=摘要（CoT 5-6k + visible 1.5k）。
        const boostCap = profile.outputLength === "minimal" ? 4000 : 8000;
        const scaledMin = Math.min(Math.ceil(reasoningMin * 0.5), boostCap);
        effectiveMaxTokens = Math.max(baseMaxTokens, scaledMin);
      } else {
        effectiveMaxTokens = Math.max(baseMaxTokens, reasoningMin);
      }

      if (effectiveMaxTokens !== originalTokens) {
        this.logger.log(
          `[mapToParameters] ★ Reasoning model token boost: ` +
            `${originalTokens} → ${effectiveMaxTokens} tokens ` +
            `(outputLength=${profile.outputLength || "default"}, modelMax=${modelMaxTokens ?? "unknown"})`,
        );
      }
    }

    // ★ 2026-08-01：长输出提升**不再限定推理模型**。
    //
    // 此前这段在 `if (isReasoning)` 里，非推理模型（如 grok-4.5，能力目录标
    // reasoning.kind="none"）声明 outputLength:"extended" 也只拿到基础 16000。
    // 生产事故：SingleShotWriter 组装 11 维度深度报告时输出被截断，而 JSON 里
    // conclusion / citations 排在巨大的 sections 之后，于是尾部字段丢失、
    // 报成 `conclusion: Required`，看起来像模型不听话，实为预算不足。
    //
    // 「写长文」这个需求与模型是否做内部 CoT 无关——推理模型需要额外预算是因为
    // CoT 吃 token，非推理模型需要是因为**可见输出本身就长**。两者都该提升。
    //
    // modelMaxTokens 闸保持不变：不向模型索取超过它声明上限的输出。
    // 注意与推理模型分支的差异：那里保留了「modelMaxTokens 未知也提升」的逃生口
    // （推理模型需要尽可能多的 CoT 空间，且该行为是既有的）。通用路径**不能**这样
    // ——对上限未知的模型索取 28k/32k 输出，provider 可能直接 400。因此这里要求
    // modelMaxTokens 明确存在且足够大，未知一律不提升，保持原有保守行为。
    if (
      profile.outputLength === "extended" &&
      modelMaxTokens &&
      modelMaxTokens >= 32000
    ) {
      effectiveMaxTokens = Math.max(effectiveMaxTokens, 32000);
    } else if (
      profile.outputLength === "long" &&
      modelMaxTokens &&
      modelMaxTokens >= 28000
    ) {
      effectiveMaxTokens = Math.max(effectiveMaxTokens, 28000);
    }

    // 3. 处理模型配置的最大值（推理/非推理统一逻辑）
    if (modelMaxTokens && effectiveMaxTokens > modelMaxTokens) {
      // ★ 2026-08-02：配置值**低于该模型已知真实上限**时必须大声报警。
      //
      //   用户实证 prod：一条 grok-4.5 的 UserModelConfig 存着 maxTokens=4096
      //   （旧版创建逻辑的硬编码默认值，不是用户选的），于是
      //     · 上面 extended/long 提升要求 >=32000/28000 → 一条都不生效
      //     · 这里直接砍到 4096
      //   每次调用只有 4096 输出预算，reconciler 的巨型 JSON 必截断。模型自己
      //   在 thinking 里写「上次输出被截断」，而我们的日志里只看到下游一堆
      //   `figureCandidates: Required` —— 看起来像模型不听话，实为预算不足。
      //
      //   这条此前是 logger.debug（生产不打印），而下面第 4 步「超过已知 API
      //   上限」反倒是 warn 且明说要改库。真正咬人的那条静默，不咬人的那条喧哗
      //   —— 这个不对称让根因整整一天不可见。
      //
      //   判据用 knownLimit 而非绝对值：配置值 >= 已知上限时是合法约束（用户
      //   有意压预算 / 模型确实只有这么大），保持 debug 不吵。
      const realLimit = getKnownModelLimit(modelConfig?.modelId ?? "");
      if (realLimit && modelMaxTokens < realLimit) {
        const staleKey = `stale:${modelConfig?.modelId ?? ""}`;
        if (!this.warnedHardCaps.has(staleKey)) {
          this.logger.warn(
            `[mapToParameters] 模型 ${modelConfig?.modelId} 配置的 maxTokens=${modelMaxTokens}，` +
              `远低于该模型已知真实上限 ${realLimit} —— 本次请求被从 ${effectiveMaxTokens} ` +
              `砍到 ${modelMaxTokens}，长输出任务（报告/整合/写作）会被截断，` +
              `表现为下游 schema 报一堆字段 Required。` +
              `修法：到「我的模型」把 ${modelConfig?.modelId} 的 Max Tokens 改为 ${realLimit}。`,
          );
          this.warnedHardCaps.add(staleKey);
        }
      } else {
        this.logger.debug(
          `[mapToParameters] Capping tokens at model max: ` +
            `${effectiveMaxTokens} → ${modelMaxTokens} (${modelConfig?.modelId})`,
        );
      }
      effectiveMaxTokens = modelMaxTokens;
    }

    // 4. 硬限制兜底：基于已知模型的实际 API 限制
    const knownLimit = getKnownModelLimit(modelConfig?.modelId ?? "");
    if (knownLimit && effectiveMaxTokens > knownLimit) {
      const warnKey = modelConfig?.modelId ?? "";
      if (!this.warnedHardCaps.has(warnKey)) {
        this.logger.warn(
          `[mapToParameters] Hard cap: ${effectiveMaxTokens} -> ${knownLimit} ` +
            `(${modelConfig?.modelId} known API limit). Update maxTokens in database.`,
        );
        this.warnedHardCaps.add(warnKey);
      }
      effectiveMaxTokens = knownLimit;
    }

    // 5. JSON 格式需要更低 temperature（Phase 2 完整实现）
    let effectiveTemperature = baseTemperature;
    if (profile.outputFormat === "json") {
      const originalTemp = effectiveTemperature;
      effectiveTemperature = Math.min(
        effectiveTemperature,
        JSON_OUTPUT_MAX_TEMPERATURE,
      );
      if (effectiveTemperature !== originalTemp) {
        this.logger.debug(
          `[mapToParameters] JSON output format adjustment: ` +
            `temp ${originalTemp} → ${effectiveTemperature}`,
        );
      }
    }

    // 6. 记录最终结果
    this.logger.debug(
      `[mapToParameters] Final parameters: ` +
        `temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens} ` +
        `(profile: ${JSON.stringify(profile)}, isReasoning=${isReasoning})`,
    );

    // 7. Pass through reasoning depth (only meaningful for reasoning models)
    const mappedReasoningDepth =
      isReasoning && profile.reasoningDepth
        ? profile.reasoningDepth
        : undefined;

    // If deep reasoning requested, ensure sufficient tokens
    if (mappedReasoningDepth === "deep" && effectiveMaxTokens < 32000) {
      const boosted = Math.min(32000, modelMaxTokens || 32000);
      if (boosted > effectiveMaxTokens) {
        this.logger.log(
          `[mapToParameters] Deep reasoning token boost: ${effectiveMaxTokens} -> ${boosted}`,
        );
        effectiveMaxTokens = boosted;
      }
    }

    return {
      temperature: effectiveTemperature,
      maxTokens: effectiveMaxTokens,
      reasoningDepth: mappedReasoningDepth,
    };
  }

  /**
   * 将创意度等级映射为 temperature
   */
  private mapCreativityToTemperature(
    level: CreativityLevel | undefined,
  ): number {
    if (!level) {
      return 0.7; // 默认中等创意度
    }
    return CREATIVITY_TO_TEMPERATURE[level];
  }

  /**
   * 将输出长度等级映射为 maxTokens
   */
  private mapOutputLengthToTokens(
    level: OutputLengthLevel | undefined,
  ): number {
    if (!level) {
      return 4096; // 默认中等长度
    }
    return OUTPUT_LENGTH_TO_TOKENS[level];
  }
}
