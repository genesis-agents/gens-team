/**
 * Industry Report Search Tool
 * 行业报告搜索工具 - 在 a16z / McKinsey / SemiAnalysis 等管理员配置的行业报告源
 * 中检索内容。
 *
 * 来源清单从 DB tool_configs.config.sources 读取（管理员可配置 enabled 域名 +
 * credibility 评分），实际检索通过 web-search 工具加 site: 前缀完成。
 *
 * 历史背景：原本只有 TI 内部的 IndustryReportSearchAdapter 可用此能力，
 * consumer researcher 无法调用。本工具把适配器逻辑沉淀到 ai-engine/tools，
 * 让所有 BaseAgent（含 consumer）的 toolRegistry 都能召回到。
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../../base/base-tool";
import { ToolRegistry } from "../../../registry/tool.registry";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../abstractions/tool.interface";
// ★ 2026-07-21: 源配置读取抽到 IndustrySourceRegistryService（与 citation
//   credibility 覆盖链共用同一份缓存），本工具不再自持 cache / prisma。
import { IndustrySourceRegistryService } from "./industry-source-registry.service";
import {
  resolveEffectiveTimeRange,
  SEARCH_TIME_RANGE_VALUES,
  type SearchTimeRange,
} from "@/common/search/search-time-range";

// ============================================================================
// Types
// ============================================================================

export interface IndustryReportSearchInput {
  /** 搜索查询 */
  query: string;
  /** 最大结果数，默认 10 */
  maxResults?: number;
  /** 主题类型过滤（technology / finance / energy / 等），按 source.topicTypes 收窄 */
  topicType?: string;
  /** 搜索时间范围 */
  timeRange?: SearchTimeRange;
}

export interface IndustryReportItem {
  /** 标题 */
  title: string;
  /** URL */
  url: string;
  /** 摘要 */
  snippet: string;
  /** 发布日期 */
  publishedDate?: string;
  /** 命中的来源名称（如 "a16z" / "McKinsey"） */
  source: string;
  /** 来源域名 */
  domain: string;
  /** 信誉评分（0-1） */
  credibilityScore: number;
}

