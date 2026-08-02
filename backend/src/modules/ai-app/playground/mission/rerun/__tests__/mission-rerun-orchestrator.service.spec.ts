/**
 * MissionRerunOrchestratorService — unit tests (playground business layer)
 *
 * Covers:
 *   - rerunFromTodo: origin=leader-assess-abort → BadRequestException
 *   - rerunFromTodo: origin=system-stage && todoId ends with s11-persist → BadRequestException
 *   - rerunFromTodo: valid origin → calls rerunFromTodoFrameworkCore
 *   - rerunFromTodo: topic sliced to 200 chars
 *   - rerunFromTodo: empty origin and scope defaults to mission
 *   - rerunFromTodo: dimensionRef whitespace → undefined
 *   - rerunFromTodo: todoTitle whitespace → undefined
 *   - rerunFromTodo: reasonText whitespace → undefined
 *   - rerunFullMission: mode=fresh → checkpointRef.clear called, runMission called
 *   - rerunFullMission: mode=incremental, no checkpoint → inheritFromMissionId set
 *   - rerunFullMission: mode=incremental, canResume=true → no inheritFromMissionId
 *   - rerunFullMission: returns {missionId, streamNamespace}
 *   - rerunFullMission: runMission fire-and-forget (no await propagation)
 *   - cloneInput hook: no configSnapshot.schemaVersion → BadRequestException
 *   - cloneInput hook: valid configSnapshot → returns RunMissionInput fields
 *   - extractStatus hook: returns m.status
 *   - extractTopic hook: returns m.topic
 *   - rerunnableStatuses: includes completed/failed/quality-failed/cancelled
 */

import { BadRequestException, ConflictException, Logger } from "@nestjs/common";

// Mock complex dep chains that break import resolution
jest.mock("../../pipeline/playground.pipeline", () => ({
  PlaygroundPipelineDispatcher: jest.fn(),
}));
jest.mock("../../lifecycle/mission-store.service", () => ({
  MissionStore: jest.fn(),
}));
jest.mock("../../lifecycle/mission-event-buffer.service", () => ({
  MissionEventBuffer: jest.fn(),
}));
jest.mock("../rerun-guard.service", () => ({ RerunGuardService: jest.fn() }));

import { MissionRerunOrchestratorService } from "../mission-rerun-orchestrator.service";

// Silence logger
beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

// ── Mock the harness framework ────────────────────────────────────────────────

