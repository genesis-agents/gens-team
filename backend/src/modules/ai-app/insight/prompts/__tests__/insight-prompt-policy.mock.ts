/**
 * InsightPromptPolicyService 测试替身：返回代码常量（= DB 空时 dual-read 的行为）
 */
import {
  DIMENSION_RESEARCH_SYSTEM_PROMPT,
  SECTION_WRITING_SYSTEM_PROMPT,
} from "../dimension-research.prompt";
import { REPORT_SYNTHESIS_SYSTEM_PROMPT } from "../report-synthesis.prompt";
import { REPORT_EDITING_SYSTEM_PROMPT } from "../report-editing.prompt";

export function createInsightPromptPolicyMock() {
  return {
    dimensionResearch: jest
      .fn()
      .mockResolvedValue(DIMENSION_RESEARCH_SYSTEM_PROMPT),
    sectionWriting: jest.fn().mockResolvedValue(SECTION_WRITING_SYSTEM_PROMPT),
    reportSynthesis: jest
      .fn()
      .mockResolvedValue(REPORT_SYNTHESIS_SYSTEM_PROMPT),
    reportEditing: jest.fn().mockResolvedValue(REPORT_EDITING_SYSTEM_PROMPT),
  };
}
