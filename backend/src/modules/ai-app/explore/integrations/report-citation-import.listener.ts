/**
 * ReportCitationImportListener —— 引用→公共信源库导入桥（explore 消费端）
 *
 * ★ 2026-07-21：监听 playground.report.completed（S11 成功终态后 emit），
 * 把 Insight 报告的合格参考文献分级导入公共前沿库（Resource 表）。
 *
 * 分级闸门（2026-07-21 用户确认）：
 *   - credibilityScore >= 70 且 sourceType ∈ {gov, academic, news, industry}
 *     → 自动入库（industry-report 白名单源经 curatedSources 覆盖后为 90 分，可过）
 *   - blog / community / other 或低分 → 直接跳过（公共库保持干净，不进待审队列）
 *   - 单 mission 上限 30 条，超出取信誉分最高的 30，丢弃量记日志
 *   - ★ 2026-07-24（用户拍板）：文档/产品参考页（docs 子域、/docs//about/
 *     /pricing 等）完全不入库——白名单信誉分加成会把这类页面推过 70 分线，
 *     曾致 Claude Docs 手册页灌满"报告"tab
 *
 * 幂等：ImportManagerService.importWithMetadata 按 sourceUrl 幂等
 * （已存在则更新），同一篇被多个 mission 引用不会重复建记录。
 *
 * 解耦：与 playground 只共享事件名 + payload 类型（type-only import）。
 * 监听器绝不抛错——导入失败逐条降级记日志，不影响任何主流程。
 */

import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import type { ResourceType } from "@prisma/client";
import { ImportManagerService } from "../ingestion/config/services/import-manager.service";
import type { ParsedUrlMetadata } from "../ingestion/config/services/metadata-extractor.service";
import { ResourceTaggingService } from "./resource-tagging.service";
import {
  PLAYGROUND_REPORT_COMPLETED_EVENT,
  type PlaygroundReportCompletedPayload,
  type ReportCitationSnapshot,
} from "../../playground/integrations/playground-events";

/** 自动入库的最低信誉分（0-100） */
const MIN_CREDIBILITY_SCORE = 70;
/** 单 mission 最多导入条数（防公共库被单次 mission 长尾灌水） */
const MAX_IMPORTS_PER_MISSION = 30;

/** 允许入库的 sourceType → 信源库 ResourceType 映射（不在表内的直接跳过） */
const SOURCE_TYPE_TO_RESOURCE_TYPE: Partial<
  Record<NonNullable<ReportCitationSnapshot["sourceType"]>, ResourceType>
> = {
  gov: "POLICY",
  academic: "PAPER",
  news: "NEWS",
  industry: "REPORT",
};

/** academic 引用里"真论文 URL"的模式（对齐 ImportManagerService.isPaperUrl 的
 *  已知学术源；不匹配的 academic 引用降级为 REPORT，避免 PAPER 校验抛错） */
const PAPER_URL_PATTERN =
  /(arxiv\.org|doi\.org|ieee\.org|acm\.org|springer|sciencedirect|nature\.com|pubmed|biorxiv|ssrn\.com|openreview\.net)/i;

/** 裸主机名/域名模式（无空格、以 TLD 结尾），如 mckinsey.com / hai.stanford.edu */
const BARE_HOSTNAME_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;

/** 文档站子域（docs.anthropic.com / help.openai.com 等） */
const DOCS_HOST_PATTERN = /^(docs|help|support|developers?)\./i;
/** 文档/产品样板页路径（手册、API 参考、About/Pricing 等公司页） */
const DOCS_PATH_PATTERN =
  /\/(docs|documentation|reference|api-reference|manual|about|about-us|pricing|terms|privacy|legal|careers|contact|faq|changelog|release-notes)(\/|$)/i;

/**
 * ★ 2026-07-24：文档/产品参考页识别。这类页面是产品手册/公司样板页，
 * 不是"内容"，完全不入公共信源库（同一谓词供存量清理 SQL 对齐使用）。
 */
export function isDocsOrReferenceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // .pdf 是"文档文件"不是"文档站页面"——WEF/NLR 等机构把报告 PDF 挂在
    // docs. 子域或 /docs/ 路径下（2026-07-25 存量 dry-run 实锤误伤），豁免
    if (/\.pdf$/i.test(u.pathname)) return false;
    if (DOCS_HOST_PATTERN.test(u.hostname)) return true;
    return DOCS_PATH_PATTERN.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * ★ 2026-07-21：判断 citation 是否有"真实标题"。
 * 报告里一部分分析师/政府源（mckinsey / hai.stanford / whitehouse 等）的
 * citation 只有 URL、title 回落成域名、snippet 为空——导入后信源库卡片显示
 * 一串裸域名，无标题无内容。这类引用挡在门外，不入库。
 */
function hasRealTitle(citation: ReportCitationSnapshot): boolean {
  const title = citation.title?.trim();
  if (!title) return false;
  // 标题就是裸域名（无空格 + 域名形状）→ 非真实标题
  if (BARE_HOSTNAME_PATTERN.test(title)) return false;
  // 标题恰好等于 domain（含/不含 www.）→ 非真实标题
  const domain = (citation.domain ?? "").toLowerCase().replace(/^www\./, "");
  if (domain && title.toLowerCase().replace(/^www\./, "") === domain) {
    return false;
  }
  return true;
}