jest.mock("@/modules/ai-harness/facade", () => {
  class BusinessTeamRerunOrchestratorFramework {
    protected hooks: Record<string, unknown>;
    protected log = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    constructor(hooks: Record<string, unknown>) {
      this.hooks = hooks;
    }

    protected async assertSourceMissionRerunnable(
      sourceMissionId: string,
      userId: string,
    ) {
      // Stub: just call sourceMissionResolver
      return (this.hooks as any).sourceMissionResolver(sourceMissionId, userId);
    }
  }

  const MissionCheckpointService = jest.fn();
  const MissionOwnershipRegistry = jest.fn();

  return {
    BusinessTeamRerunOrchestratorFramework,
    MissionCheckpointService,
    MissionOwnershipRegistry,
    // types (not runtime values)
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(missionRow: Record<string, unknown> | null = null) {
  return { getById: jest.fn().mockResolvedValue(missionRow) } as any;
}

function makeBuffer() {
  return { broadcast: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeOwnership() {
  return { assign: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeCheckpoint(
  canResumeDecision: { canResume: boolean } | null = null,
) {
  return {
    cloneCheckpoint: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    canResume: jest.fn().mockResolvedValue(canResumeDecision),
  } as any;
}

function makeRerunGuard() {
  return {} as any;
}

function makeDispatcher() {
  return { runMission: jest.fn().mockResolvedValue(undefined) } as any;
}

/** 本进程活 run 探针（2026-08-02）。默认无活 run = 可以续跑。 */
function makeAbortRegistry(hasLiveRun = false) {
  return { hasLiveRun: jest.fn().mockReturnValue(hasLiveRun) } as any;
}

function makeValidSnapshot() {
  return {
    schemaVersion: 2,
    topic: "AI Trends",
    language: "zh-CN",
    businessInput: {
      depth: "deep",
      budgetProfile: "standard",
      styleProfile: "analytical",
      lengthProfile: "long",
      audienceProfile: "executive",
      withFigures: true,
      auditLayers: "thorough",
      concurrency: 4,
      viewMode: "detailed",
      searchTimeRange: "2024-2025",
      knowledgeBaseIds: [],
    },
    budget: { maxCredits: 500, budgetMultiplier: 1.0 },
    runtimeLimits: { wallTimeCapMs: 300000 },
  };
}

function makeOrchestratorAndDeps(
  opts: {
    mission?: Record<string, unknown> | null;
    checkpoint?: ReturnType<typeof makeCheckpoint>;
    dispatcherRunMission?: jest.Mock;
    /** 本进程是否已有活 run（2026-08-02 同-id 续跑前置检查） */
    hasLiveRun?: boolean;
  } = {},
) {
  const checkpoint = opts.checkpoint ?? makeCheckpoint({ canResume: false });
  const dispatcher = makeDispatcher();
  if (opts.dispatcherRunMission) {
    dispatcher.runMission = opts.dispatcherRunMission;
  }
  const store = makeStore(opts.mission ?? null);
  const buffer = makeBuffer();
  const ownership = makeOwnership();
  const guard = makeRerunGuard();
  const abortRegistry = makeAbortRegistry(opts.hasLiveRun ?? false);

  const svc = new MissionRerunOrchestratorService(
    dispatcher,
    store,
    buffer,
    ownership,
    checkpoint,
    guard,
    abortRegistry,
  );

  // Wire rerunFromTodoFrameworkCore
  (svc as any)["rerunFromTodoFrameworkCore"] = jest.fn().mockResolvedValue({
    missionId: "m-src",
    streamNamespace: "playground",
  });

  return {
    svc,
    store,
    buffer,
    ownership,
    checkpoint,
    dispatcher,
    abortRegistry,
  };
}

// ── rerunFromTodo ─────────────────────────────────────────────────────────────

describe("MissionRerunOrchestratorService.rerunFromTodo", () => {
  it("origin=leader-assess-abort → BadRequestException", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await expect(
      svc.rerunFromTodo({
        sourceMissionId: "m-1",
        userId: "u-1",
        todoId: "todo-xyz",
        body: { origin: "leader-assess-abort" },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("origin=leader-assess-abort → error message mentions cannot be re-run", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await expect(
      svc.rerunFromTodo({
        sourceMissionId: "m-1",
        userId: "u-1",
        todoId: "todo-xyz",
        body: { origin: "leader-assess-abort" },
      }),
    ).rejects.toThrow(/cannot be re-run/);
  });

  it("origin=system-stage + todoId ending with s11-persist → BadRequestException", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await expect(
      svc.rerunFromTodo({
        sourceMissionId: "m-1",
        userId: "u-1",
        todoId: "some-prefix-s11-persist",
        body: { origin: "system-stage" },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("origin=system-stage + todoId NOT ending with s11-persist → delegates to framework", async () => {
    const { svc } = makeOrchestratorAndDeps();
    const result = await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-s9b",
      body: { origin: "system-stage", scope: "review" },
    });
    expect((svc as any)["rerunFromTodoFrameworkCore"]).toHaveBeenCalled();
    expect(result.missionId).toBe("m-src");
  });

  it("valid origin (empty) → calls framework", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-123",
      body: {},
    });
    expect((svc as any)["rerunFromTodoFrameworkCore"]).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMissionId: "m-src",
        userId: "u-1",
        todoId: "todo-123",
        todoBody: {},
      }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("payload extractor: scope defaults to mission when not set", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: {}, // no scope
    });
    const [, payloadExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const payload = payloadExtractor({});
    expect(payload.scope).toBe("mission");
  });

  it("payload extractor: dimensionRef whitespace → undefined", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: { dimensionRef: "  " },
    });
    const [, payloadExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const payload = payloadExtractor({ dimensionRef: "  " });
    expect(payload.dimensionRef).toBeUndefined();
  });

  it("payload extractor: todoTitle whitespace → undefined", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: { todoTitle: "  " },
    });
    const [, payloadExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const payload = payloadExtractor({ todoTitle: "  " });
    expect(payload.todoTitle).toBeUndefined();
  });

  it("payload extractor: reasonText whitespace → undefined", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: { reasonText: "   " },
    });
    const [, payloadExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const payload = payloadExtractor({ reasonText: "   " });
    expect(payload.reasonText).toBeUndefined();
  });

  it("payload extractor: valid dimensionRef, todoTitle, reasonText preserved", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: {
        dimensionRef: "dim-1",
        todoTitle: "Write more",
        reasonText: "Too short",
      },
    });
    const [, payloadExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const payload = payloadExtractor({
      dimensionRef: "dim-1",
      todoTitle: "Write more",
      reasonText: "Too short",
    });
    expect(payload.dimensionRef).toBe("dim-1");
    expect(payload.todoTitle).toBe("Write more");
    expect(payload.reasonText).toBe("Too short");
  });

  it("topic extractor: slices to 200 chars", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: {},
    });
    const [, , topicExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const longTopic = "x".repeat(300);
    const result = topicExtractor(undefined, longTopic);
    expect(result).toHaveLength(200);
  });

  it("topic extractor: short topic returned as-is", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: {},
    });
    const [, , topicExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const result = topicExtractor(undefined, "Short topic");
    expect(result).toBe("Short topic");
  });

  it("chapterIndex preserved in payload", async () => {
    const { svc } = makeOrchestratorAndDeps();
    await svc.rerunFromTodo({
      sourceMissionId: "m-src",
      userId: "u-1",
      todoId: "todo-x",
      body: { chapterIndex: 3 },
    });
    const [, payloadExtractor] = (svc as any)["rerunFromTodoFrameworkCore"].mock
      .calls[0];
    const payload = payloadExtractor({ chapterIndex: 3 });
    expect(payload.chapterIndex).toBe(3);
  });
});

