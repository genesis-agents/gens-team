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

import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import {
  ReportCitationBackfillService,
  type BackfillSummary,
} from "./report-citation-backfill.service";
import {
  CitationImportPurgeService,
  type PurgeSummary,
} from "./citation-import-purge.service";

const MAX_LIMIT = 5000;
/** 保留最近 N 次运行记录（内存态，重启即丢——一次性运维操作可接受） */
const MAX_RUN_HISTORY = 20;

type RunState = "running" | "completed" | "failed";

interface RunRecord {
  runId: string;
  state: RunState;
  startedAt: string;
  finishedAt?: string;
  summary?: BackfillSummary;
  error?: string;
}

@Controller("data-management/backfill")
export class ReportCitationBackfillController {
  private readonly logger = new Logger(ReportCitationBackfillController.name);

  /**
   * ★ 2026-07-26: 运行记录内存表。不建表是刻意的——这是一次性运维端点，
   * 引一张 schema 表的代价高于收益；重启丢失可接受（结果同时进日志）。
   */
  private readonly runs = new Map<string, RunRecord>();
  private runCounter = 0;

  constructor(
    private readonly backfillService: ReportCitationBackfillService,
    private readonly purgeService: CitationImportPurgeService,
  ) {}

  /**
   * ★ 2026-07-26 异步化：实跑 517 条引用 × (导入 + LLM 打标) 需要数十分钟，
   * 必然超过 Railway 代理的请求超时——2026-07-26 实跑就吃了个 502，任务其实
   * 在服务端跑完了，但调用方拿不到结果，只能反复查库判断进度。
   *
   * 现在：dryRun 仍同步返回（秒级）；实跑立刻返回 202 + runId，后台执行，
   * 经 GET status/:runId 查询。幂等性不变（importWithMetadata 按 URL 幂等），
   * 所以即便重复触发也安全。
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("insight-citations")
  async backfillInsightCitations(
    @Body()
    body: { dryRun?: boolean; limit?: number; missionId?: string } = {},
  ): Promise<BackfillSummary | RunRecord> {
    const opts = {
      dryRun: body.dryRun === true,
      limit:
        typeof body.limit === "number" && body.limit > 0
          ? Math.min(Math.floor(body.limit), MAX_LIMIT)
          : undefined,
      missionId:
        typeof body.missionId === "string" && body.missionId.trim()
          ? body.missionId.trim()
          : undefined,
    };

    // dry-run 只读且秒级，保持同步返回
    if (opts.dryRun) {
      return this.backfillService.backfill(opts);
    }

    const runId = `backfill-${++this.runCounter}-${Date.now()}`;
    const record: RunRecord = {
      runId,
      state: "running",
      startedAt: new Date().toISOString(),
    };
    this.rememberRun(record);

    // fire-and-forget：显式 void + 内部兜底，绝不产生 unhandled rejection
    void this.backfillService
      .backfill(opts)
      .then((summary) => {
        record.state = "completed";
        record.summary = summary;
        record.finishedAt = new Date().toISOString();
        this.logger.log(`[${runId}] completed: ${JSON.stringify(summary)}`);
      })
      .catch((err: unknown) => {
        record.state = "failed";
        record.error = err instanceof Error ? err.message : String(err);
        record.finishedAt = new Date().toISOString();
        this.logger.error(`[${runId}] failed: ${record.error}`);
      });

    return record;
  }

  /** 查询某次后台回填的状态/结果 */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("insight-citations/status/:runId")
  getRunStatus(@Param("runId") runId: string): RunRecord {
    const record = this.runs.get(runId);
    if (!record) {
      throw new NotFoundException(
        `Unknown runId ${runId}（进程重启会清空运行记录，结果见服务日志）`,
      );
    }
    return record;
  }

  /** 最近若干次运行（排障用） */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("insight-citations/runs")
  listRuns(): RunRecord[] {
    return [...this.runs.values()].reverse();
  }

  private rememberRun(record: RunRecord): void {
    this.runs.set(record.runId, record);
    while (this.runs.size > MAX_RUN_HISTORY) {
      const oldest = this.runs.keys().next().value;
      if (oldest === undefined) break;
      this.runs.delete(oldest);
    }
  }

  /**
   * ★ 2026-07-26：闸门加严前入库的存量引用资源清理（聚合页/docs 页/首页）。
   *
   *   POST /api/v1/data-management/backfill/purge-citation-imports
   *   Body: { "dryRun": true, "limit": 1000 }（dryRun 缺省即 true，必须显式
   *          传 false 才会真删）
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post("purge-citation-imports")
  async purgeCitationImports(
    @Body() body: { dryRun?: boolean; limit?: number } = {},
  ): Promise<PurgeSummary> {
    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(Math.floor(body.limit), MAX_LIMIT)
        : undefined;
    return this.purgeService.purge({
      dryRun: body.dryRun !== false,
      limit,
    });
  }
}
