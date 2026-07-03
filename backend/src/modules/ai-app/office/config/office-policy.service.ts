/**
 * Office Policy Service (L3 W1 策略数据化)
 *
 * office 模块全部策略常量（PROMPT + THRESHOLD）的 dual-read 单一入口：
 * DB 有 active 策略行（且 POLICY_DB_MODULES 含 "office"）时用 DB 值，
 * 否则逐字节返回代码常量（零下降铁律）。快照等同测试见
 * __tests__/office-policy.service.spec.ts。
 *
 * 两种消费形态（对应 insight / playground 两种样板）：
 * - async 消费点（LLM 调用前可 await）：注入本服务调 prompt(key, codeFallback)
 *   —— codeFallback 由消费方传入（常量留在原处，避免 skill ↔ policy 循环依赖）
 * - sync 消费点（match / audit / analyze 等同步方法，不能 await）：
 *   playground overlay 快照模式 —— skill 的 async execute 入口调
 *   refreshStrategyOverlays() 刷新模块级快照，sync 方法读
 *   getOfficeStrategy(key, codeFallback)；overlay 为空 = 与代码常量同引用。
 *
 * 安全网类旋钮永不数据化（SAMPLE_CHARS 截断、MAX_SOURCE_CHARS、
 * OPTIMAL_SECTIONS、并发数等）——系统不能改自己的保险丝。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PolicyConfigService } from "@/modules/platform/facade";

export const OFFICE_POLICY_KEYS = {
  /** v6.0 幻灯片设计系统 system prompt（完整版，无主题片段时用） */
  SLIDE_DESIGN_SYSTEM: "office.prompt.slide-design-system",
  /** 设计系统 base 版（themePromptFragment 存在时与主题片段拼接） */
  SLIDE_DESIGN_SYSTEM_BASE: "office.prompt.slide-design-system-base",
  /** 内容深度分析 system prompt */
  CONTENT_ANALYSIS_SYSTEM: "office.prompt.content-analysis-system",
  /** 内容深度分析 user prompt 模板（{{title}}/{{purpose}}/{{content}} 占位符） */
  CONTENT_ANALYSIS_USER: "office.prompt.content-analysis-user",
  /** 内容压缩策划师 system prompt */
  CONTENT_COMPRESSION_SYSTEM: "office.prompt.content-compression-system",
  /** PPT 数据补充的数据提取 system prompt */
  DATA_EXTRACTION: "office.prompt.data-extraction",
  /** LLM 路由分类器 prompt（audience/intent/preset 判定标准） */
  SLIDES_AUTO_ROUTER: "office.prompt.slides-auto-router",
  /** 模板匹配 6 维评分权重 */
  TEMPLATE_MATCH_WEIGHTS: "office.threshold.template-match-weights",
  /** 语义审核模板-内容关键词规则表 */
  QUALITY_AUDIT_SEMANTIC_RULES: "office.threshold.quality-audit-semantic-rules",
  /** 图表类型-数据特征关键词规则 */
  CHART_DATA_RULES: "office.threshold.chart-data-rules",
  /** 分页密度阈值（每页最大区块数/字符数） */
  PAGE_DENSITY: "office.threshold.page-density",
} as const;

export type OfficePolicyKey =
  (typeof OFFICE_POLICY_KEYS)[keyof typeof OFFICE_POLICY_KEYS];

/** PROMPT 类策略的 value 形状（设计稿 §三，同 insight 样板） */
interface PromptPolicyValue {
  template: string;
}

// ============================================================================
// sync 消费点 overlay 快照（playground-strategy-policy 模式）
// ============================================================================

// 模块级快照：仅 refreshStrategyOverlays 写入（skill async execute 入口时序），
// 测试用 __reset 防跨用例污染（Claude Code 反向洞察 #8）
const strategyOverlays = new Map<OfficePolicyKey, unknown>();