// ── rerunFullMission ──────────────────────────────────────────────────────────

describe("MissionRerunOrchestratorService.rerunFullMission", () => {
  const sourceMissionId = "m-src";
  const userId = "u-1";

  function makeMissionRow(status = "completed") {
    return {
      id: sourceMissionId,
      topic: "AI in Finance",
      status,
      configSnapshot: makeValidSnapshot(),
    };
  }

  // ── 2026-08-02 回归：「点继续上次毫无反应」 ────────────────────────────────
  //
  // 复现的真实故障：mission 被 zombie cleanup 写成 failed，但那个 run 其实还活着。
  // 用户点续跑 → 走到这里 → void runMission() → pipeline 并发护栏 **return 而非
  // throw** → 既进不了 .catch()，HTTP 也早已 201。用户连点 8 次，8 个 201，
  // 后台 8 条"跳过本次重入"，界面零变化。
  //
  // 断言的是"不许假装受理"：有活 run 时必须抛（409），且绝不能碰 runMission。
  describe("同-id 续跑前置检查（本进程已有活 run）", () => {
    it("有活 run → 抛 ConflictException，而不是静默受理", async () => {
      const { svc } = makeOrchestratorAndDeps({
        mission: makeMissionRow("failed"),
        hasLiveRun: true,
      });
      await expect(
        svc.rerunFullMission(sourceMissionId, userId, "incremental"),
      ).rejects.toThrow(ConflictException);
    });

    it("有活 run → runMission 一次都不许调（旧行为是调了然后被静默跳过）", async () => {
      const dispatcher = makeDispatcher();
      const { svc } = makeOrchestratorAndDeps({
        mission: makeMissionRow("failed"),
        hasLiveRun: true,
        dispatcherRunMission: dispatcher.runMission,
      });
      await expect(
        svc.rerunFullMission(sourceMissionId, userId, "incremental"),
      ).rejects.toThrow();
      expect(dispatcher.runMission).not.toHaveBeenCalled();
    });

    it("有活 run + mode=fresh → 同样拦下，且不清 checkpoint（清了就毁掉在跑那个 run 的续跑点）", async () => {
      const checkpoint = makeCheckpoint();
      const { svc } = makeOrchestratorAndDeps({
        mission: makeMissionRow("failed"),
        checkpoint,
        hasLiveRun: true,
      });
      await expect(
        svc.rerunFullMission(sourceMissionId, userId, "fresh"),
      ).rejects.toThrow(ConflictException);
      expect(checkpoint.clear).not.toHaveBeenCalled();
    });

    it("无活 run → 照常放行（探针只在真有 run 时否决）", async () => {
      const dispatcher = makeDispatcher();
      const { svc, abortRegistry } = makeOrchestratorAndDeps({
        mission: makeMissionRow("failed"),
        hasLiveRun: false,
        dispatcherRunMission: dispatcher.runMission,
      });
      const res = await svc.rerunFullMission(
        sourceMissionId,
        userId,
        "incremental",
      );
      expect(abortRegistry.hasLiveRun).toHaveBeenCalledWith(sourceMissionId);
      expect(res.missionId).toBe(sourceMissionId);
      expect(dispatcher.runMission).toHaveBeenCalled();
    });
  });

  it("mode=fresh → checkpointRef.clear called with sourceMissionId", async () => {
    const checkpoint = makeCheckpoint();
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
    });
    await svc.rerunFullMission(sourceMissionId, userId, "fresh");
    expect(checkpoint.clear).toHaveBeenCalledWith(sourceMissionId);
  });

  it("mode=fresh → checkpointRef.canResume NOT called", async () => {
    const checkpoint = makeCheckpoint();
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
    });
    await svc.rerunFullMission(sourceMissionId, userId, "fresh");
    expect(checkpoint.canResume).not.toHaveBeenCalled();
  });

  it("mode=incremental + canResume=true → inheritFromMissionId not set", async () => {
    const checkpoint = makeCheckpoint({ canResume: true });
    const dispatcher = makeDispatcher();
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
      dispatcherRunMission: dispatcher.runMission,
    });
    await svc.rerunFullMission(sourceMissionId, userId, "incremental");
    const callArgs = dispatcher.runMission.mock.calls[0];
    const input = callArgs[1];
    expect(input.inheritFromMissionId).toBeUndefined();
  });

  it("mode=incremental + canResume=false → inheritFromMissionId set to sourceMissionId", async () => {
    const checkpoint = makeCheckpoint({ canResume: false });
    const dispatcher = makeDispatcher();
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
      dispatcherRunMission: dispatcher.runMission,
    });
    await svc.rerunFullMission(sourceMissionId, userId, "incremental");
    const callArgs = dispatcher.runMission.mock.calls[0];
    const input = callArgs[1];
    expect(input.inheritFromMissionId).toBe(sourceMissionId);
  });

  it("mode=incremental (default) → acts as incremental", async () => {
    const checkpoint = makeCheckpoint({ canResume: true });
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
    });
    // Default mode is incremental
    await svc.rerunFullMission(sourceMissionId, userId);
    expect(checkpoint.clear).not.toHaveBeenCalled();
  });

  it("returns {missionId: sourceMissionId, streamNamespace: 'playground'}", async () => {
    const checkpoint = makeCheckpoint({ canResume: true });
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
    });
    const result = await svc.rerunFullMission(sourceMissionId, userId, "fresh");
    expect(result.missionId).toBe(sourceMissionId);
    expect(result.streamNamespace).toBe("playground");
  });

  it("runMission is fire-and-forget (does not throw on failure)", async () => {
    const checkpoint = makeCheckpoint({ canResume: true });
    const dispatcher = makeDispatcher();
    dispatcher.runMission.mockRejectedValue(new Error("pipeline crash"));
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
      dispatcherRunMission: dispatcher.runMission,
    });
    // Should not throw despite runMission rejection
    await expect(
      svc.rerunFullMission(sourceMissionId, userId, "fresh"),
    ).resolves.toBeDefined();
  });

  it("canResume throws → defaults to self-inherit (fail-open)", async () => {
    const checkpoint = makeCheckpoint(null); // canResume returns null
    checkpoint.canResume.mockRejectedValue(new Error("checkpoint unavailable"));
    const dispatcher = makeDispatcher();
    const { svc } = makeOrchestratorAndDeps({
      mission: makeMissionRow(),
      checkpoint,
      dispatcherRunMission: dispatcher.runMission,
    });
    await svc.rerunFullMission(sourceMissionId, userId, "incremental");
    const callArgs = dispatcher.runMission.mock.calls[0];
    const input = callArgs[1];
    // canResume failed → decision is null → !decision?.canResume is true → inherit
    expect(input.inheritFromMissionId).toBe(sourceMissionId);
  });
});

