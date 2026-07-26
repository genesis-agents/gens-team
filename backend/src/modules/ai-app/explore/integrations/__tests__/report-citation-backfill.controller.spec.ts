/**
 * ReportCitationBackfillController 单测
 *
 * 重点覆盖 ★ 2026-07-26 的异步化：dry-run 同步返回、实跑立即返回 runId 且后台
 * 执行、状态可查、失败被记录而非抛成 unhandled rejection。
 */

import { NotFoundException } from "@nestjs/common";
import { ReportCitationBackfillController } from "../report-citation-backfill.controller";

const flush = () => new Promise((r) => setTimeout(r, 0));

const SUMMARY = {
  dryRun: false,
  missionsScanned: 42,
  missionsWithCitations: 42,
  offloadedSkipped: 0,
  imported: 517,
  failed: 0,
  gated: 1952,
  capped: 15,
  domainCapped: 128,
};

function make(backfillImpl?: jest.Mock) {
  const backfillService = {
    backfill: backfillImpl ?? jest.fn().mockResolvedValue(SUMMARY),
  };
  const purgeService = { purge: jest.fn() };
  const controller = new ReportCitationBackfillController(
    backfillService as never,
    purgeService as never,
  );
  return { controller, backfillService, purgeService };
}

describe("ReportCitationBackfillController", () => {
  describe("insight-citations", () => {
    it("dryRun 同步返回统计（秒级只读，不走后台）", async () => {
      const { controller, backfillService } = make();

      const res = await controller.backfillInsightCitations({ dryRun: true });

      expect(res).toEqual(SUMMARY);
      expect(backfillService.backfill).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      );
    });

    it("实跑立即返回 running 记录，不等任务完成", async () => {
      let resolveBackfill: (v: unknown) => void = () => {};
      const pending = new Promise((r) => {
        resolveBackfill = r;
      });
      const { controller } = make(jest.fn().mockReturnValue(pending));

      const res = (await controller.backfillInsightCitations({
        dryRun: false,
      })) as { runId: string; state: string; summary?: unknown };

      expect(res.state).toBe("running");
      expect(res.runId).toMatch(/^backfill-\d+-\d+$/);
      expect(res.summary).toBeUndefined();

      resolveBackfill(SUMMARY);
      await flush();
    });

    it("后台完成后状态转 completed 并带上统计", async () => {
      const { controller } = make();

      const started = (await controller.backfillInsightCitations({})) as {
        runId: string;
      };
      await flush();

      const status = controller.getRunStatus(started.runId);
      expect(status.state).toBe("completed");
      expect(status.summary).toEqual(SUMMARY);
      expect(status.finishedAt).toBeDefined();
    });

    it("后台失败被记录为 failed，不抛出（无 unhandled rejection）", async () => {
      const { controller } = make(
        jest.fn().mockRejectedValue(new Error("db exploded")),
      );

      const started = (await controller.backfillInsightCitations({})) as {
        runId: string;
      };
      await flush();

      const status = controller.getRunStatus(started.runId);
      expect(status.state).toBe("failed");
      expect(status.error).toBe("db exploded");
    });

    it("limit 被夹到上限，missionId 去空白", async () => {
      const { controller, backfillService } = make();

      await controller.backfillInsightCitations({
        dryRun: true,
        limit: 99999,
        missionId: "  m-1  ",
      });

      expect(backfillService.backfill).toHaveBeenCalledWith({
        dryRun: true,
        limit: 5000,
        missionId: "m-1",
      });
    });
  });

  describe("status/runs", () => {
    it("未知 runId → 404", () => {
      const { controller } = make();
      expect(() => controller.getRunStatus("nope")).toThrow(NotFoundException);
    });

    it("runs 列表按最近优先，且不超过保留上限", async () => {
      const { controller } = make();
      for (let i = 0; i < 25; i++) {
        await controller.backfillInsightCitations({});
      }
      await flush();

      const runs = controller.listRuns();
      expect(runs.length).toBe(20);
      // 最新的在最前
      expect(runs[0].runId).toContain("-25-");
    });
  });
});
