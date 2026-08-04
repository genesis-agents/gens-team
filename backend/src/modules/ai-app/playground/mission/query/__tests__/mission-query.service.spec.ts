/**
 * MissionQueryService unit tests
 * Targets: src/modules/ai-app/playground/mission/query/mission-query.service.ts
 */

import { ForbiddenException } from "@nestjs/common";
import { MissionQueryService } from "../mission-query.service";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockStore() {
  return {
    getById: jest.fn(),
    listReportVersions: jest.fn().mockResolvedValue([]),
  };
}

function makeMockEventBuffer() {
  return {
    read: jest.fn().mockReturnValue([]),
    readPersisted: jest.fn().mockResolvedValue([]),
  };
}

function makeMockOwnership() {
  return {
    getOwner: jest.fn().mockReturnValue(undefined),
  };
}

function makeMockPolicy() {
  return {
    loadCheckpointAvailability: jest.fn().mockResolvedValue({
      hasConfigSnapshot: false,
      hasCheckpoint: false,
    }),
    computeResumable: jest
      .fn()
      .mockReturnValue({ resumable: false, reason: "none" }),
    computeRerunnableStages: jest.fn().mockReturnValue([]),
  };
}

function makeMockArtifactComposer() {
  return {
    composeArtifactView: jest.fn().mockResolvedValue({
      kind: "empty-artifact",
      reason: "not-yet-materialized",
    }),
  };
}

