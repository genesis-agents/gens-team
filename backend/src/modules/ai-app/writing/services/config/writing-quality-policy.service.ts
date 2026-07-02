/**
 * Writing Quality Policy Service (L3 W1 策略数据化样板)
 *
 * 质量门阈值的 dual-read 入口：DB 有 active 策略行（且 POLICY_DB_MODULES 含
 * "writing"）时用 DB 值，否则逐字节返回 quality-thresholds.config 代码常量。
 * 快照等同测试见 __tests__/writing-quality-policy.service.spec.ts。
 */

import { Injectable } from "@nestjs/common";
import { PolicyConfigService } from "../../../../platform/facade";
import {
  CONTENT_GATE,
  CRITIQUE_REFINE,
  STRUCTURAL_GATE,
} from "./quality-thresholds.config";

export interface StructuralGateThresholds {
  MIN_CHAPTER_WORDS: number;
  MIN_OUTLINE_WORDS: number;
  MAX_EXPRESSION_VIOLATIONS: number;
  AUTO_FIX_EXPRESSIONS: boolean;
}

export interface ContentGateThresholds {
  MIN_OVERALL_SCORE: number;
  MIN_COHERENCE_SCORE: number;
  MIN_CONSISTENCY_SCORE: number;
  MIN_COMPLETENESS_SCORE: number;
  DIMENSION_WEIGHTS: {
    coherence: number;
    consistency: number;
    completeness: number;
    wordCount: number;
    narrativeCraft: number;
  };
}

export interface CritiqueRefineThresholds {
  MAX_ITERATIONS: number;
  MIN_IMPROVEMENT: number;
  SKIP_THRESHOLD: number;
  CONVERGENCE_WINDOW: number;
}

export const WRITING_POLICY_KEYS = {
  STRUCTURAL_GATE: "writing.threshold.structural-gate",
  CONTENT_GATE: "writing.threshold.content-gate",
  CRITIQUE_REFINE: "writing.threshold.critique-refine",
} as const;

@Injectable()
export class WritingQualityPolicyService {
  constructor(private readonly policyConfig: PolicyConfigService) {}

  async structuralGate(): Promise<StructuralGateThresholds> {
    const resolution =
      await this.policyConfig.resolve<StructuralGateThresholds>(
        WRITING_POLICY_KEYS.STRUCTURAL_GATE,
        STRUCTURAL_GATE,
      );
    return resolution.value;
  }

  async contentGate(): Promise<ContentGateThresholds> {
    const resolution = await this.policyConfig.resolve<ContentGateThresholds>(
      WRITING_POLICY_KEYS.CONTENT_GATE,
      CONTENT_GATE,
    );
    return resolution.value;
  }

  async critiqueRefine(): Promise<CritiqueRefineThresholds> {
    const resolution =
      await this.policyConfig.resolve<CritiqueRefineThresholds>(
        WRITING_POLICY_KEYS.CRITIQUE_REFINE,
        CRITIQUE_REFINE,
      );
    return resolution.value;
  }
}
