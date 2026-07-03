/**
 * teams-review-policy.service.ts —— L3 W1 teams 策略数据化：审核结果模式表 dual-read
 *
 * 只迁"策略类"数据（REVIEW_RESULT_PATTERNS 的 4 个 JSON 友好加权模式列表，
 * 直接决定任务通过/打回的业务判定，运营可不发版新增措辞）；STANDARD_FORMAT
 * RegExp 永远留代码（JSON 不可表达，且属解析格式契约而非运营旋钮）。
 *
 * 形态（照抄 playground-strategy-policy 模式）：消费点 parseReviewResult 是
 * 同步纯函数（parsing.utils.ts，不能 await），故不做 per-call resolve，而是
 * 上游 async 审核入口（mission-review.service / team-mission.service 的
 * leader review 路径）判定前刷新一次模块级 overlay 快照；同步消费方读
 * getReviewResultPatterns()。overlay 为空 = 与代码常量同引用（零下降）。
 */

import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { PolicyConfigService } from "@/modules/platform/facade";
import { REVIEW_RESULT_PATTERNS } from "../prompt/prompt-templates";

export const TEAMS_REVIEW_POLICY_KEY = "teams.threshold.review-result-patterns";

const WeightedPatternSchema = z.object({
  pattern: z.string().min(1),
  weight: z.number().min(0).max(1),
});

/** DB overlay 允许只覆盖部分列表；未覆盖的回代码常量 */
const ReviewPatternsOverlaySchema = z.object({
  APPROVE_PATTERNS: z.array(WeightedPatternSchema).min(1).optional(),
  REJECT_PATTERNS: z.array(WeightedPatternSchema).min(1).optional(),
  REVISION_NEEDED_PATTERNS: z.array(WeightedPatternSchema).min(1).optional(),
  SUBSTANTIVE_FEEDBACK_KEYWORDS: z.array(z.string().min(1)).min(1).optional(),
});

export type ReviewPatternsOverlay = z.infer<typeof ReviewPatternsOverlaySchema>;

export interface WeightedPattern {
  pattern: string;
  weight: number;
}

export interface ReviewResultPatternSet {
  /** 标准格式正则 —— 永远来自代码常量，不数据化 */
  STANDARD_FORMAT: RegExp;
  APPROVE_PATTERNS: ReadonlyArray<WeightedPattern>;
  REJECT_PATTERNS: ReadonlyArray<WeightedPattern>;
  REVISION_NEEDED_PATTERNS: ReadonlyArray<WeightedPattern>;
  SUBSTANTIVE_FEEDBACK_KEYWORDS: ReadonlyArray<string>;
}

// 模块级快照：仅 TeamsReviewPolicyService.refreshReviewPatternOverlay 写入
// （审核入口时序），测试用 __reset 防跨用例污染（Claude Code 反向洞察 #8）
let overlay: ReviewPatternsOverlay | null = null;

/**
 * 同步读取审核解析模式：overlay 为空时与 REVIEW_RESULT_PATTERNS 同引用
 * （逐字节零下降）；overlay 覆盖到的列表用 DB 值，未覆盖的回代码常量。
 */
export function getReviewResultPatterns(): ReviewResultPatternSet {
  if (!overlay) {
    return REVIEW_RESULT_PATTERNS;
  }
  return {
    STANDARD_FORMAT: REVIEW_RESULT_PATTERNS.STANDARD_FORMAT,
    APPROVE_PATTERNS:
      overlay.APPROVE_PATTERNS ?? REVIEW_RESULT_PATTERNS.APPROVE_PATTERNS,
    REJECT_PATTERNS:
      overlay.REJECT_PATTERNS ?? REVIEW_RESULT_PATTERNS.REJECT_PATTERNS,
    REVISION_NEEDED_PATTERNS:
      overlay.REVISION_NEEDED_PATTERNS ??
      REVIEW_RESULT_PATTERNS.REVISION_NEEDED_PATTERNS,
    SUBSTANTIVE_FEEDBACK_KEYWORDS:
      overlay.SUBSTANTIVE_FEEDBACK_KEYWORDS ??
      REVIEW_RESULT_PATTERNS.SUBSTANTIVE_FEEDBACK_KEYWORDS,
  };
}

/** 测试专用：重置模块级快照，防跨用例状态污染 */
export function __resetTeamsReviewPolicyOverlayForTest(): void {
  overlay = null;
}

@Injectable()
export class TeamsReviewPolicyService {
  private readonly logger = new Logger(TeamsReviewPolicyService.name);

  constructor(private readonly policyConfig: PolicyConfigService) {}

  /**
   * 审核判定前刷新 overlay。DB 无 active 行 / flag 未含 teams /
   * value 形状非法 → overlay 清空（纯代码常量现状）。
   * fail-open：任何异常只告警，保持现有 overlay，绝不阻断审核。
   */
  async refreshReviewPatternOverlay(): Promise<void> {
    try {
      const resolution =
        await this.policyConfig.resolve<ReviewPatternsOverlay | null>(
          TEAMS_REVIEW_POLICY_KEY,
          null,
        );
      if (resolution.source === "code" || resolution.value == null) {
        overlay = null;
        return;
      }
      const parsed = ReviewPatternsOverlaySchema.safeParse(resolution.value);
      if (!parsed.success) {
        this.logger.warn(
          `Policy "${TEAMS_REVIEW_POLICY_KEY}" v${resolution.version} ` +
            `value malformed, keeping code patterns: ${parsed.error.message}`,
        );
        overlay = null;
        return;
      }
      overlay = parsed.data;
      this.logger.debug(
        `Review pattern overlay active (v${resolution.version}): ` +
          Object.keys(parsed.data).join(", "),
      );
    } catch (error) {
      this.logger.warn(
        `Review pattern overlay refresh failed (keeping current patterns): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
