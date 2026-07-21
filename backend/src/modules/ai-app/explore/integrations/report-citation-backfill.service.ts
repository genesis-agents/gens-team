/**
 * ReportCitationBackfillService —— 存量 Insight 报告参考文献回填公共信源库
 *
 * ★ 2026-07-21：引用→信源库桥是事件驱动增量机制（S11 成功终态才 emit），
 * 存量已完成 mission 永远不会再触发。本服务做一次性回填：
 *
 *   1. 扫 status=completed 且 reportArtifactVersion=2 的 mission
 *      （v1 无结构化 citations、reportFull 已 off-load 到 R2 的行跳过并计数）
 *   2. ★ 回填时重算信誉分：存量 citations 是管道修复前打的分
 *      （semianalysis 等白名单分析师源 = 启发式 65，直接过 70 闸门会被挡掉），
 *      按 IndustrySourceRegistryService 白名单映射套用与 assembler 相同的
 *      覆盖规则（分取 max、弱信号类型归 industry）后再进闸门
 *   3. 复用 ReportCitationImportListener.importCitations（同一套闸门/映射/
 *      截断/幂等导入），dryRun 只统计不写库
 *
 * 幂等：importWithMetadata 按 sourceUrl 幂等更新，重复跑不会重复建记录。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { IndustrySourceRegistryService } from "@/modules/ai-engine/facade";
import {
  ReportCitationImportListener,
  type CitationImportStats,
} from "./report-citation-import.listener";
import type { ReportCitationSnapshot } from "../../playground/integrations/playground-events";

export interface BackfillOptions {
  /** 只统计不写库 */
  dryRun?: boolean;
  /** 最多处理多少个 mission（按完成时间倒序），默认不限 */
  limit?: number;
  /** 只回填指定 mission */
  missionId?: string;
}

export interface BackfillSummary extends CitationImportStats {
  dryRun: boolean;
  /** 扫描的 completed+v2 mission 数 */
  missionsScanned: number;
  /** 实际有 citations 参与回填的 mission 数 */
  missionsWithCitations: number;
  /** reportFull 已 off-load 到 R2（DB 为 NULL）跳过数 */
  offloadedSkipped: number;
}

/** 与 assembler 覆盖规则一致的弱信号类型集（仅这些会被白名单归为 industry） */
const WEAK_SOURCE_TYPES = new Set(["industry", "blog", "other"]);

@Injectable()
export class ReportCitationBackfillService {
  private readonly logger = new Logger(ReportCitationBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importListener: ReportCitationImportListener,
    private readonly industrySourceRegistry: IndustrySourceRegistryService,
  ) {}

  async backfill(opts: BackfillOptions = {}): Promise<BackfillSummary> {
    const dryRun = opts.dryRun ?? false;
    const curated = await this.loadCuratedMap();

    const missions = await this.prisma.agentPlaygroundMission.findMany({
      where: {
        status: "completed",
        reportArtifactVersion: 2,
        ...(opts.missionId ? { id: opts.missionId } : {}),
      },
      select: { id: true, reportFull: true, reportFullUri: true },
      orderBy: { completedAt: "desc" },
      ...(opts.limit ? { take: opts.limit } : {}),
    });

    const summary: BackfillSummary = {
      dryRun,
      missionsScanned: missions.length,
      missionsWithCitations: 0,
      offloadedSkipped: 0,
      imported: 0,
      failed: 0,
      gated: 0,
      capped: 0,
    };

    for (const mission of missions) {
      if (!mission.reportFull) {
        // off-load 到 R2 的行 DB 置 NULL —— 回填不追 R2（占比小、可后续单独跑）
        if (mission.reportFullUri) summary.offloadedSkipped++;
        continue;
      }
      const citations = this.extractCitations(mission.reportFull);
      if (citations.length === 0) continue;

      summary.missionsWithCitations++;
      const rescored = citations.map((c) =>
        this.applyCuratedOverride(c, curated),
      );
      const stats = await this.importListener.importCitations(
        mission.id,
        rescored,
        { dryRun },
      );
      summary.imported += stats.imported;
      summary.failed += stats.failed;
      summary.gated += stats.gated;
      summary.capped += stats.capped;
    }

    this.logger.log(
      `[backfill] ${dryRun ? "DRY-RUN " : ""}done: ${summary.missionsScanned} missions scanned, ` +
        `${summary.missionsWithCitations} with citations, ${summary.imported} imported, ` +
        `${summary.failed} failed, ${summary.gated} gated, ${summary.capped} capped, ` +
        `${summary.offloadedSkipped} offloaded-skipped`,
    );
    return summary;
  }

  /** 白名单域名 → 信誉分（0-1）映射，取失败降级为空（回填仍按存量分跑） */
  private async loadCuratedMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
      const entries =
        await this.industrySourceRegistry.getCuratedDomainScores();
      for (const e of entries) map.set(e.domain, e.credibilityScore);
    } catch (err) {
      this.logger.warn(
        `[backfill] load curated sources failed, proceeding with stored scores only: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return map;
  }

  /** 从 reportFull JSONB 提取 citations（v2 ReportArtifact 顶层 citations 数组） */
  private extractCitations(reportFull: unknown): ReportCitationSnapshot[] {
    const citations = (reportFull as { citations?: unknown })?.citations;
    if (!Array.isArray(citations)) return [];
    return citations
      .filter(
        (c): c is Record<string, unknown> =>
          !!c &&
          typeof c === "object" &&
          typeof (c as { url?: unknown }).url === "string",
      )
      .map((c) => ({
        url: c.url as string,
        title: typeof c.title === "string" ? c.title : undefined,
        domain: typeof c.domain === "string" ? c.domain : undefined,
        snippet: typeof c.snippet === "string" ? c.snippet : undefined,
        publishedAt:
          typeof c.publishedAt === "string" ? c.publishedAt : undefined,
        sourceType:
          typeof c.sourceType === "string"
            ? (c.sourceType as ReportCitationSnapshot["sourceType"])
            : undefined,
        credibilityScore:
          typeof c.credibilityScore === "number"
            ? c.credibilityScore
            : undefined,
      }));
  }

  /**
   * 与 ReportArtifactAssembler.buildCitations 相同的白名单覆盖规则：
   * 命中域名 → 分取 max(存量, 白名单*100)；类型仅弱信号（industry/blog/other
   * 或缺失）归 industry，强信号（gov/academic/news/community）保留。
   */
  private applyCuratedOverride(
    citation: ReportCitationSnapshot,
    curated: Map<string, number>,
  ): ReportCitationSnapshot {
    if (curated.size === 0) return citation;
    const domain = (citation.domain || this.domainOf(citation.url) || "")
      .toLowerCase()
      .replace(/^www\./, "");
    if (!domain) return citation;

    let score: number | undefined = curated.get(domain);
    if (score === undefined) {
      for (const [cd, s] of curated) {
        if (domain.endsWith(`.${cd}`)) {
          score = s;
          break;
        }
      }
    }
    if (score === undefined) return citation;

    const weakType =
      !citation.sourceType || WEAK_SOURCE_TYPES.has(citation.sourceType);
    return {
      ...citation,
      sourceType: weakType ? "industry" : citation.sourceType,
      credibilityScore: Math.max(
        citation.credibilityScore ?? 0,
        Math.round(score * 100),
      ),
    };
  }

  private domainOf(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}
