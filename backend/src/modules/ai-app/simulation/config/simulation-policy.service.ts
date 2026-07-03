/**
 * Simulation Policy Service (L3 W1 策略数据化)
 *
 * simulation 模块全部策略常量（黑天鹅事件库 / Agent 推演 prompt /
 * 公司指标模板 / 行业系数 / 行业分析 prompt / 推演参数启发式）的
 * dual-read 入口：DB 有 active 策略行（且 POLICY_DB_MODULES 含
 * "simulation"）时用 DB 值，否则逐字节返回 simulation-policy.config
 * 代码常量。快照等同测试见 __tests__/simulation-policy.service.spec.ts。
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PolicyConfigService,
  conformsToShape,
} from "@/modules/platform/facade";
import {
  AGENT_ROUND_PROMPT,
  AGENT_SYSTEM_PROMPT_TEMPLATE,
  AgentRoundPromptPolicy,
  BLACK_SWAN_EVENTS,
  BlackSwanEventTemplate,
  COMPANY_METRICS_BY_TYPE,
  COMPANY_METRICS_SYSTEM_PROMPT,
  CompanyMetricsSystemPromptPolicy,
  CompanyMetricsTemplate,
  INDUSTRY_ANALYSIS_SYSTEM_PROMPT,
  INDUSTRY_ANALYSIS_USER_PROMPT,
  INDUSTRY_MODIFIERS,
  IndustryAnalysisUserPromptPolicy,
  IndustryModifier,
  SUGGEST_PARAMS_HEURISTICS,
  SuggestParamsHeuristics,
  TEAM_ROLE_PROMPTS,
} from "./simulation-policy.config";

export const SIMULATION_POLICY_KEYS = {
  BLACK_SWAN_EVENTS: "simulation.prompt.black-swan-events",
  AGENT_SYSTEM: "simulation.prompt.agent-system",
  TEAM_ROLES: "simulation.prompt.team-roles",
  AGENT_ROUND: "simulation.prompt.agent-round",
  COMPANY_METRICS_TEMPLATE: "simulation.threshold.company-metrics-template",
  INDUSTRY_MODIFIERS: "simulation.threshold.industry-modifiers",
  INDUSTRY_ANALYSIS_SYSTEM: "simulation.prompt.industry-analysis-system",
  INDUSTRY_ANALYSIS_USER: "simulation.prompt.industry-analysis-user",
  COMPANY_METRICS_SYSTEM: "simulation.prompt.company-metrics-system",
  SUGGEST_PARAMS_HEURISTICS: "simulation.threshold.suggest-params-heuristics",
} as const;

/** 纯模板 PROMPT 类策略的 value 形状（设计稿 §三，对齐 insight 样板） */
interface PromptPolicyValue {
  template: string;
}

/** generateAgentDecision 一次拿齐的 Agent 推演 prompt 策略组 */
export interface AgentPromptPolicy {
  systemTemplate: string;
  teamRoles: Record<string, string>;
  round: AgentRoundPromptPolicy;
}

@Injectable()
export class SimulationPolicyService {
  constructor(private readonly policyConfig: PolicyConfigService) {}

  // ==================== engine 消费 ====================

  async blackSwanEvents(): Promise<BlackSwanEventTemplate[]> {
    const resolution = await this.policyConfig.resolve<
      BlackSwanEventTemplate[]
    >(SIMULATION_POLICY_KEYS.BLACK_SWAN_EVENTS, BLACK_SWAN_EVENTS);
    return resolution.value;
  }

  async agentPromptPolicy(): Promise<AgentPromptPolicy> {
    const [systemTemplate, teamRoles, round] = await Promise.all([
      this.template(
        SIMULATION_POLICY_KEYS.AGENT_SYSTEM,
        AGENT_SYSTEM_PROMPT_TEMPLATE,
      ),
      this.resolveValue(SIMULATION_POLICY_KEYS.TEAM_ROLES, TEAM_ROLE_PROMPTS),
      this.resolveValue(SIMULATION_POLICY_KEYS.AGENT_ROUND, AGENT_ROUND_PROMPT),
    ]);
    return { systemTemplate, teamRoles, round };
  }

  // ==================== assist 消费 ====================

  async companyMetricsTemplates(): Promise<
    Record<string, CompanyMetricsTemplate>
  > {
    return this.resolveValue(
      SIMULATION_POLICY_KEYS.COMPANY_METRICS_TEMPLATE,
      COMPANY_METRICS_BY_TYPE,
    );
  }

  async industryModifiers(): Promise<Record<string, IndustryModifier>> {
    return this.resolveValue(
      SIMULATION_POLICY_KEYS.INDUSTRY_MODIFIERS,
      INDUSTRY_MODIFIERS,
    );
  }

  async industryAnalysisSystemPrompt(): Promise<string> {
    return this.template(
      SIMULATION_POLICY_KEYS.INDUSTRY_ANALYSIS_SYSTEM,
      INDUSTRY_ANALYSIS_SYSTEM_PROMPT,
    );
  }

  async industryAnalysisUserPrompt(): Promise<IndustryAnalysisUserPromptPolicy> {
    return this.resolveValue(
      SIMULATION_POLICY_KEYS.INDUSTRY_ANALYSIS_USER,
      INDUSTRY_ANALYSIS_USER_PROMPT,
    );
  }

  async companyMetricsSystemPrompt(): Promise<CompanyMetricsSystemPromptPolicy> {
    return this.resolveValue(
      SIMULATION_POLICY_KEYS.COMPANY_METRICS_SYSTEM,
      COMPANY_METRICS_SYSTEM_PROMPT,
    );
  }

  async suggestParamsHeuristics(): Promise<SuggestParamsHeuristics> {
    return this.resolveValue(
      SIMULATION_POLICY_KEYS.SUGGEST_PARAMS_HEURISTICS,
      SUGGEST_PARAMS_HEURISTICS,
    );
  }

  // ==================== internals ====================

  private readonly logger = new Logger(SimulationPolicyService.name);

  /** DB 值须形状兼容代码兜底（缺字段/类型漂移 → warn + 回代码），防坏行注入引擎 */
  private async resolveValue<T>(key: string, codeFallback: T): Promise<T> {
    const resolution = await this.policyConfig.resolve<T>(key, codeFallback);
    if (
      resolution.source === "db" &&
      !conformsToShape(resolution.value, codeFallback)
    ) {
      this.logger.warn(
        `Policy "${key}" v${resolution.version} value malformed (shape mismatch), falling back to code constants`,
      );
      return codeFallback;
    }
    return resolution.value;
  }

  private async template(key: string, codeFallback: string): Promise<string> {
    const resolution = await this.policyConfig.resolve<PromptPolicyValue>(key, {
      template: codeFallback,
    });
    const template = resolution.value?.template;
    // DB 行 value 形状不对（缺 template）时回代码，防止 "undefined" 注入 prompt
    return typeof template === "string" && template.length > 0
      ? template
      : codeFallback;
  }
}