export interface IndustryReportSearchOutput {
  /** 命中条目 */
  items: IndustryReportItem[];
  /** 实际检索的来源数（去重） */
  sourcesQueried: number;
  /** 是否成功 */
  success: boolean;
  /** 失败原因 */
  error?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class IndustryReportSearchTool extends BaseTool<
  IndustryReportSearchInput,
  IndustryReportSearchOutput
> {
  private readonly logger = new Logger(IndustryReportSearchTool.name);

  readonly id = "industry-report-search";
  readonly sideEffect = "none" as const;
  readonly name = "Industry Report Search";
  readonly description =
    "在精选行业研报源（如 a16z / McKinsey / BCG / SemiAnalysis / Brookings 等）检索行业洞察与趋势报告。来源清单与信誉评分由管理员在 tool_configs 中配置。适合商业 / 战略 / 行业分析 / 趋势研究类维度。";
  readonly category: ToolCategory = "information";
  readonly tags = ["industry", "report", "research", "analyst", "business"];
  // 本工具内部还要嵌套调一次 web-search（其 provider HTTP 超时本身就达 30s），
  // 故给足预算；嵌套调用另设更短子预算（见 NESTED_WEB_SEARCH_TIMEOUT_MS）并优雅降级，
  // 确保即便底层搜索慢也能在本预算内返回，而不是被 tool-invoker 硬超时杀掉（"工具故障"）。
  readonly defaultTimeout = 30000;

  /** 嵌套 web-search 子预算（< defaultTimeout，留处理余量）；超时降级为空，任务继续。 */
  private static readonly NESTED_WEB_SEARCH_TIMEOUT_MS = 26000;

  /**
   * ★ 2026-07-21: site: 过滤最多取 8 个域名（按 credibilityScore 降序）。
   * 原 slice(0,5) 按数组原始顺序截断，白名单加源后高信誉源可能被挤出；
   * Tavily 路径会把 site: 整体转成 include_domains 不受串长影响，
   * Serper（Google）8 个 site: OR 仍在查询词数限制内。
   */
  private static readonly SITE_FILTER_MAX_SOURCES = 8;

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，例如 'AI infrastructure'、'GPU shortage'。",
      },
      maxResults: {
        type: "number",
        description: "最大结果数，默认 10",
        default: 10,
      },
      topicType: {
        type: "string",
        // ★ 2026-07-26: 词表对齐配置里真实使用的 ResearchTopicType 字面量。
        //   原描述给的是 technology/finance/energy，与 tool_configs 里的
        //   TECHNOLOGY/MACRO/COMPANY/EVENT 不是同一套词，模型照着填必然不命中。
        //   匹配已改为大小写不敏感，填小写同样有效；不命中仍 fail-soft 全量检索。
        description:
          "主题类型，按来源 topicTypes 字段过滤，可选。取值：TECHNOLOGY（技术专项）/ MACRO（宏观行业）/ COMPANY（企业）/ EVENT（事件）。",
      },
      timeRange: {
        type: "string",
        description:
          "搜索时间范围：30d=最近1个月，90d=最近3个月，180d=最近6个月，365d=最近12个月，730d=最近24个月，all=不限",
        enum: [...SEARCH_TIME_RANGE_VALUES],
        default: "all",
      },
    },
    required: ["query"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            snippet: { type: "string" },
            publishedDate: { type: "string" },
            source: { type: "string" },
            domain: { type: "string" },
            credibilityScore: { type: "number" },
          },
        },
      },
      sourcesQueried: { type: "number" },
      error: { type: "string" },
    },
  };

  constructor(
    private readonly sourceRegistry: IndustrySourceRegistryService,
    private readonly toolRegistry: ToolRegistry,
  ) {
    super();
  }

  protected async doExecute(
    input: IndustryReportSearchInput,
    context: ToolContext,
  ): Promise<IndustryReportSearchOutput> {
    const { query, maxResults = 10, topicType } = input;
    const timeRange = resolveEffectiveTimeRange(
      input.timeRange,
      context.metadata,
    );

    try {
      const sources = await this.sourceRegistry.getEnabledSources(topicType);
      if (sources.length === 0) {
        return {
          success: false,
          items: [],
          sourcesQueried: 0,
          error:
            "No enabled industry report sources configured. 管理员需在 tool_configs.industry-report.config.sources 配置启用源。",
        };
      }

      // ★ 2026-07-21: 按 credibilityScore 降序取前 N 个域名拼 site: query，
      //   保证 semianalysis / stratechery 等高信誉分析师源始终进定向查询。
      const curated = [...sources]
        .sort((a, b) => b.credibilityScore - a.credibilityScore)
        .slice(0, IndustryReportSearchTool.SITE_FILTER_MAX_SOURCES);
      const siteFilter = curated.map((s) => `site:${s.domain}`).join(" OR ");
      const siteQuery = `(${siteFilter}) ${query}`;

      const webSearchTool = this.toolRegistry.tryGet("web-search");
      if (!webSearchTool) {
        return {
          success: false,
          items: [],
          sourcesQueried: curated.length,
          error:
            "web-search tool not registered (required by industry-report-search).",
        };
      }

      // 嵌套 web-search 走子预算 race：底层 provider HTTP 超时达 30s，且会跨
      // provider/key 回退串行累加，可能远超本工具预算。这里在 NESTED_WEB_SEARCH_TIMEOUT_MS
      // 处优雅降级（返回 success:false + 空，任务继续），而非让 tool-invoker 把整个工具
      // 硬超时杀掉（截图里的"工具故障 timed out after 20000ms"）。
      const execWrapped = webSearchTool
        .execute(
          { query: siteQuery, numResults: maxResults, timeRange },
          context,
        )
        .then((r) => ({ timedOut: false as const, result: r }));
      // race 由超时胜出后，execWrapped 仍可能后续 reject —— 挂 catch 防 unhandled rejection
      execWrapped.catch(() => undefined);
      let nestedTimer: ReturnType<typeof setTimeout> | undefined;
      const raced = await Promise.race([
        execWrapped,
        new Promise<{ timedOut: true }>((resolve) => {
          nestedTimer = setTimeout(
            () => resolve({ timedOut: true }),
            IndustryReportSearchTool.NESTED_WEB_SEARCH_TIMEOUT_MS,
          );
        }),
      ]);
      if (nestedTimer) clearTimeout(nestedTimer);

      if (raced.timedOut) {
        this.logger.warn(
          `[doExecute] nested web-search exceeded ${IndustryReportSearchTool.NESTED_WEB_SEARCH_TIMEOUT_MS}ms; degrading to empty (industry sources slow)`,
        );
        return {
          success: false,
          items: [],
          sourcesQueried: curated.length,
          error: `行业研报检索超时：内部 web-search 超过 ${IndustryReportSearchTool.NESTED_WEB_SEARCH_TIMEOUT_MS}ms 未返回（来源检索慢，已降级为空，任务继续）`,
        };
      }
      const result = raced.result;

      if (!result.success || !result.data) {
        return {
          success: false,
          items: [],
          sourcesQueried: curated.length,
          error: result.error?.message ?? "web-search returned no data",
        };
      }

      const data = result.data as {
        results?: Array<{
          title: string;
          url: string;
          content?: string;
          publishedDate?: string;
        }>;
      };
      const rawResults = data.results ?? [];

      // 域名 → source 元数据查表
      const credibilityByDomain = new Map<string, number>();
      const nameByDomain = new Map<string, string>();
      for (const s of sources) {
        credibilityByDomain.set(s.domain, s.credibilityScore);
        nameByDomain.set(s.domain, s.name);
      }

      const items: IndustryReportItem[] = rawResults.map((r) => {
        let matchedCredibility = 0.7;
        let matchedSource = "Industry Report";
        let matchedDomain = "";
        try {
          matchedDomain = new URL(r.url).hostname.replace(/^www\./, "");
          for (const [domain, score] of credibilityByDomain) {
            if (
              matchedDomain.includes(domain) ||
              domain.includes(matchedDomain)
            ) {
              matchedCredibility = score;
              matchedSource = nameByDomain.get(domain) ?? matchedSource;
              break;
            }
          }
        } catch {
          // URL 解析失败 → 用默认值
        }
        return {
          title: r.title ?? "",
          url: r.url,
          snippet: r.content ?? "",
          publishedDate: r.publishedDate,
          source: matchedSource,
          domain: matchedDomain,
          credibilityScore: matchedCredibility,
        };
      });

      this.logger.log(
        `[doExecute] industry-report-search: ${items.length} items across ${curated.length} curated sources`,
      );

      return {
        success: true,
        items,
        sourcesQueried: curated.length,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[doExecute] industry-report-search failed: ${errMsg}`);
      return {
        success: false,
        items: [],
        sourcesQueried: 0,
        error: `Industry Report 搜索失败: ${errMsg}`,
      };
    }
  }
}
