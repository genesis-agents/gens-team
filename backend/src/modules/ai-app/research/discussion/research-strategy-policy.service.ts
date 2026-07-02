/**
 * Research Strategy Policy Service (L3 W1 策略数据化)
 *
 * research 模块策略常量的 dual-read 入口：DB 有 active 策略行（且
 * POLICY_DB_MODULES 含 "research"）时用 DB 值，否则逐字节返回
 * prompt-locale 代码常量。快照等同测试见
 * __tests__/research-strategy-policy.service.spec.ts。
 *
 * 覆盖候选：
 * - research.threshold.plan-step-count  规划步数指导（双语 Record 整体入库）
 * - research.prompt.reflection-system-* 自我反思质量评估 system prompt（按语言各一 key）
 *
 * 不迁项（安全网/非纯字符串，见 policy-config-design.md 划分原则）：
 * REFLECTION_PROMPTS 的 userPromptTemplate / resultsSummaryTemplate 是函数模板，
 * default* 是 LLM 失败兜底文案，均不数据化。
 */

import { Injectable } from "@nestjs/common";
import { PolicyConfigService } from "@/modules/platform/facade";
import {
  REFLECTION_PROMPTS,
  ResearchLanguage,
  STEP_COUNT_GUIDE,
} from "./prompt-locale";

export type StepCountGuide = Record<ResearchLanguage, Record<string, string>>;

export const RESEARCH_POLICY_KEYS = {
  PLAN_STEP_COUNT: "research.threshold.plan-step-count",
  REFLECTION_SYSTEM: {
    "zh-CN": "research.prompt.reflection-system-zh-cn",
    "en-US": "research.prompt.reflection-system-en-us",
  } satisfies Record<ResearchLanguage, string>,
} as const;

/** PROMPT 类策略的 value 形状（设计稿 §三） */
interface PromptPolicyValue {
  template: string;
}

@Injectable()
export class ResearchStrategyPolicyService {
  constructor(private readonly policyConfig: PolicyConfigService) {}

  /** 规划步数指导（quick/standard/thorough 三档 × zh-CN/en-US），注入 planner system prompt */
  async planStepCountGuide(): Promise<StepCountGuide> {
    const resolution = await this.policyConfig.resolve<StepCountGuide>(
      RESEARCH_POLICY_KEYS.PLAN_STEP_COUNT,
      STEP_COUNT_GUIDE,
    );
    return resolution.value;
  }

  /** 自我反思质量评估 system prompt（纯字符串常量，按语言各一个 key） */
  async reflectionSystemPrompt(language: ResearchLanguage): Promise<string> {
    const codeFallback = REFLECTION_PROMPTS[language].systemPrompt;
    const resolution = await this.policyConfig.resolve<PromptPolicyValue>(
      RESEARCH_POLICY_KEYS.REFLECTION_SYSTEM[language],
      { template: codeFallback },
    );
    const template = resolution.value?.template;
    // DB 行 value 形状不对（缺 template）时回代码，防止 "undefined" 注入 system prompt
    return typeof template === "string" && template.length > 0
      ? template
      : codeFallback;
  }
}
