/**
 * IndustrySourceRegistryService —— 精选行业源配置的唯一读取口
 *
 * 数据源：tool_configs.industry-report.config.sources（管理员可配置
 * domain / credibilityScore / enabled / topicTypes）。
 *
 * ★ 2026-07-21 (citation 管道修复)：原本这份配置只有 IndustryReportSearchTool
 *   自己读（私有 cache），白名单的 credibilityScore 无法传导到最终报告的
 *   ArtifactCitation（assembler 启发式把 semianalysis 重打成 industry/65）。
 *   抽出独立 service 后：
 *     - IndustryReportSearchTool 委托本 service 取源（去掉自己的 cache）
 *     - mission 装配链（s8 → ReportArtifactAssembler.curatedSources）经
 *       engine facade 注入，用白名单信誉分覆盖启发式
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { getToolIdAliases } from "@/common/ai/tool-id-aliases";

export interface IndustryReportSourceConfig {
  id: string;
  name: string;
  domain: string;
  category: string;
  credibilityScore: number;
  enabled: boolean;
  topicTypes: string[];
}

/** 精选源域名 → 信誉分映射条目（citation 覆盖用的最小形状） */
export interface CuratedDomainScore {
  domain: string;
  name: string;
  /** 0-1 */
  credibilityScore: number;
}

const INDUSTRY_REPORT_TOOL_ID = "industry-report-search";

@Injectable()
export class IndustrySourceRegistryService {
  private readonly logger = new Logger(IndustrySourceRegistryService.name);
  private cachedSources: IndustryReportSourceConfig[] | null = null;
  private cacheExpiry = 0;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /** 全部配置源（含 disabled），带 5 分钟缓存 */
  async getSources(): Promise<IndustryReportSourceConfig[]> {
    if (this.cachedSources && Date.now() < this.cacheExpiry) {
      return this.cachedSources;
    }
    try {
      this.cachedSources = await this.loadConfiguredSources();
    } catch (err) {
      this.logger.warn(
        `Failed to load industry-report sources: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.cachedSources = [];
    }
    this.cacheExpiry = Date.now() + IndustrySourceRegistryService.CACHE_TTL_MS;
    return this.cachedSources;
  }

  /**
   * enabled 源，按 topicType 过滤（fail-soft）：
   *   - topicType 为空 → 所有 enabled
   *   - topicType 命中至少 1 个 → 过滤子集
   *   - topicType 全不命中 → fallback 所有 enabled（不让一个 LLM-invented
   *     topicType 把整个工具变废，2026-05-04 教训）
   */
  async getEnabledSources(
    topicType?: string,
  ): Promise<IndustryReportSourceConfig[]> {
    const sources = await this.getSources();
    const enabled = sources.filter((s) => s.enabled);
    if (!topicType) return enabled;
    const matched = enabled.filter((s) => s.topicTypes.includes(topicType));
    if (matched.length > 0) return matched;
    if (enabled.length > 0) {
      this.logger.warn(
        `[industry-report] topicType="${topicType}" matched 0 sources; fallback to all ${enabled.length} enabled`,
      );
      return enabled;
    }
    return [];
  }

  /** enabled 源的域名→信誉分映射（citation credibility 覆盖用） */
  async getCuratedDomainScores(): Promise<CuratedDomainScore[]> {
    const sources = await this.getSources();
    return sources
      .filter((s) => s.enabled && s.domain)
      .map((s) => ({
        domain: s.domain.toLowerCase().replace(/^www\./, ""),
        name: s.name,
        credibilityScore: s.credibilityScore,
      }));
  }

  private async loadConfiguredSources(): Promise<IndustryReportSourceConfig[]> {
    for (const toolId of getToolIdAliases(INDUSTRY_REPORT_TOOL_ID)) {
      const cfg = await this.prisma.toolConfig.findUnique({
        where: { toolId },
      });
      const config = cfg?.config as
        | { sources?: IndustryReportSourceConfig[] }
        | undefined
        | null;
      const sources = config?.sources ?? [];
      if (sources.length > 0) {
        return sources;
      }
    }
    return [];
  }
}
