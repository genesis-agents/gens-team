/**
 * Insight Prompt Policy Service (L3 W1 策略数据化)
 *
 * 4 个核心 system prompt 模板的 dual-read 入口：DB 有 active 策略行（且
 * POLICY_DB_MODULES 含 "insight"）时用 DB 模板，否则逐字节返回代码常量。
 *
 * 版本语义衔接：prompt-version.ts 的手工版本号（如 SECTION_WRITING v3.1）
 * 在首次 propose 入库时记入 changeReason，此后版本由 policy_configs 表接管。
 * telemetry（PROMPT_METADATA 溯源快照）仍读代码元数据——DB 覆盖场景的
 * provenance 透传是 W2 反馈管道的事（见设计稿 §八）。
 */

import { Injectable } from "@nestjs/common";
import { PolicyConfigService } from "../../../platform/facade";
import {
  DIMENSION_RESEARCH_SYSTEM_PROMPT,
  SECTION_WRITING_SYSTEM_PROMPT,
} from "./dimension-research.prompt";
import { REPORT_SYNTHESIS_SYSTEM_PROMPT } from "./report-synthesis.prompt";
import { REPORT_EDITING_SYSTEM_PROMPT } from "./report-editing.prompt";

export const INSIGHT_PROMPT_KEYS = {
  DIMENSION_RESEARCH: "insight.prompt.dimension-research",
  SECTION_WRITING: "insight.prompt.section-writing",
  REPORT_SYNTHESIS: "insight.prompt.report-synthesis",
  REPORT_EDITING: "insight.prompt.report-editing",
} as const;

/** PROMPT 类策略的 value 形状（设计稿 §三） */
interface PromptPolicyValue {
  template: string;
}

@Injectable()
export class InsightPromptPolicyService {
  constructor(private readonly policyConfig: PolicyConfigService) {}

  async dimensionResearch(): Promise<string> {
    return this.template(
      INSIGHT_PROMPT_KEYS.DIMENSION_RESEARCH,
      DIMENSION_RESEARCH_SYSTEM_PROMPT,
    );
  }

  async sectionWriting(): Promise<string> {
    return this.template(
      INSIGHT_PROMPT_KEYS.SECTION_WRITING,
      SECTION_WRITING_SYSTEM_PROMPT,
    );
  }

  async reportSynthesis(): Promise<string> {
    return this.template(
      INSIGHT_PROMPT_KEYS.REPORT_SYNTHESIS,
      REPORT_SYNTHESIS_SYSTEM_PROMPT,
    );
  }

  async reportEditing(): Promise<string> {
    return this.template(
      INSIGHT_PROMPT_KEYS.REPORT_EDITING,
      REPORT_EDITING_SYSTEM_PROMPT,
    );
  }

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
}
