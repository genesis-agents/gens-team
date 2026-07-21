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

@Injectable()
export class ReportCitationImportListener {
  private readonly logger = new Logger(ReportCitationImportListener.name);

  constructor(private readonly importManager: ImportManagerService) {}

  @OnEvent(PLAYGROUND_REPORT_COMPLETED_EVENT, { async: true })
  async handleReportCompleted(
    payload: PlaygroundReportCompletedPayload,
  ): Promise<void> {
    try {
      const eligible = (payload.citations ?? []).filter(
        (c) =>
          !!c.url &&
          (c.credibilityScore ?? 0) >= MIN_CREDIBILITY_SCORE &&
          !!c.sourceType &&
          c.sourceType in SOURCE_TYPE_TO_RESOURCE_TYPE,
      );
      if (eligible.length === 0) {
        this.logger.debug(
          `[${payload.missionId}] no citations passed the import gate (${payload.citations?.length ?? 0} total)`,
        );
        return;
      }

      const selected = [...eligible]
        .sort((a, b) => (b.credibilityScore ?? 0) - (a.credibilityScore ?? 0))
        .slice(0, MAX_IMPORTS_PER_MISSION);
      if (eligible.length > selected.length) {
        this.logger.warn(
          `[${payload.missionId}] citation import capped at ${MAX_IMPORTS_PER_MISSION}, dropped ${eligible.length - selected.length} lower-credibility entries`,
        );
      }

      let imported = 0;
      let failed = 0;
      for (const citation of selected) {
        try {
          await this.importManager.importWithMetadata(
            citation.url,
            this.resolveResourceType(citation),
            this.buildMetadata(citation, payload.missionId),
            true, // skipDuplicateWarning：批量后台导入，跳过逐条重复度指标计算
          );
          imported++;
        } catch (err) {
          failed++;
          this.logger.warn(
            `[${payload.missionId}] import citation failed (${citation.url}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      this.logger.log(
        `[${payload.missionId}] citation import done: ${imported} imported, ${failed} failed, ${(payload.citations?.length ?? 0) - eligible.length} gated out`,
      );
    } catch (err) {
      // 监听器兜底：任何异常都不外抛（事件消费失败不影响 mission / 其他监听方）
      this.logger.error(
        `[${payload?.missionId ?? "unknown"}] citation import listener failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
