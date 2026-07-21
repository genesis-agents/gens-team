/**
 * ReportCitationBackfillController —— 存量报告引用回填触发口（管理员专用）
 *
 * ★ 2026-07-21：一次性运维操作走应用内管理端点（本仓 scripts/ 无 src 引用
 * 先例，Nest bootstrap 脚本不引入新模式）。守卫对齐
 * resources.controller 的 cleanup/duplicates（JwtAuthGuard + AdminGuard）。
 *
 * 用法（先 dry-run 看统计，再实跑）：
 *   POST /api/v1/data-management/backfill/insight-citations
 *   Body: { "dryRun": true, "limit": 100, "missionId": "..." }（全部可选）
 */

import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import {
  ReportCitationBackfillService,
  type BackfillSummary,
} from "./report-citation-backfill.service";

const MAX_LIMIT = 5000;

@Controller("data-management/backfill")
export class ReportCitationBackfillController {
  constructor(
    private readonly backfillService: ReportCitationBackfillService,
  ) {}

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("insight-citations")
  async backfillInsightCitations(
    @Body()
    body: { dryRun?: boolean; limit?: number; missionId?: string } = {},
  ): Promise<BackfillSummary> {
    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(Math.floor(body.limit), MAX_LIMIT)
        : undefined;
    return this.backfillService.backfill({
      dryRun: body.dryRun === true,
      limit,
      missionId:
        typeof body.missionId === "string" && body.missionId.trim()
          ? body.missionId.trim()
          : undefined,
    });
  }
}
