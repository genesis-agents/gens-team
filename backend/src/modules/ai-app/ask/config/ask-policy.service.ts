/**
 * Ask Policy Service (L3 W1 策略数据化)
 *
 * ask 模块全部策略常量（3 个 prompt + 2 个阈值）的 dual-read 入口：
 * DB 有 active 策略行（且 POLICY_DB_MODULES 含 "ask"）时用 DB 值，
 * 否则逐字节返回代码常量（零下降铁律）。
 * 快照等同测试见 __tests__/ask-policy.service.spec.ts。
 *
 * 只迁"策略类"（产出质量/业务决策）；ask 模块的安全网类旋钮
 * （MEMORY_TTL / MAX_MEMORY_MESSAGES 等）不在此数据化。
 */

import { Injectable } from "@nestjs/common";
import { PolicyConfigService } from "../../../platform/facade";
import {
  ASK_BASE_SYSTEM_PROMPT,
  ASK_RESPONSE_GUIDELINES,
  RESPONSE_REQUIREMENTS,
} from "../prompts/ask-system.prompt";
import { PROJECT_KEYWORDS } from "../constants/project-context";

/** 辩论默认轮次代码兜底（原 debate.adapter.ts 内联常量，迁到此处避免循环导入） */
export const DEFAULT_DEBATE_ROUNDS = 3;

export const ASK_POLICY_KEYS = {
  BASE_SYSTEM: "ask.prompt.base-system",
  RESPONSE_GUIDELINES: "ask.prompt.response-guidelines",
  RESPONSE_REQUIREMENTS: "ask.prompt.response-requirements",
  PROJECT_KEYWORDS: "ask.threshold.project-keywords",
  DEBATE_DEFAULT_ROUNDS: "ask.threshold.debate-default-rounds",
} as const;

/** PROMPT 类策略的 value 形状（设计稿 §三） */
interface PromptPolicyValue {
  template: string;
}

@Injectable()
export class AskPolicyService {
  constructor(private readonly policyConfig: PolicyConfigService) {}

  async baseSystemPrompt(): Promise<string> {
    return this.template(ASK_POLICY_KEYS.BASE_SYSTEM, ASK_BASE_SYSTEM_PROMPT);
  }

  async responseGuidelines(): Promise<string> {
    return this.template(
      ASK_POLICY_KEYS.RESPONSE_GUIDELINES,
      ASK_RESPONSE_GUIDELINES,
    );
  }

  /** string[] 形状：DB 行 value 直接是字符串数组（非 {template}） */
  async responseRequirements(): Promise<string[]> {
    return this.stringList(
      ASK_POLICY_KEYS.RESPONSE_REQUIREMENTS,
      RESPONSE_REQUIREMENTS,
    );
  }

  async projectKeywords(): Promise<string[]> {
    return this.stringList(ASK_POLICY_KEYS.PROJECT_KEYWORDS, PROJECT_KEYWORDS);
  }

  /** 优先级链：roomConfig.debateRounds（消费方处理）> DB policy > 代码常量 */
  async debateDefaultRounds(): Promise<number> {
    const resolution = await this.policyConfig.resolve<number>(
      ASK_POLICY_KEYS.DEBATE_DEFAULT_ROUNDS,
      DEFAULT_DEBATE_ROUNDS,
    );
    const value = resolution.value;
    // DB 行 value 形状不对（非正整数）时回代码，防止 0/负数轮次卡死辩论
    return Number.isInteger(value) && value > 0 ? value : DEFAULT_DEBATE_ROUNDS;
  }

  private async template(key: string, codeFallback: string): Promise<string> {
    const resolution = await this.policyConfig.resolve<PromptPolicyValue>(key, {
      template: codeFallback,
    });
    const template = resolution.value?.template;
    // DB 行形状不对（缺 template）或超 200K 上限（对齐 prompt-policy.contract）→ 回代码
    return typeof template === "string" &&
      template.length > 0 &&
      template.length <= 200_000
      ? template
      : codeFallback;
  }

  private async stringList(
    key: string,
    codeFallback: string[],
  ): Promise<string[]> {
    const resolution = await this.policyConfig.resolve<string[]>(
      key,
      codeFallback,
    );
    const value = resolution.value;
    // DB 行 value 形状不对（非非空字符串数组）时回代码
    return Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === "string")
      ? value
      : codeFallback;
  }
}