// ── cloneInput hook ───────────────────────────────────────────────────────────

describe("MissionRerunOrchestratorService hooks.cloneInput", () => {
  it("no configSnapshot.schemaVersion → BadRequestException", async () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    const source = { id: "m-1", configSnapshot: null };
    expect(() => hooks.cloneInput(source, {})).toThrow(BadRequestException);
  });

  it("configSnapshot with schemaVersion → returns RunMissionInput", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    const snap = makeValidSnapshot();
    const source = { id: "m-1", configSnapshot: snap };
    const result = hooks.cloneInput(source, {});
    expect(result.topic).toBe("AI Trends");
    expect(result.depth).toBe("deep");
    expect(result.language).toBe("zh-CN");
    expect(result.budgetProfile).toBe("standard");
    expect(result.maxCredits).toBe(500);
    expect(result.budgetMultiplierOverride).toBe(1.0);
    expect(result.wallTimeCapMs).toBe(300000);
  });

  it("topic override takes precedence over snapshot.topic", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    const source = { id: "m-1", configSnapshot: makeValidSnapshot() };
    const result = hooks.cloneInput(source, { topic: "Custom Topic" });
    expect(result.topic).toBe("Custom Topic");
  });

  it("inheritFromMissionId from overrides passed through", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    const source = { id: "m-1", configSnapshot: makeValidSnapshot() };
    const result = hooks.cloneInput(source, {
      inheritFromMissionId: "m-parent",
    });
    expect(result.inheritFromMissionId).toBe("m-parent");
  });

  it("no overrides.inheritFromMissionId → undefined in result", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    const source = { id: "m-1", configSnapshot: makeValidSnapshot() };
    const result = hooks.cloneInput(source, {});
    expect(result.inheritFromMissionId).toBeUndefined();
  });
});