/** importCitations 结果统计（backfill 汇总复用） */
export interface CitationImportStats {
  /** 实际导入（dryRun 时为"将导入"）条数 */
  imported: number;
  /** 导入失败条数 */
  failed: number;
  /** 被分级闸门挡下条数 */
  gated: number;
  /** 因单 mission 上限被截断条数 */
  capped: number;
}

@Injectable()
export class ReportCitationImportListener {
  private readonly logger = new Logger(ReportCitationImportListener.name);

  constructor(
    private readonly importManager: ImportManagerService,
    private readonly tagging: ResourceTaggingService,
  ) {}

  @OnEvent(PLAYGROUND_REPORT_COMPLETED_EVENT, { async: true })
  async handleReportCompleted(
    payload: PlaygroundReportCompletedPayload,
  ): Promise<void> {
    try {
      await this.importCitations(payload.missionId, payload.citations ?? []);
    } catch (err) {
      // 监听器兜底：任何异常都不外抛（事件消费失败不影响 mission / 其他监听方）
      this.logger.error(
        `[${payload?.missionId ?? "unknown"}] citation import listener failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 分级闸门 + 类型映射 + 30 条截断 + 幂等导入的核心链路。
   * ★ 2026-07-21 (backfill): 从 handleReportCompleted 抽出，供存量报告回填
   * 服务复用；dryRun 只统计不写库。
   */
  async importCitations(
    missionId: string,
    citations: ReportCitationSnapshot[],
    opts: { dryRun?: boolean } = {},
  ): Promise<CitationImportStats> {
    const eligible = citations.filter(
      (c) =>
        !!c.url &&
        (c.credibilityScore ?? 0) >= MIN_CREDIBILITY_SCORE &&
        !!c.sourceType &&
        c.sourceType in SOURCE_TYPE_TO_RESOURCE_TYPE &&
        // ★ 2026-07-21：必须有真实标题，挡掉裸域名/无标题的半成品引用
        hasRealTitle(c) &&
        // ★ 2026-07-24：文档/产品参考页完全不入库
        !isDocsOrReferenceUrl(c.url),
    );
    const gated = citations.length - eligible.length;
    if (eligible.length === 0) {
      this.logger.debug(
        `[${missionId}] no citations passed the import gate (${citations.length} total)`,
      );
      return { imported: 0, failed: 0, gated, capped: 0 };
    }

    const selected = [...eligible]
      .sort((a, b) => (b.credibilityScore ?? 0) - (a.credibilityScore ?? 0))
      .slice(0, MAX_IMPORTS_PER_MISSION);
    const capped = eligible.length - selected.length;
    if (capped > 0) {
      this.logger.warn(
        `[${missionId}] citation import capped at ${MAX_IMPORTS_PER_MISSION}, dropped ${capped} lower-credibility entries`,
      );
    }

    if (opts.dryRun) {
      return { imported: selected.length, failed: 0, gated, capped };
    }

    let imported = 0;
    let failed = 0;
    for (const citation of selected) {
      try {
        const result = await this.importManager.importWithMetadata(
          citation.url,
          this.resolveResourceType(citation),
          this.buildMetadata(citation, missionId),
          true, // skipDuplicateWarning：批量后台导入，跳过逐条重复度指标计算
        );
        imported++;
        // ★ 2026-07-21: 导入后 classify-only 打标（写 UI 展示字段 categories）。
        //   幂等 skip-if-tagged、非致命——批量回填可重跑，成本可控。await 保证
        //   批量场景标签落库（实时事件路径同样是后台，await 无碍）。
        const resourceId =
          (result as { resourceId?: string; id?: string })?.resourceId ??
          (result as { id?: string })?.id;
        if (resourceId) {
          // .catch 兜底：打标失败绝不污染导入计数（tagResource 已内部吞错，双保险）
          await this.tagging.tagResource(resourceId).catch(() => false);
        }
      } catch (err) {
        failed++;
        this.logger.warn(
          `[${missionId}] import citation failed (${citation.url}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `[${missionId}] citation import done: ${imported} imported, ${failed} failed, ${gated} gated out`,
    );
    return { imported, failed, gated, capped };
  }

  private resolveResourceType(citation: ReportCitationSnapshot): ResourceType {
    const mapped =
      SOURCE_TYPE_TO_RESOURCE_TYPE[
        citation.sourceType as NonNullable<ReportCitationSnapshot["sourceType"]>
      ] ?? "REPORT";
    // academic 但 URL 不是已知学术源模式 → 降级 REPORT（PAPER 有严格 URL 校验）
    if (mapped === "PAPER" && !PAPER_URL_PATTERN.test(citation.url)) {
      return "REPORT";
    }
    return mapped;
  }

  private buildMetadata(
    citation: ReportCitationSnapshot,
    missionId: string,
  ): ParsedUrlMetadata {
    const domain =
      citation.domain || this.extractDomain(citation.url) || "unknown";
    return {
      url: citation.url,
      domain,
      title: citation.title?.trim() || domain,
      description: citation.snippet,
      publishedDate: this.parseDate(citation.publishedAt),
      language: "en",
      contentType: "html",
      sourceMissionId: missionId,
    };
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
}
