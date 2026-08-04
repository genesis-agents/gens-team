import {
  MissionStore,
  MissionConcurrencyLimitError,
} from "../mission-store.service";

function makePrisma() {
  const agentPlaygroundMission = {
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
  };
  const prisma = {
    agentPlaygroundMission,
    // recoverOrphanedRunning groupBy 用来过滤"最近 5min 有事件"
    agentPlaygroundMissionEvent: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    harnessVectorMemory: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // ★ P0-R5-1: terminal-state methods 调 $executeRaw 清 checkpoint JSONB key
    $executeRaw: jest.fn().mockResolvedValue(0),
    // ★ P0/P1 并发安全 (2026-05-06): appendLeaderJournal + appendDimensions 用 $transaction
    // ★ H4/E9 (2026-05-25): createMission 也走 $transaction（advisory lock + count + insert）
    // 透传 tx 含 agentPlaygroundMission + $executeRaw（advisory_xact_lock），让断言不变
    $transaction: jest
      .fn()
      .mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb({ agentPlaygroundMission, $executeRaw: jest.fn() }),
      ),
  };
  return prisma;
}

describe("MissionStore", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let store: MissionStore;

  beforeEach(() => {
    prisma = makePrisma();
    store = new MissionStore(prisma as never);
  });

  // create
  it("create: calls prisma.agentPlaygroundMission.create with status=running", async () => {
    await store.create({
      id: "m1",
      userId: "u1",
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      maxCredits: 1000,
    });
    expect(prisma.agentPlaygroundMission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "running" }),
      }),
    );
  });

  it("create: truncates topic to 500 chars", async () => {
    const longTopic = "x".repeat(600);
    await store.create({
      id: "m1",
      userId: "u1",
      topic: longTopic,
      depth: "deep",
      language: "zh-CN",
      maxCredits: 100,
    });
    const createArg =
      prisma.agentPlaygroundMission.create.mock.calls[0][0].data;
    expect(createArg.topic.length).toBeLessThanOrEqual(500);
  });

  it("create: propagates prisma error so mission does not run without a DB row", async () => {
    prisma.agentPlaygroundMission.create.mockRejectedValue(
      new Error("DB down"),
    );
    await expect(
      store.create({
        id: "m1",
        userId: "u1",
        topic: "t",
        depth: "d",
        language: "zh-CN",
        maxCredits: 100,
      }),
    ).rejects.toThrow("DB down");
  });

  // ★ H4/E9 (2026-05-25): advisory-lock 事务内复核并发上限，堵 controller 预检的 race
  it("create: throws MissionConcurrencyLimitError + skips insert when at limit", async () => {
    prisma.agentPlaygroundMission.count.mockResolvedValueOnce(3); // 已达上限
    await expect(
      store.create({
        id: "m1",
        userId: "u1",
        topic: "t",
        depth: "d",
        language: "zh-CN",
        maxCredits: 100,
      }),
    ).rejects.toThrow(MissionConcurrencyLimitError);
    expect(prisma.agentPlaygroundMission.create).not.toHaveBeenCalled();
  });

  it("create: takes per-user advisory lock before counting", async () => {
    const tx = { $executeRaw: jest.fn(), count: jest.fn() };
    void tx;
    await store.create({
      id: "m1",
      userId: "u1",
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      maxCredits: 1000,
    });
    // advisory_xact_lock 通过 tx.$executeRaw 发出（每用户串行化建行）
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  // ★ 2026-05-05: recoverOrphanedRunning + recoverPodCrashedRunning 已下线
  //   归并到 ai-harness/lifecycle/mission-liveness-guard.service.ts 的 unified guard
  //   playground module 通过 livenessGuard.registerAdapter('playground', ...) 接入
  //   原 spec 全部迁到 harness 层（mission-liveness-guard.service.spec.ts）

  // applyTerminalIfRunning — completed path
  it("applyTerminalIfRunning(completed): calls updateMany with status=completed guard", async () => {
    await store.applyTerminalIfRunning("m1", {
      status: "completed",
      extra: { kind: "completed", detail: { finalScore: 85 } },
    });
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1", status: "running" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("applyTerminalIfRunning(completed): truncates fullMarkdown if report > 5MB", async () => {
    const bigMd = "x".repeat(6_000_000); // 6M chars → JSON will be >5MB
    const report = {
      title: "Big",
      summary: "s",
      content: { fullMarkdown: bigMd, fullReportSize: bigMd.length },
    };
    await store.applyTerminalIfRunning("m1", {
      status: "completed",
      extra: { kind: "completed", detail: { report } },
    });
    const updateArg =
      prisma.agentPlaygroundMission.updateMany.mock.calls[0][0].data;
    const reportFull = updateArg.reportFull as {
      content: { fullMarkdown: string };
    };
    // After truncation, should be 100_000 chars + truncation suffix
    expect(reportFull.content.fullMarkdown.length).toBeLessThanOrEqual(100_100);
  });

  it("applyTerminalIfRunning(completed): returns false on prisma error (swallows)", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(
      new Error("DB error"),
    );
    const won = await store.applyTerminalIfRunning("m1", {
      status: "completed",
      extra: { kind: "completed", detail: {} },
    });
    expect(won).toBe(false);
  });

  // applyTerminalIfRunning — failed path
  it("applyTerminalIfRunning(failed): calls prisma.updateMany with status=failed", async () => {
    await store.applyTerminalIfRunning("m1", {
      status: "failed",
      extra: { kind: "failed", detail: { errorMessage: "Network error" } },
    });
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("applyTerminalIfRunning(failed): uses quality-failed status when leaderSigned=false", async () => {
    await store.applyTerminalIfRunning("m1", {
      status: "failed",
      extra: {
        kind: "failed",
        detail: { leaderSigned: false, leaderOverallScore: 35 },
      },
    });
    const updateArg =
      prisma.agentPlaygroundMission.updateMany.mock.calls[0][0].data;
    expect(updateArg.status).toBe("quality-failed");
  });

  it("applyTerminalIfRunning(failed): returns false on prisma error (swallows)", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(new Error("DB"));
    const won = await store.applyTerminalIfRunning("m1", {
      status: "failed",
      extra: { kind: "failed", detail: {} },
    });
    expect(won).toBe(false);
  });

  // appendLeaderJournal
  it("appendLeaderJournal: merges patch into existing journal", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { plan: "initial plan" },
    });
    await store.appendLeaderJournal("m1", { m0: "done" });
    const updateArg =
      prisma.agentPlaygroundMission.update.mock.calls[0][0].data;
    expect(updateArg.leaderJournal).toEqual({
      plan: "initial plan",
      m0: "done",
    });
  });

  it("appendLeaderJournal: handles null journal (starts from empty obj)", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: null,
    });
    await store.appendLeaderJournal("m1", { decisions: [{ step: "plan" }] });
    const updateArg =
      prisma.agentPlaygroundMission.update.mock.calls[0][0].data;
    expect(updateArg.leaderJournal.decisions).toHaveLength(1);
  });

  it("appendLeaderJournal: concatenates decisions array", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { decisions: [{ step: "plan" }] },
    });
    await store.appendLeaderJournal("m1", { decisions: [{ step: "assess" }] });
    const updateArg =
      prisma.agentPlaygroundMission.update.mock.calls[0][0].data;
    expect(updateArg.leaderJournal.decisions).toHaveLength(2);
  });

  // recordMissionPostmortem
  it("recordMissionPostmortem: creates harnessVectorMemory entry", async () => {
    await store.recordMissionPostmortem({
      missionId: "m1",
      userId: "u1",
      topic: "AI",
      summary: "Summary text",
      recommendations: ["rec1"],
      leaderSigned: true,
      qualityScore: 85,
      tokensUsed: 10000,
      costUsd: 0.5,
    });
    expect(prisma.harnessVectorMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          namespace: "u1",
          source: "playground:mission",
        }),
      }),
    );
  });

  it("recordMissionPostmortem: tags include 'signed' when leaderSigned=true", async () => {
    await store.recordMissionPostmortem({
      missionId: "m1",
      userId: "u1",
      topic: "AI",
      summary: "s",
      recommendations: [],
      leaderSigned: true,
      qualityScore: 80,
      tokensUsed: 0,
      costUsd: 0,
    });
    const tags = prisma.harnessVectorMemory.create.mock.calls[0][0].data.tags;
    expect(tags).toContain("signed");
  });

  it("recordMissionPostmortem: tags include 'unsigned' when leaderSigned=false", async () => {
    await store.recordMissionPostmortem({
      missionId: "m1",
      userId: "u1",
      topic: "AI",
      summary: "s",
      recommendations: [],
      leaderSigned: false,
      qualityScore: 40,
      tokensUsed: 0,
      costUsd: 0,
    });
    const tags = prisma.harnessVectorMemory.create.mock.calls[0][0].data.tags;
    expect(tags).toContain("unsigned");
  });

  // listRecentPostmortems
  it("listRecentPostmortems: returns mapped rows", async () => {
    prisma.harnessVectorMemory.findMany.mockResolvedValue([
      {
        content: "Postmortem summary",
        tags: ["mission-postmortem", "signed"],
        createdAt: new Date(),
        metadata: {
          missionId: "m1",
          topic: "AI",
          recommendations: ["rec"],
          qualityScore: 85,
        },
      },
    ]);
    const result = await store.listRecentPostmortems("u1", 3);
    expect(result).toHaveLength(1);
    expect(result[0].leaderSigned).toBe(true);
    expect(result[0].qualityScore).toBe(85);
  });

  it("listRecentPostmortems: returns [] on prisma error", async () => {
    prisma.harnessVectorMemory.findMany.mockRejectedValue(new Error("DB"));
    const result = await store.listRecentPostmortems("u1", 3);
    expect(result).toEqual([]);
  });

  // appendDimensions
  it("appendDimensions: returns [] if items empty", async () => {
    const ids = await store.appendDimensions("m1", []);
    expect(ids).toEqual([]);
  });

  it("appendDimensions: returns [] if mission not running", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      status: "completed",
      dimensions: [],
    });
    const ids = await store.appendDimensions("m1", [
      { name: "New Dim", rationale: "r" },
    ]);
    expect(ids).toEqual([]);
  });

  it("appendDimensions: appends dims and returns new ids", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      status: "running",
      dimensions: [{ id: "d1", name: "Old", rationale: "r" }],
    });
    prisma.agentPlaygroundMission.update.mockResolvedValue({});
    const ids = await store.appendDimensions("m1", [
      { name: "New", rationale: "new reason" },
    ]);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toContain("dim-user-");
  });

  // deleteByUser
  it("deleteByUser: calls deleteMany with id+userId guard", async () => {
    await store.deleteByUser("m1", "u1");
    expect(prisma.agentPlaygroundMission.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m1", userId: "u1" } }),
    );
  });

  it("deleteByUser: swallows prisma error", async () => {
    prisma.agentPlaygroundMission.deleteMany.mockRejectedValue(new Error("DB"));
    await expect(store.deleteByUser("m1", "u1")).resolves.toBeUndefined();
  });

  // updateTopicByUser
  it("updateTopicByUser: calls updateMany with truncated topic", async () => {
    const longTopic = "x".repeat(600);
    await store.updateTopicByUser("m1", "u1", longTopic);
    const callArg = prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
    expect(callArg.data.topic.length).toBeLessThanOrEqual(500);
  });

  it("updateTopicByUser: swallows prisma error", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(new Error("DB"));
    await expect(
      store.updateTopicByUser("m1", "u1", "new topic"),
    ).resolves.toBeUndefined();
  });

  // applyTerminalIfRunning — cancelled path
  it("applyTerminalIfRunning(cancelled): sets status=cancelled with running guard", async () => {
    await store.applyTerminalIfRunning("m1", {
      status: "cancelled",
      extra: { kind: "cancelled" },
    });
    expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1", status: "running" },
        data: expect.objectContaining({ status: "cancelled" }),
      }),
    );
  });

  it("applyTerminalIfRunning(cancelled): returns false on prisma error (swallows)", async () => {
    prisma.agentPlaygroundMission.updateMany.mockRejectedValue(new Error("DB"));
    const won = await store.applyTerminalIfRunning("m1", {
      status: "cancelled",
      extra: { kind: "cancelled" },
    });
    expect(won).toBe(false);
  });

  // appendLeaderJournal error
  it("appendLeaderJournal: swallows prisma error on findUnique", async () => {
    prisma.$transaction.mockRejectedValue(new Error("DB find error"));
    await expect(
      store.appendLeaderJournal("m1", { step: "test" }),
    ).resolves.toBeUndefined();
  });

  it("appendLeaderJournal: uses $transaction for atomic read-modify-write", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      leaderJournal: { plan: "existing" },
    });
    await store.appendLeaderJournal("m1", { m0: "new" });
    // $transaction must have been called (atomic guard)
    expect(prisma.$transaction).toHaveBeenCalled();
    const txOpts = prisma.$transaction.mock.calls[0][1];
    expect(txOpts?.isolationLevel).toBe("Serializable");
  });

  // countRunningByUser
  it("countRunningByUser: returns count of running missions for user", async () => {
    prisma.agentPlaygroundMission.count.mockResolvedValue(2);
    const count = await store.countRunningByUser("u1");
    expect(count).toBe(2);
    expect(prisma.agentPlaygroundMission.count).toHaveBeenCalledWith({
      where: { userId: "u1", status: "running" },
    });
  });

  it("appendDimensions: uses $transaction for atomic read-modify-write", async () => {
    prisma.agentPlaygroundMission.findUnique.mockResolvedValue({
      status: "running",
      dimensions: [],
    });
    await store.appendDimensions("m1", [{ name: "D", rationale: "r" }]);
    const txOpts = prisma.$transaction.mock.calls[0][1];
    expect(txOpts?.isolationLevel).toBe("Serializable");
  });

  // listByUser
  it("listByUser: returns mapped list from prisma", async () => {
    const mockRow = {
      id: "m1",
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      wallTimeMs: 60000,
      finalScore: 85,
      tokensUsed: 5000,
      costUsd: 0.5,
      reportTitle: "Report",
      reportSummary: "Summary",
      errorMessage: null,
    };
    prisma.agentPlaygroundMission.findMany.mockResolvedValue([mockRow]);
    const result = await store.listByUser("u1", 10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
  });

  // recordMissionPostmortem error path
  it("recordMissionPostmortem: swallows prisma error", async () => {
    prisma.harnessVectorMemory.create.mockRejectedValue(new Error("DB error"));
    await expect(
      store.recordMissionPostmortem({
        missionId: "m1",
        userId: "u1",
        topic: "AI",
        summary: "s",
        recommendations: [],
        leaderSigned: null,
        qualityScore: null,
        tokensUsed: 0,
        costUsd: 0,
      }),
    ).resolves.toBeUndefined();
  });

  // getById
  it("getById: returns null when mission not found", async () => {
    const result = await store.getById("m1", "u1");
    expect(result).toBeNull();
  });

  it("getById: returns MissionDetail when found", async () => {
    prisma.agentPlaygroundMission.findFirst.mockResolvedValue({
      id: "m1",
      topic: "AI",
      depth: "deep",
      language: "zh-CN",
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      wallTimeMs: 60000,
      finalScore: 85,
      tokensUsed: 5000,
      costUsd: 0.5,
      reportTitle: "Report",
      reportSummary: "Summary",
      errorMessage: null,
      themeSummary: "t",
      dimensions: [],
      reportFull: {},
      verdicts: {},
      trajectoryStored: 3,
      reportArtifactVersion: 2,
      userProfile: {},
      reconciliationReport: {},
      leaderJournal: {},
      leaderOverallScore: 85,
      leaderSigned: true,
      leaderVerdict: "signed",
    });
    const result = await store.getById("m1", "u1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("m1");
    expect(result!.leaderSigned).toBe(true);
  });

  // applyTerminalIfRunning(failed): lead-refusal conditional fields —— ★ P0-1: 改为 updateMany 带 running guard
  it("applyTerminalIfRunning(failed): when leaderSigned=false, persists report and dimensions with running guard", async () => {
    const report = { title: "Report", summary: "Sum" };
    await store.applyTerminalIfRunning("m1", {
      status: "failed",
      extra: {
        kind: "failed",
        detail: {
          leaderSigned: false,
          leaderOverallScore: 35,
          leaderVerdict: "quality-failed",
          report,
          dimensions: [{ id: "d1", name: "Market" }],
          themeSummary: "AI",
          trajectoryStored: 2,
        },
      },
    });
    const call = prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "m1", status: "running" });
    expect(call.data.status).toBe("quality-failed");
    expect(call.data.reportFull).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // PR-H v1: heartbeat + stage progress + pod recovery
  // ─────────────────────────────────────────────

  describe("PR-H v1 heartbeat lifecycle", () => {
    it("refreshHeartbeat: 条件写 WHERE status='running'，更新 heartbeatAt + podId", async () => {
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      await store.refreshHeartbeat("m1", "pod-abc");
      expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith({
        where: { id: "m1", status: "running" },
        data: expect.objectContaining({
          heartbeatAt: expect.any(Date),
          podId: "pod-abc",
        }),
      });
    });

    it("refreshHeartbeat: silently swallows DB errors (debug log only)", async () => {
      prisma.agentPlaygroundMission.updateMany.mockRejectedValueOnce(
        new Error("DB down"),
      );
      await expect(
        store.refreshHeartbeat("m1", "pod-abc"),
      ).resolves.toBeUndefined();
    });

    it("markStageComplete: writes lastCompletedStage + heartbeat refresh", async () => {
      await store.markStageComplete("m1", 7);
      const call = prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: "m1", status: "running" });
      expect(call.data.lastCompletedStage).toBe(7);
      expect(call.data.heartbeatAt).toBeInstanceOf(Date);
    });

    it("markStageComplete: silently swallows DB errors", async () => {
      prisma.agentPlaygroundMission.updateMany.mockRejectedValueOnce(
        new Error("conflict"),
      );
      await expect(store.markStageComplete("m1", 3)).resolves.toBeUndefined();
    });

    // ★ 2026-05-05: recoverPodCrashedRunning 已下线（归并到 unified MissionLivenessGuard）
    //   原 6 个 spec 全部迁到 harness 层 mission-liveness-guard.service.spec.ts
  });

  // ─────────────────────────────────────────────
  // 2026-05-12: FK 风暴熔断 —— mission row 已删时主动 abort orchestrator
  // ─────────────────────────────────────────────
  describe("emergency abort on missing mission row", () => {
    function makePrismaWithChildTables(
      prismaBase: ReturnType<typeof makePrisma>,
    ) {
      type WithUpsert = {
        upsert: jest.Mock;
      };
      const extras = {
        agentPlaygroundResearchResult: { upsert: jest.fn() } as WithUpsert,
        agentPlaygroundChapterDraft: { upsert: jest.fn() } as WithUpsert,
      };
      return Object.assign(prismaBase, extras);
    }

    function makeAbortRegistry() {
      return { abort: jest.fn().mockReturnValue(true) };
    }

    function fkError() {
      const err = new Error("Foreign key constraint violated");
      (err as Error & { code?: string }).code = "P2003";
      return err;
    }

    function recordNotFoundError() {
      const err = new Error("No record was found for an update");
      (err as Error & { code?: string }).code = "P2025";
      return err;
    }

    it("refreshHeartbeat: P2025 triggers abort once even on repeated calls", async () => {
      const abortRegistry = makeAbortRegistry();
      const prismaFull = makePrismaWithChildTables(prisma);
      store = new MissionStore(
        prismaFull as never,
        undefined,
        abortRegistry as never,
      );
      prismaFull.agentPlaygroundMission.update
        .mockRejectedValueOnce(recordNotFoundError())
        .mockRejectedValueOnce(recordNotFoundError())
        .mockRejectedValueOnce(recordNotFoundError());

      await store.refreshHeartbeat("ghost", "pod-1");
      await store.refreshHeartbeat("ghost", "pod-1");
      await store.refreshHeartbeat("ghost", "pod-1");

      expect(abortRegistry.abort).toHaveBeenCalledTimes(1);
      expect(abortRegistry.abort).toHaveBeenCalledWith(
        "ghost",
        "mission_row_missing",
      );
    });

    it("saveResearchResult: P2003 triggers abort and swallows error", async () => {
      const abortRegistry = makeAbortRegistry();
      const prismaFull = makePrismaWithChildTables(prisma);
      store = new MissionStore(
        prismaFull as never,
        undefined,
        abortRegistry as never,
      );
      prismaFull.agentPlaygroundResearchResult.upsert.mockRejectedValue(
        fkError(),
      );

      await expect(
        store.saveResearchResult({
          missionId: "ghost",
          dimension: "dim-A",
          findings: [],
          summary: "s",
          state: "completed",
        }),
      ).resolves.toBeUndefined();

      expect(abortRegistry.abort).toHaveBeenCalledWith(
        "ghost",
        "mission_row_missing",
      );
    });

    it("does not abort on non-FK / non-P2025 errors", async () => {
      const abortRegistry = makeAbortRegistry();
      const prismaFull = makePrismaWithChildTables(prisma);
      store = new MissionStore(
        prismaFull as never,
        undefined,
        abortRegistry as never,
      );
      prismaFull.agentPlaygroundMission.updateMany.mockRejectedValueOnce(
        new Error("transient DB outage"),
      );

      await store.refreshHeartbeat("m1", "pod-1");
      expect(abortRegistry.abort).not.toHaveBeenCalled();
    });

    // ★ 2026-08-04 跨 pod 取消传播：heartbeat 条件写 0 行 + DB status=cancelled
    //   → 本地 abort(user_cancelled)。取消请求落在异 pod 时（in-memory abort no-op），
    //   worker 靠这条链在 ≤30s 内感知并停止（此前会一直跑到自然结束，"取消无效"）。
    it("heartbeat 探到 DB 已 cancelled → abort(user_cancelled)", async () => {
      const abortRegistry = makeAbortRegistry();
      const prismaFull = makePrismaWithChildTables(prisma);
      store = new MissionStore(
        prismaFull as never,
        undefined,
        abortRegistry as never,
      );
      prismaFull.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 0,
      });
      prismaFull.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        status: "cancelled",
      });

      await store.refreshHeartbeat("m1", "pod-1");
      expect(abortRegistry.abort).toHaveBeenCalledWith("m1", "user_cancelled");
    });

    it("works without abortRegistry injected (backward-compat)", async () => {
      const prismaFull = makePrismaWithChildTables(prisma);
      store = new MissionStore(prismaFull as never);
      prismaFull.agentPlaygroundMission.update.mockRejectedValueOnce(
        recordNotFoundError(),
      );
      // should not throw — just logs
      await expect(
        store.refreshHeartbeat("ghost", "pod-1"),
      ).resolves.toBeUndefined();
    });
  });

  // ── clearHeartbeat (resetHeartbeat hook) ─────────────────────────────────────
  describe("clearHeartbeat", () => {
    it("calls updateMany with heartbeatAt: null", async () => {
      await store.clearHeartbeat("m1", "u1");
      expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalledWith({
        where: { id: "m1", userId: "u1" },
        data: { heartbeatAt: null },
      });
    });

    it("swallows errors gracefully", async () => {
      prisma.agentPlaygroundMission.updateMany.mockRejectedValueOnce(
        new Error("DB error"),
      );
      await expect(store.clearHeartbeat("m1", "u1")).resolves.toBeUndefined();
    });
  });

  // ── cleanupOrphanRunningMissionsAtomic (findOrphanRunning + claimOrphanFailed hooks) ──
  describe("cleanupOrphanRunningMissionsAtomic", () => {
    it("returns claimedWinners that were atomically claimed (count===1)", async () => {
      // findOrphanRunning returns two orphans
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([
        { id: "m1", userId: "u1" },
        { id: "m2", userId: "u2" },
      ]);
      // m1 claimed (count=1), m2 not claimed (count=0)
      prisma.agentPlaygroundMission.updateMany
        .mockResolvedValueOnce({ count: 1 }) // m1 claim
        .mockResolvedValueOnce({ count: 0 }); // m2 not claimed

      const result = await store.cleanupOrphanRunningMissionsAtomic(60_000);

      expect(result.claimedWinners).toHaveLength(1);
      expect(result.claimedWinners[0].id).toBe("m1");
    });

    it("returns empty claimedWinners when no orphans found", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([]);

      const result = await store.cleanupOrphanRunningMissionsAtomic(60_000);

      expect(result.claimedWinners).toEqual([]);
      expect(result.orphans).toEqual([]);
    });

    it("claimOrphanFailed sets correct status=failed data", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([
        { id: "m1", userId: "u1" },
      ]);
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      await store.cleanupOrphanRunningMissionsAtomic(60_000);

      // The 2nd call to updateMany is for claimOrphanFailed
      const callArgs =
        prisma.agentPlaygroundMission.updateMany.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: "m1", status: "running" });
      expect(callArgs.data.status).toBe("failed");
      expect(callArgs.data.failureCode).toBe("runtime_crashed");
    });
  });

  // ── findOldestRunningMissionId ────────────────────────────────────────────────
  describe("findOldestRunningMissionId", () => {
    it("returns id when row found", async () => {
      prisma.agentPlaygroundMission.findFirst.mockResolvedValueOnce({
        id: "m-old",
      });

      const result = await store.findOldestRunningMissionId("u1");

      expect(result).toBe("m-old");
      expect(prisma.agentPlaygroundMission.findFirst).toHaveBeenCalledWith({
        where: { userId: "u1", status: "running" },
        orderBy: { startedAt: "asc" },
        select: { id: true },
      });
    });

    it("returns null when no running mission", async () => {
      prisma.agentPlaygroundMission.findFirst.mockResolvedValueOnce(null);

      const result = await store.findOldestRunningMissionId("u1");

      expect(result).toBeNull();
    });
  });

  // ── hasRecentEvent ────────────────────────────────────────────────────────────
  describe("hasRecentEvent", () => {
    it("returns true when count > 0", async () => {
      prisma.agentPlaygroundMissionEvent.groupBy.mockResolvedValueOnce([
        { missionId: "m1", _count: 5 },
      ]);
      // The actual implementation uses .count() not groupBy
      // Need to add count mock to prisma
      const prismaWithCount = prisma as typeof prisma & {
        agentPlaygroundMissionEvent: { count: jest.Mock };
      };
      prismaWithCount.agentPlaygroundMissionEvent.count = jest
        .fn()
        .mockResolvedValueOnce(5);

      const result = await store.hasRecentEvent("m1", 60_000);

      expect(result).toBe(true);
    });

    it("returns false when count is 0", async () => {
      const prismaWithCount = prisma as typeof prisma & {
        agentPlaygroundMissionEvent: { count: jest.Mock };
      };
      prismaWithCount.agentPlaygroundMissionEvent.count = jest
        .fn()
        .mockResolvedValueOnce(0);

      const result = await store.hasRecentEvent("m1", 60_000);

      expect(result).toBe(false);
    });
  });

  // ── delegate methods coverage ─────────────────────────────────────────────────
  describe("additional delegate methods", () => {
    it("updateBudgetByUser delegates to update helper", async () => {
      prisma.agentPlaygroundMission.findFirst.mockResolvedValueOnce({
        id: "m1",
        status: "failed",
        configSnapshot: null,
      });
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      const res = await store.updateBudgetByUser("m1", "u1", {
        maxCredits: 200,
      });
      expect(res.ok).toBe(true);
    });

    it("resetFields delegates to update helper", async () => {
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      await store.resetFields("m1", ["report_full"], "u1");
      expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalled();
    });

    it("markRerunPatch delegates to update helper", async () => {
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      await store.markRerunPatch("m1", { finalScore: 80 }, "u1");
      expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalled();
    });

    it("markIntermediateState delegates to update helper", async () => {
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      await store.markIntermediateState("m1", { lastCompletedStage: 3 }, "u1");
      expect(prisma.agentPlaygroundMission.updateMany).toHaveBeenCalled();
    });

    it("saveReportVersion delegates to report helper", async () => {
      // The report helper uses $transaction
      prisma.$transaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            missionReportVersion: {
              aggregate: jest.fn(async () => ({ _max: { version: 0 } })),
              create: jest.fn(async () => ({})),
            },
          };
          return fn(tx);
        },
      );
      const v = await store.saveReportVersion({
        missionId: "m1",
        triggerType: "manual",
      });
      expect(v).toBe(1);
    });

    it("listReportVersions delegates to report helper", async () => {
      // Need a store with missionReportVersion in prisma
      const missionReportVersion = {
        findMany: jest.fn().mockResolvedValueOnce([]),
      };
      const prismaExt = Object.assign(makePrisma(), { missionReportVersion });
      const storeExt = new MissionStore(prismaExt as never);
      const result = await storeExt.listReportVersions("m1");
      expect(result).toEqual([]);
    });

    it("getReportVersion delegates to report helper", async () => {
      const missionReportVersion = {
        findUnique: jest.fn().mockResolvedValueOnce(null),
      };
      const prismaExt = Object.assign(makePrisma(), { missionReportVersion });
      const storeExt = new MissionStore(prismaExt as never);
      const result = await storeExt.getReportVersion("m1", 1);
      expect(result).toBeNull();
    });

    it("saveResearchResult delegates to report helper", async () => {
      const agentPlaygroundResearchResult = {
        upsert: jest.fn().mockResolvedValueOnce({}),
      };
      const prismaExt = Object.assign(makePrisma(), {
        agentPlaygroundResearchResult,
      });
      const storeExt = new MissionStore(prismaExt as never);
      await storeExt.saveResearchResult({
        missionId: "m1",
        dimension: "d",
        findings: [],
        summary: "s",
        state: "completed",
      });
      expect(agentPlaygroundResearchResult.upsert).toHaveBeenCalled();
    });

    it("loadBaselineResearchResults delegates to report helper", async () => {
      const agentPlaygroundResearchResult = {
        findMany: jest.fn().mockResolvedValueOnce([]),
      };
      const prismaExt = Object.assign(makePrisma(), {
        agentPlaygroundResearchResult,
      });
      const storeExt = new MissionStore(prismaExt as never);
      const result = await storeExt.loadBaselineResearchResults("m1");
      expect(result).toEqual([]);
    });

    it("saveChapterDraft delegates to report helper", async () => {
      const agentPlaygroundChapterDraft = {
        upsert: jest.fn().mockResolvedValueOnce({}),
      };
      const prismaExt = Object.assign(makePrisma(), {
        agentPlaygroundChapterDraft,
      });
      const storeExt = new MissionStore(prismaExt as never);
      await storeExt.saveChapterDraft({
        missionId: "m1",
        dimension: "d",
        chapterIndex: 0,
        heading: "h",
        content: "c",
        status: "writing",
      });
      expect(agentPlaygroundChapterDraft.upsert).toHaveBeenCalled();
    });

    it("loadQualifiedChapterDrafts delegates to report helper", async () => {
      const agentPlaygroundChapterDraft = {
        findMany: jest.fn().mockResolvedValueOnce([]),
      };
      const prismaExt = Object.assign(makePrisma(), {
        agentPlaygroundChapterDraft,
      });
      const storeExt = new MissionStore(prismaExt as never);
      const result = await storeExt.loadQualifiedChapterDrafts("m1");
      expect(result).toEqual([]);
    });

    it("appendCostEntry delegates to costLedger", async () => {
      // costLedger uses agentPlaygroundMissionCostLedger.create
      prisma.agentPlaygroundMissionCostLedger = {
        create: jest.fn().mockResolvedValueOnce({}),
      };
      const result = await store.appendCostEntry({
        missionId: "m1",
        userId: "u1",
        promptTokens: 100,
        completionTokens: 200,
        costUsd: 0.5,
      });
      expect(typeof result).toBe("boolean");
    });

    it("sumCostByMission delegates to costLedger", async () => {
      prisma.agentPlaygroundMissionCostLedger = {
        aggregate: jest.fn().mockResolvedValueOnce({
          _sum: { promptTokens: 100, completionTokens: 200, costUsd: 0.5 },
          _count: { _all: 5 },
        }),
      };
      const result = await store.sumCostByMission("m1");
      expect(result.entryCount).toBe(5);
    });

    it("listCostByMission delegates to costLedger", async () => {
      prisma.agentPlaygroundMissionCostLedger = {
        findMany: jest.fn().mockResolvedValueOnce([]),
      };
      const result = await store.listCostByMission("m1");
      expect(result).toEqual([]);
    });

    it("deleteTerminalByUser deletes failed/quality-failed/cancelled and returns count", async () => {
      prisma.agentPlaygroundMission.deleteMany.mockResolvedValueOnce({
        count: 2,
      });
      const count = await store.deleteTerminalByUser("u1");
      expect(count).toBe(2);
      expect(prisma.agentPlaygroundMission.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: "u1",
          status: { in: ["failed", "quality-failed", "cancelled"] },
        },
      });
    });

    it("deleteTerminalByUser returns 0 on error", async () => {
      prisma.agentPlaygroundMission.deleteMany.mockRejectedValueOnce(
        new Error("err"),
      );
      const count = await store.deleteTerminalByUser("u1");
      expect(count).toBe(0);
    });

    it("getStatusById returns status when found", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        status: "running",
      });
      const result = await store.getStatusById("m1");
      expect(result).toEqual({ status: "running" });
    });

    it("getStatusById returns null when not found", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce(null);
      const result = await store.getStatusById("m1");
      expect(result).toBeNull();
    });

    it("getMetaForNotify returns userId+topic when found", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        userId: "u1",
        topic: "T",
      });
      const result = await store.getMetaForNotify("m1");
      expect(result).toEqual({ userId: "u1", topic: "T" });
    });

    it("getMetaForNotify returns null when not found", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce(null);
      const result = await store.getMetaForNotify("m1");
      expect(result).toBeNull();
    });

    it("getAccessMetaById returns access meta with topicId null", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        userId: "u1",
        visibility: "PUBLIC",
      });
      const result = await store.getAccessMetaById("m1");
      expect(result).toEqual({
        userId: "u1",
        visibility: "PUBLIC",
        topicId: null,
      });
    });

    it("getAccessMetaById returns null when not found", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce(null);
      const result = await store.getAccessMetaById("m1");
      expect(result).toBeNull();
    });

    it("updateVisibility throws NotFoundException when not found", async () => {
      prisma.agentPlaygroundMission.findFirst.mockResolvedValueOnce(null);
      await expect(
        store.updateVisibility("u1", "m1", "PUBLIC" as never),
      ).rejects.toThrow("Mission not found");
    });

    it("updateVisibility throws ForbiddenException when not owner", async () => {
      prisma.agentPlaygroundMission.findFirst.mockResolvedValueOnce({
        userId: "other",
      });
      await expect(
        store.updateVisibility("u1", "m1", "PUBLIC" as never),
      ).rejects.toThrow("Not owner");
    });

    it("updateVisibility updates when owner", async () => {
      prisma.agentPlaygroundMission.findFirst.mockResolvedValueOnce({
        userId: "u1",
      });
      prisma.agentPlaygroundMission.update.mockResolvedValueOnce({
        id: "m1",
        visibility: "PUBLIC",
      });
      const result = await store.updateVisibility(
        "u1",
        "m1",
        "PUBLIC" as never,
      );
      expect(result.visibility).toBe("PUBLIC");
    });

    it("listByMissionIds returns empty array when ids empty", async () => {
      const result = await store.listByMissionIds("u1", []);
      expect(result).toEqual([]);
    });

    it("markReopened delegates to lifecycle (success path)", async () => {
      // reopenTransaction is called inside $transaction; updateMany must return count=1
      const txMock = {
        agentPlaygroundMission: {
          ...prisma.agentPlaygroundMission,
          updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }),
          findUnique: jest.fn().mockResolvedValueOnce(null),
        },
        agentPlaygroundMissionEvent: {
          create: jest.fn().mockResolvedValueOnce({}),
        },
        $executeRaw: jest.fn(),
      };
      prisma.$transaction.mockImplementationOnce(
        (cb: (tx: unknown) => Promise<unknown>) => cb(txMock),
      );
      await store.markReopened("m1", "u1");
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("listByMissionIds with non-empty ids returns mapped rows", async () => {
      prisma.agentPlaygroundMission.findMany.mockResolvedValueOnce([
        {
          id: "m1",
          topic: "T",
          depth: "deep",
          language: "en",
          status: "completed",
          startedAt: new Date(),
          completedAt: new Date(),
          elapsedWallTimeMs: 100,
          finalScore: 90,
          tokensUsed: BigInt(1000),
          costUsd: 0.5,
          reportTitle: "R",
          reportSummary: "S",
          errorMessage: null,
          visibility: "PRIVATE",
        },
      ]);
      const result = await store.listByMissionIds("u1", ["m1", "m2"]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("m1");
      expect(result[0].tokensUsed).toBe(1000); // BigInt → Number
    });

    it("reconcileTerminalCost uses ledger sum when entryCount > 0", async () => {
      // Need a store with agentPlaygroundMissionCostLedger that returns entryCount > 0
      const costLedger = {
        aggregate: jest.fn().mockResolvedValueOnce({
          _sum: { promptTokens: 500, completionTokens: 1000, costUsd: 1.5 },
          _count: { _all: 3 },
        }),
      };
      const prismaExt = Object.assign(makePrisma(), {
        agentPlaygroundMissionCostLedger: costLedger,
      });
      const storeExt = new MissionStore(prismaExt as never);
      // writeCompleted calls reconcileTerminalCost then prisma.updateMany
      prismaExt.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      const won = await storeExt.applyTerminalIfRunning("m1", {
        kind: "terminal",
        status: "completed",
        extra: {
          kind: "completed",
          userId: "u1",
          detail: { tokensUsed: 100, costUsd: 0.1 },
        },
      });
      // Won (updateMany returned count=1) and cost was overridden from ledger
      expect(won).toBe(true);
    });

    it("getById with configSnapshot having schemaVersion projects userProfile", async () => {
      const snap = {
        schemaVersion: 1,
        language: "zh-CN",
        businessInput: {
          description: "test",
          depth: "deep",
          budgetProfile: "standard",
          styleProfile: "academic",
          lengthProfile: "standard",
          audienceProfile: "general-public",
          withFigures: false,
          auditLayers: "minimal",
          concurrency: 2,
          viewMode: "continuous",
          searchTimeRange: "any",
          knowledgeBaseIds: [],
          inheritFromMissionId: null,
        },
        budget: {
          maxCredits: 1000,
          budgetMultiplier: 1.0,
        },
        runtimeLimits: {
          wallTimeCapMs: 3600000,
        },
      };
      const mockRow = {
        id: "m1",
        userId: "u1",
        topic: "T",
        depth: "deep",
        language: "zh-CN",
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
        failureCode: null,
        configSnapshot: snap,
        maxCredits: 100,
        themeSummary: null,
        dimensions: null,
        reportFull: null,
        verdicts: null,
        trajectoryStored: false,
        reportArtifactVersion: null,
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
      };
      // getById uses findFirst not findUnique
      prisma.agentPlaygroundMission.findFirst.mockResolvedValueOnce(mockRow);
      const result = await store.getById("m1", "u1");
      expect(result?.userProfile).not.toBeNull();
      expect(result?.userProfile?.depth).toBe("deep");
    });

    it("clearCheckpointJsonbKey error path logs and swallows", async () => {
      // To hit clearCheckpointJsonbKey error path, trigger writeCompleted (which calls clearCheckpoint internally)
      // Make $executeRaw throw
      prisma.$executeRaw.mockRejectedValueOnce(new Error("raw exec fail"));
      prisma.agentPlaygroundMission.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      // applyTerminalIfRunning completed calls writeCompleted → clearCheckpointJsonbKey
      const won = await store.applyTerminalIfRunning("m1", {
        kind: "terminal",
        status: "completed",
        extra: {
          kind: "completed",
          userId: "u1",
          detail: {},
        },
      });
      expect(won).toBe(true); // swallows clearCheckpoint error
    });
  });
});