// ── extractStatus / extractTopic hooks ───────────────────────────────────────

describe("MissionRerunOrchestratorService hooks.extractStatus / extractTopic", () => {
  it("extractStatus returns m.status", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    expect(hooks.extractStatus({ status: "completed" })).toBe("completed");
    expect(hooks.extractStatus({ status: "failed" })).toBe("failed");
  });

  it("extractTopic returns m.topic", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    expect(hooks.extractTopic({ topic: "AI in Finance" })).toBe(
      "AI in Finance",
    );
  });
});

// ── rerunnableStatuses ────────────────────────────────────────────────────────

describe("MissionRerunOrchestratorService hooks.rerunnableStatuses", () => {
  it("includes completed, failed, quality-failed, cancelled", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    expect(hooks.rerunnableStatuses).toContain("completed");
    expect(hooks.rerunnableStatuses).toContain("failed");
    expect(hooks.rerunnableStatuses).toContain("quality-failed");
    expect(hooks.rerunnableStatuses).toContain("cancelled");
  });
});

// ── emit hook ─────────────────────────────────────────────────────────────────

describe("MissionRerunOrchestratorService hooks.emit", () => {
  it("calls buffer.broadcast with correct shape", async () => {
    const { svc, buffer } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    await hooks.emit({
      type: "playground.mission:rerun-started",
      missionId: "m-1",
      userId: "u-1",
      payload: { mode: "fresh" },
    });
    expect(buffer.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "playground.mission:rerun-started",
        scope: { missionId: "m-1", userId: "u-1" },
        payload: { mode: "fresh" },
      }),
    );
  });
});

// ── eventNames ────────────────────────────────────────────────────────────────

describe("MissionRerunOrchestratorService hooks.eventNames", () => {
  it("manualRerunFromTodo is playground.mission:manual-rerun-from-todo", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    expect(hooks.eventNames.manualRerunFromTodo).toBe(
      "playground.mission:manual-rerun-from-todo",
    );
  });
});

// ── streamNamespace ────────────────────────────────────────────────────────────

describe("MissionRerunOrchestratorService hooks.streamNamespace", () => {
  it("is playground", () => {
    const { svc } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    expect(hooks.streamNamespace).toBe("playground");
  });
});

// ── assignOwnership / cloneCheckpoint hooks (lines 120-122) ──────────────────

describe("MissionRerunOrchestratorService hooks.assignOwnership + cloneCheckpoint", () => {
  it("assignOwnership delegates to ownership.assign (line 120)", async () => {
    const { svc, ownership } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    await hooks.assignOwnership("m-new", "u-1");
    expect(ownership.assign).toHaveBeenCalledWith("m-new", "u-1");
  });

  it("cloneCheckpoint delegates to checkpoint.cloneCheckpoint (line 121-122)", async () => {
    const { svc, checkpoint } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    await hooks.cloneCheckpoint("m-src", "m-new");
    expect(checkpoint.cloneCheckpoint).toHaveBeenCalledWith("m-src", "m-new");
  });

  it("runMission hook delegates to orchestrator.runMission (line 116-118)", async () => {
    const { svc, dispatcher } = makeOrchestratorAndDeps();
    const hooks = (svc as any).hooks;
    await hooks.runMission("m-1", { topic: "AI" }, "u-1");
    expect(dispatcher.runMission).toHaveBeenCalledWith(
      "m-1",
      { topic: "AI" },
      "u-1",
    );
  });
});
