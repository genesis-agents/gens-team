/**
 * Social Strategy Policy Service (L3 W1 策略数据化)
 *
 * social 模块全部策略常量（6 个 prompt + 2 个 overflow 阈值 + 违禁词列表）的
 * dual-read 入口：DB 有 active 策略行（且 POLICY_DB_MODULES 含 "social"）时用
 * DB 值，否则逐字节返回代码常量（零下降铁律）。
 * 快照等同测试见 __tests__/social-strategy-policy.service.spec.ts。
 *
 * 锚点契约：WECHAT_ARTICLE_SYSTEM_PROMPT 的 DB 覆盖版必须保留
 * "### 3. 结尾部分" 锚点——content-transformer.service 靠它注入双语 guide；
 * 锚点缺失时 replace 不命中，行为退化为"不注入双语样式"而非报错（spec 有断言）。
 */

import { Injectable } from "@nestjs/common";
import { PolicyConfigService } from "@/modules/platform/facade";
import {
  BILINGUAL_FORMAT_GUIDE,
  WECHAT_ARTICLE_SYSTEM_PROMPT,
  XIAOHONGSHU_NOTE_BILINGUAL_ADDENDUM,
  XIAOHONGSHU_NOTE_SYSTEM_PROMPT,
} from "../../skills/social-transformer.prompt";
import {
  WECHAT_ADAPTATION_SYSTEM_PROMPT,
  XIAOHONGSHU_ADAPTATION_SYSTEM_PROMPT,
} from "../../skills/social-version.prompt";

export const SOCIAL_POLICY_KEYS = {
  WECHAT_ARTICLE_SYSTEM: "social.prompt.wechat-article-system",
  XIAOHONGSHU_NOTE_SYSTEM: "social.prompt.xiaohongshu-note-system",
  BILINGUAL_FORMAT_GUIDE: "social.prompt.bilingual-format-guide",
  XIAOHONGSHU_NOTE_BILINGUAL_ADDENDUM:
    "social.prompt.xiaohongshu-note-bilingual-addendum",
  WECHAT_ADAPTATION_SYSTEM: "social.prompt.wechat-adaptation-system",
  XIAOHONGSHU_ADAPTATION_SYSTEM: "social.prompt.xiaohongshu-adaptation-system",
  CONTENT_OVERFLOW_RATIO: "social.threshold.content-overflow-ratio",
  TITLE_OVERFLOW_RATIO: "social.threshold.title-overflow-ratio",
  FORBIDDEN_WORDS: "social.threshold.forbidden-words",
} as const;

/** 正文超平台限制多少倍才走 AI 重写（否则简单截断）——成本 vs 质量的业务决策线 */
export const CONTENT_OVERFLOW_THRESHOLD = 1.2;
/** 标题超平台限制多少倍才 AI 重写 */
export const TITLE_OVERFLOW_THRESHOLD = 1.5;
/** 基础违禁词列表（代码兜底为空数组；实际清单经 PolicyConfig 数据化下发） */
export const FORBIDDEN_WORDS: string[] = [];

/** PROMPT 类策略的 value 形状（设计稿 §三） */
interface PromptPolicyValue {
  template: string;
}

/** THRESHOLD 比例类策略的 value 形状（设计稿 §三：THRESHOLD 为对象） */
interface RatioPolicyValue {
  ratio: number;
}

@Injectable()
export class SocialStrategyPolicyService {
  constructor(private readonly policyConfig: PolicyConfigService) {}

  // ==================== prompts ====================

  async wechatArticleSystemPrompt(): Promise<string> {
    return this.template(
      SOCIAL_POLICY_KEYS.WECHAT_ARTICLE_SYSTEM,
      WECHAT_ARTICLE_SYSTEM_PROMPT,
    );
  }

  async xiaohongshuNoteSystemPrompt(): Promise<string> {
    return this.template(
      SOCIAL_POLICY_KEYS.XIAOHONGSHU_NOTE_SYSTEM,
      XIAOHONGSHU_NOTE_SYSTEM_PROMPT,
    );
  }

  async bilingualFormatGuide(): Promise<string> {
    return this.template(
      SOCIAL_POLICY_KEYS.BILINGUAL_FORMAT_GUIDE,
      BILINGUAL_FORMAT_GUIDE,
    );
  }

  async xiaohongshuNoteBilingualAddendum(): Promise<string> {
    return this.template(
      SOCIAL_POLICY_KEYS.XIAOHONGSHU_NOTE_BILINGUAL_ADDENDUM,
      XIAOHONGSHU_NOTE_BILINGUAL_ADDENDUM,
    );
  }

  async wechatAdaptationSystemPrompt(): Promise<string> {
    return this.template(
      SOCIAL_POLICY_KEYS.WECHAT_ADAPTATION_SYSTEM,
      WECHAT_ADAPTATION_SYSTEM_PROMPT,
    );
  }

  async xiaohongshuAdaptationSystemPrompt(): Promise<string> {
    return this.template(
      SOCIAL_POLICY_KEYS.XIAOHONGSHU_ADAPTATION_SYSTEM,
      XIAOHONGSHU_ADAPTATION_SYSTEM_PROMPT,
    );
  }

  // ==================== thresholds ====================

  async contentOverflowThreshold(): Promise<number> {
    return this.ratio(
      SOCIAL_POLICY_KEYS.CONTENT_OVERFLOW_RATIO,
      CONTENT_OVERFLOW_THRESHOLD,
    );
  }

  async titleOverflowThreshold(): Promise<number> {
    return this.ratio(
      SOCIAL_POLICY_KEYS.TITLE_OVERFLOW_RATIO,
      TITLE_OVERFLOW_THRESHOLD,
    );
  }

  async forbiddenWords(): Promise<string[]> {
    const resolution = await this.policyConfig.resolve<string[]>(
      SOCIAL_POLICY_KEYS.FORBIDDEN_WORDS,
      FORBIDDEN_WORDS,
    );
    const words = resolution.value;
    // DB 行 value 形状不对（非 string[]）时回代码，防止 checker 遍历炸掉
    return Array.isArray(words) && words.every((w) => typeof w === "string")
      ? words
      : FORBIDDEN_WORDS;
  }

  // ==================== internals ====================

  private async template(key: string, codeFallback: string): Promise<string> {
    const resolution = await this.policyConfig.resolve<PromptPolicyValue>(key, {
      template: codeFallback,
    });
    const template = resolution.value?.template;
    // DB 行 value 形状不对（缺 template）时回代码，防止 "undefined" 注入 system prompt
    return typeof template === "string" && template.length > 0
      ? template
      : codeFallback;
  }

  private async ratio(key: string, codeFallback: number): Promise<number> {
    const resolution = await this.policyConfig.resolve<RatioPolicyValue>(key, {
      ratio: codeFallback,
    });
    const ratio = resolution.value?.ratio;
    // DB 行 value 形状不对（非有限正数）时回代码，防止 NaN 比较让所有内容跳过 AI 适配
    return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0
      ? ratio
      : codeFallback;
  }
}
