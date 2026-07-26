/**
 * CitationImportPurgeService —— 存量"引用自动入库"资源的闸门补齐清理
 *
 * ★ 2026-07-26：引用→信源库导入闸门是逐次加严的（07-24 docs 页、07-25 首页、
 * 07-26 文献聚合页）。加严只对新导入生效，早于闸门入库的存量记录一直留在
 * 公共信源库里——"报告"tab 里大量 semanticscholar.org 聚合页卡片（只有一行
 * snippet、点进去阅读器提不出正文）就是这么来的。
 *
 * 本服务用**与导入闸门同一份谓词**（直接 import，绝不复写正则）回扫存量：
 *   1. 只扫引用导入产生的行：raw_data.source='manual_import' 且
 *      data._raw.sourceMissionId 非空（用户手动导入的 URL 没有这个字段，不误伤）
 *   2. 命中 aggregator / docs / homepage 任一谓词 → 候选
 *   3. 无 notes/comments 的候选物理删除；有用户数据的只标 linkHealth=ARCHIVED
 *      （对齐 ResourcesService.cleanupBrokenResources 的既有口径）
 *   4. 删除/归档前先写 lifecycle 事件留审计轨迹
 *
 * dryRun 默认 true：先看统计（按原因 + 按域名 Top10）再决定是否实跑。
 */

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResourceLifecycleService } from "../resources/resource-lifecycle.service";
import {
  isAggregatorUrl,
  isDocsOrReferenceUrl,
  isHomepageUrl,
} from "./report-citation-import.listener";

/** 命中的闸门原因（与导入侧谓词一一对应） */
export type PurgeReason = "aggregator" | "docs" | "homepage";

export interface PurgeOptions {
  /** 只统计不写库（默认 true —— 运维操作默认不破坏数据） */
  dryRun?: boolean;
  /** 最多扫描多少条引用导入记录，默认不限 */
  limit?: number;
}

export interface PurgeSummary {
  dryRun: boolean;
  /** 扫描的引用导入资源数 */
  scanned: number;
  /** 命中闸门的条数 */
  matched: number;
  /** 实际删除（dryRun 时为"将删除"） */
  deleted: number;
  /** 实际归档（有用户 notes/comments，保守保留） */
  archived: number;
  /** 命中原因分布 */
  byReason: Record<PurgeReason, number>;
  /** 命中最多的域名 Top 10（人工核对用） */
  topDomains: Array<{ domain: string; count: number }>;
}

interface CandidateRow {
  id: string;
  source_url: string;
}

@Injectable()
export class CitationImportPurgeService {
  private readonly logger = new Logger(CitationImportPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ResourceLifecycleService,
  ) {}

  async purge(opts: PurgeOptions = {}): Promise<PurgeSummary> {
    const dryRun = opts.dryRun ?? true;
    const limitClause =
      opts.limit && opts.limit > 0
        ? Prisma.sql`LIMIT ${Math.floor(opts.limit)}`
        : Prisma.empty;

    // 只取引用导入产生的行（sourceMissionId 是 ReportCitationImportListener
    // .buildMetadata 独有的标记，手动导入/爬虫入库都没有）
    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      SELECT r.id, r.source_url
      FROM resources r
      JOIN raw_data rd ON rd.id = r.raw_data_id
      WHERE rd.source = 'manual_import'
        AND rd.data->'_raw'->>'sourceMissionId' IS NOT NULL
      ORDER BY r.created_at DESC
      ${limitClause}
    `;

    const byReason: Record<PurgeReason, number> = {
      aggregator: 0,
      docs: 0,
      homepage: 0,
    };
    const domainCount = new Map<string, number>();
    const matchedIds: string[] = [];

    for (const row of rows) {
      const reason = this.classify(row.source_url);
      if (!reason) continue;
      byReason[reason]++;
      matchedIds.push(row.id);
      const domain = this.domainOf(row.source_url) ?? "unknown";
      domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
    }

    const topDomains = [...domainCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    const summary: PurgeSummary = {
      dryRun,
      scanned: rows.length,
      matched: matchedIds.length,
      deleted: 0,
      archived: 0,
      byReason,
      topDomains,
    };

    if (matchedIds.length === 0) {
      this.logger.log(
        `[purge] ${dryRun ? "DRY-RUN " : ""}nothing to purge (${rows.length} citation-imported resources scanned)`,
      );
      return summary;
    }

    // 有 notes/comments 的保守归档，其余物理删除（对齐 cleanupBrokenResources）
    const select = { id: true, sourceUrl: true, title: true, type: true };
    const toDelete = await this.prisma.resource.findMany({
      where: {
        id: { in: matchedIds },
        notes: { none: {} },
        comments: { none: {} },
      },
      select,
    });
    const toArchive = await this.prisma.resource.findMany({
      where: {
        id: { in: matchedIds },
        OR: [{ notes: { some: {} } }, { comments: { some: {} } }],
      },
      select,
    });

    summary.deleted = toDelete.length;
    summary.archived = toArchive.length;

    if (dryRun) {
      this.logger.log(
        `[purge] DRY-RUN: ${summary.matched} matched of ${summary.scanned} scanned ` +
          `(would delete ${summary.deleted}, archive ${summary.archived}); ` +
          `reasons=${JSON.stringify(byReason)}`,
      );
      return summary;
    }

    await this.lifecycle.recordBatch([
      ...toDelete.map((r) => ({
        resourceId: r.id,
        action: "HARD_DELETED" as const,
        reason: "citation-import-gate-purge",
        actor: "API_ADMIN" as const,
        snapshot: { sourceUrl: r.sourceUrl, title: r.title, type: r.type },
      })),
      ...toArchive.map((r) => ({
        resourceId: r.id,
        action: "ARCHIVED" as const,
        reason: "citation-import-gate-purge",
        actor: "API_ADMIN" as const,
        snapshot: { sourceUrl: r.sourceUrl, title: r.title, type: r.type },
      })),
    ]);

    const result = await this.prisma.$transaction(async (tx) => {
      // deleteMany 的 where 再叠一次 notes/comments none —— 防 select 到 delete
      // 之间用户刚写笔记导致误删（沿用 cleanupBrokenResources 的双保险）
      const deleteResult = await tx.resource.deleteMany({
        where: {
          id: { in: toDelete.map((r) => r.id) },
          notes: { none: {} },
          comments: { none: {} },
        },
      });
      const archiveResult = await tx.resource.updateMany({
        where: { id: { in: toArchive.map((r) => r.id) } },
        data: { linkHealth: "ARCHIVED" },
      });
      return { deleted: deleteResult.count, archived: archiveResult.count };
    });

    summary.deleted = result.deleted;
    summary.archived = result.archived;
    this.logger.log(
      `[purge] done: deleted=${summary.deleted}, archived=${summary.archived} ` +
        `(kept for user data), reasons=${JSON.stringify(byReason)}`,
    );
    return summary;
  }

  /** 命中哪条闸门（都不命中返回 null）——谓词直接复用导入侧，避免两套规则漂移 */
  private classify(url: string): PurgeReason | null {
    if (isAggregatorUrl(url)) return "aggregator";
    if (isDocsOrReferenceUrl(url)) return "docs";
    if (isHomepageUrl(url)) return "homepage";
    return null;
  }

  private domainOf(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
}