function makeRow(overrides = {}) {
  return {
    id: "m1",
    userId: "u1",
    topic: "T",
    depth: "deep",
    language: "en",
    status: "completed",
    startedAt: new Date(),
    completedAt: new Date(),
    elapsedWallTimeMs: 100,
    finalScore: 90,
    tokensUsed: null,
    costUsd: null,
    reportTitle: null,
    reportSummary: null,
    errorMessage: null,
    terminalOutcome: "completed",
    failureCode: null,
    configSnapshot: null,
    maxCredits: 100,
    themeSummary: null,
    dimensions: null,
    reportFull: null,
    verdicts: null,
    trajectoryStored: false,
    reportArtifactVersion: null,
    userProfile: null,
    reconciliationReport: null,
    leaderJournal: null,
    leaderOverallScore: null,
    leaderSigned: null,
    leaderVerdict: null,
    lastCompletedStage: null,
    outlinePlan: null,
    analystOutput: null,
    heartbeatAt: null,
    visibility: "PRIVATE",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("MissionQueryService", () => {
  let service: MissionQueryService;
  let store: ReturnType<typeof makeMockStore>;
  let eventBuffer: ReturnType<typeof makeMockEventBuffer>;
  let ownership: ReturnType<typeof makeMockOwnership>;
  let policy: ReturnType<typeof makeMockPolicy>;
  let artifactComposer: ReturnType<typeof makeMockArtifactComposer>;

  beforeEach(() => {
    store = makeMockStore();
    eventBuffer = makeMockEventBuffer();
    ownership = makeMockOwnership();
    policy = makeMockPolicy();
    artifactComposer = makeMockArtifactComposer();

    service = new MissionQueryService(
      store as never,
      eventBuffer as never,
      ownership as never,
      policy as never,
      artifactComposer as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── loadInputs: auth guard ──────────────────────────────────────────────────

  describe("loadInputs — authentication guard", () => {
    it("throws ForbiddenException when userId is undefined", async () => {
      await expect(service.loadInputs("m1", undefined)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.loadInputs("m1", undefined)).rejects.toThrow(
        "Authentication required",
      );
    });

    it("throws ForbiddenException when userId is empty string", async () => {
      store.getById.mockResolvedValueOnce(null);
      ownership.getOwner.mockReturnValueOnce(undefined);
      await expect(service.loadInputs("m1", "")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── loadInputs: row-loaded path ─────────────────────────────────────────────

  describe("loadInputs — row-loaded path", () => {
    it("returns mode=row-loaded when row exists", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);

      const result = await service.loadInputs("m1", "u1");

      expect(result.mode).toBe("row-loaded");
      expect(result.row).toBe(row);
      expect(result.missionId).toBe("m1");
    });

    it("loads events from buffer when buffer has data", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);
      const bufferedEvents = [
        {
          type: "playground.mission:started",
          payload: {},
          timestamp: Date.now(),
        },
      ];
      eventBuffer.read.mockReturnValueOnce(bufferedEvents);

      const result = await service.loadInputs("m1", "u1");

      expect(result.events).toBe(bufferedEvents);
      expect(eventBuffer.readPersisted).not.toHaveBeenCalled();
    });

    it("falls back to persisted events when buffer is empty", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);
      eventBuffer.read.mockReturnValueOnce([]); // empty buffer
      const persistedEvents = [
        {
          type: "playground.mission:completed",
          payload: {},
          timestamp: Date.now(),
        },
      ];
      eventBuffer.readPersisted.mockResolvedValueOnce(persistedEvents);

      const result = await service.loadInputs("m1", "u1");

      expect(result.events).toBe(persistedEvents);
      expect(eventBuffer.readPersisted).toHaveBeenCalledWith("m1");
    });

    it("loads report versions for the mission", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);
      const versions = [{ version: 1, missionId: "m1", triggerType: "manual" }];
      store.listReportVersions.mockResolvedValueOnce(versions);

      const result = await service.loadInputs("m1", "u1");

      expect(result.reportVersions).toBe(versions);
    });

    it("returns empty reportVersions on listReportVersions error (swallows)", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);
      store.listReportVersions.mockRejectedValueOnce(new Error("DB error"));

      const result = await service.loadInputs("m1", "u1");

      expect(result.reportVersions).toEqual([]);
    });

    it("returns empty reportVersions when listReportVersions throws non-Error object", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);
      // Throw a string (not an Error instance) to cover the String(err) branch
      store.listReportVersions.mockRejectedValueOnce("string error");

      const result = await service.loadInputs("m1", "u1");

      expect(result.reportVersions).toEqual([]);
    });

    it("calls artifactComposer.composeArtifactView with the row", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);
      const artifact = { kind: "report-v2", sections: [] };
      artifactComposer.composeArtifactView.mockResolvedValueOnce(artifact);

      const result = await service.loadInputs("m1", "u1");

      expect(artifactComposer.composeArtifactView).toHaveBeenCalledWith(row);
      expect(result.composedArtifact).toBe(artifact);
    });

    it("calls policy.loadCheckpointAvailability with the row", async () => {
      const row = makeRow();
      store.getById.mockResolvedValueOnce(row);
      policy.loadCheckpointAvailability.mockResolvedValueOnce({
        hasConfigSnapshot: true,
        hasCheckpoint: true,
      });

      await service.loadInputs("m1", "u1");

      expect(policy.loadCheckpointAvailability).toHaveBeenCalledWith(row);
    });

    it("passes resume decision from policy.computeResumable", async () => {
      const row = makeRow({ status: "completed" });
      store.getById.mockResolvedValueOnce(row);
      const resume = { resumable: true, reason: "ok" };
      policy.computeResumable.mockReturnValueOnce(resume);

      const result = await service.loadInputs("m1", "u1");

      expect(result.resume).toBe(resume);
    });

    it("passes rerunnableStages from policy.computeRerunnableStages", async () => {
      const row = makeRow({ status: "completed" });
      store.getById.mockResolvedValueOnce(row);
      const stages = [
        { stageIndex: 0, stageName: "research", rerunnableKind: "redo" },
      ];
      policy.computeRerunnableStages.mockReturnValueOnce(stages);

      const result = await service.loadInputs("m1", "u1");

      expect(result.rerunnableStages).toBe(stages);
    });

    it("includes lastCompletedStage in policy computations", async () => {
      const row = makeRow({ status: "completed", lastCompletedStage: 3 });
      store.getById.mockResolvedValueOnce(row);

      await service.loadInputs("m1", "u1");

      expect(policy.computeResumable).toHaveBeenCalledWith(
        expect.objectContaining({ lastCompletedStageOrdinal: 3 }),
      );
    });
  });

  // ── loadInputs: starting-placeholder path ───────────────────────────────────

  describe("loadInputs — starting-placeholder path", () => {
    it("returns mode=starting-placeholder when row not in DB but ownership confirmed", async () => {
      store.getById.mockResolvedValueOnce(null);
      ownership.getOwner.mockReturnValueOnce("u1"); // owner matches userId

      const result = await service.loadInputs("m1", "u1");

      expect(result.mode).toBe("starting-placeholder");
      expect(result.missionId).toBe("m1");
      expect(result.row).toBeNull();
      expect(result.events).toEqual([]);
    });

    it("returns sentinel composedArtifact in starting-placeholder mode", async () => {
      store.getById.mockResolvedValueOnce(null);
      ownership.getOwner.mockReturnValueOnce("u1");

      const result = await service.loadInputs("m1", "u1");

      expect(result.composedArtifact).toEqual({
        kind: "empty-artifact",
        reason: "not-yet-materialized",
      });
    });

    it("returns empty reportVersions in starting-placeholder mode", async () => {
      store.getById.mockResolvedValueOnce(null);
      ownership.getOwner.mockReturnValueOnce("u1");

      const result = await service.loadInputs("m1", "u1");

      expect(result.reportVersions).toEqual([]);
      expect(result.resume).toEqual({
        resumable: false,
        reason: "mission still bootstrapping",
      });
    });

    it("throws ForbiddenException when row is null and ownership mismatch", async () => {
      store.getById.mockResolvedValueOnce(null);
      ownership.getOwner.mockReturnValueOnce("other-user"); // different owner

      await expect(service.loadInputs("m1", "u1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws ForbiddenException when row is null and no ownership record", async () => {
      store.getById.mockResolvedValueOnce(null);
      ownership.getOwner.mockReturnValueOnce(undefined);

      await expect(service.loadInputs("m1", "u1")).rejects.toThrow(
        `mission m1 not found`,
      );
    });
  });

  // ── projectPublicStatusForPolicy (via loadInputs) ───────────────────────────

  describe("projectPublicStatusForPolicy — all status branches", () => {
    const cases: Array<{
      status: string;
      terminalOutcome: string | null;
      expectedPublicStatus: string;
    }> = [
      {
        status: "completed",
        terminalOutcome: "completed",
        expectedPublicStatus: "completed",
      },
      {
        status: "rejected",
        terminalOutcome: "quality-failed",
        expectedPublicStatus: "quality-failed",
      },
      {
        status: "failed",
        terminalOutcome: "failed",
        expectedPublicStatus: "failed",
      },
      {
        status: "running",
        terminalOutcome: null,
        expectedPublicStatus: "running",
      },
      // ★ 2026-08-04：以下两条原先断言 cancelled → "running" / "failed"，
      //   那是把缺陷本身冻结成契约 —— policy 里的手抄 switch 没有 cancelled 分支，
      //   落 default 靠 terminalOutcome 猜。同款病根让 quality-failed 被投影成
      //   running，进而取消按钮常亮、点了必被 400 顶回（Screenshot_46）。
      //   现与 projector 共用 mission-status.contract，取消就是取消。
      {
        status: "cancelled",
        terminalOutcome: null,
        expectedPublicStatus: "cancelled",
      },
      {
        status: "cancelled",
        terminalOutcome: "cancelled",
        expectedPublicStatus: "cancelled",
      },
      // ★ 现役写入拼写：policy 也必须认，不能再降级 running
      {
        status: "quality-failed",
        terminalOutcome: "quality-failed",
        expectedPublicStatus: "quality-failed",
      },
      {
        status: "quality-failed",
        terminalOutcome: null,
        expectedPublicStatus: "quality-failed",
      },
    ];

    test.each(cases)(
      "status=$status terminalOutcome=$terminalOutcome → publicStatus=$expectedPublicStatus",
      async ({ status, terminalOutcome, expectedPublicStatus }) => {
        const row = makeRow({ status, terminalOutcome });
        store.getById.mockResolvedValueOnce(row);
        policy.computeResumable.mockReturnValueOnce({
          resumable: false,
          reason: "x",
        });
        policy.computeRerunnableStages.mockReturnValueOnce([]);

        await service.loadInputs("m1", "u1");

        expect(policy.computeResumable).toHaveBeenCalledWith(
          expect.objectContaining({ publicStatus: expectedPublicStatus }),
        );
      },
    );
  });
});