/**
 * 同步读取策略阈值：DB overlay（若已刷到）优先，否则原样返回 codeFallback
 * （同引用，零下降）。
 */
export function getOfficeStrategy<T>(key: OfficePolicyKey, codeFallback: T): T {
  return (strategyOverlays.get(key) as T | undefined) ?? codeFallback;
}

/** 测试专用：重置模块级快照，防跨用例状态污染 */
export function __resetOfficeStrategyOverlaysForTest(): void {
  strategyOverlays.clear();
}

// ---- overlay 形状校验（DB 值形状非法 → 保持代码常量，防坏配置穿透） ----

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 模板匹配 6 维权重：与 template-matcher.skill 的 MATCH_WEIGHTS 同形 */
function isTemplateMatchWeights(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return [
    "keywordMatch",
    "contentCapacity",
    "narrativePosition",
    "contextFit",
    "diversity",
    "emotionalMatch",
  ].every((k) => typeof v[k] === "number");
}

/** 语义审核规则表：与 quality-audit.skill 的 TEMPLATE_CONTENT_RULES 同形 */
function isTemplateContentRules(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return Object.values(v).every(
    (rule) =>
      isRecord(rule) &&
      isStringArray(rule.validFor) &&
      isStringArray(rule.invalidFor) &&
      typeof rule.description === "string",
  );
}

/** 图表数据特征规则：与 quality-audit.skill 的 CHART_DATA_RULES 同形 */
function isChartDataRules(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return (
    isStringArray(v.categoryKeywords) &&
    isStringArray(v.timeSeriesKeywords) &&
    isStringArray(v.proportionKeywords)
  );
}

/** 分页密度：与 content-analyzer.skill 的 PAGE_DENSITY 同形 */
function isPageDensityThresholds(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return (
    typeof v.MAX_SECTIONS_PER_PAGE === "number" &&
    typeof v.MAX_CHARS_PER_PAGE === "number"
  );
}

const STRATEGY_OVERLAY_GUARDS: ReadonlyArray<
  [OfficePolicyKey, (v: unknown) => boolean]
> = [
  [OFFICE_POLICY_KEYS.TEMPLATE_MATCH_WEIGHTS, isTemplateMatchWeights],
  [OFFICE_POLICY_KEYS.QUALITY_AUDIT_SEMANTIC_RULES, isTemplateContentRules],
  [OFFICE_POLICY_KEYS.CHART_DATA_RULES, isChartDataRules],
  [OFFICE_POLICY_KEYS.PAGE_DENSITY, isPageDensityThresholds],
];

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class OfficePolicyService {
  private readonly logger = new Logger(OfficePolicyService.name);

  constructor(private readonly policyConfig: PolicyConfigService) {}

  /**
   * PROMPT 类策略 dual-read（async 消费点）。
   * DB 空 / flag 关 / DB 异常 / value 形状不对时逐字节返回 codeFallback。
   */
  async prompt(key: OfficePolicyKey, codeFallback: string): Promise<string> {
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

  /**
   * 刷新 THRESHOLD 类策略的 sync overlay 快照（skill async execute 入口调用；
   * PolicyConfigService 内置 60s 缓存，重复刷新开销可忽略）。
   * DB 无 active 行 / flag 未含 office / value 形状非法 → overlay 清空
   * （sync getter 回代码常量，零下降）。
   */
  async refreshStrategyOverlays(): Promise<void> {
    for (const [key, guard] of STRATEGY_OVERLAY_GUARDS) {
      const resolution = await this.policyConfig.resolve<unknown>(key, null);
      if (resolution.source === "code" || resolution.value == null) {
        strategyOverlays.delete(key);
        continue;
      }
      if (!guard(resolution.value)) {
        this.logger.warn(
          `Policy "${key}" v${resolution.version} value malformed, ` +
            "keeping code values",
        );
        strategyOverlays.delete(key);
        continue;
      }
      strategyOverlays.set(key, resolution.value);
    }
  }
}
