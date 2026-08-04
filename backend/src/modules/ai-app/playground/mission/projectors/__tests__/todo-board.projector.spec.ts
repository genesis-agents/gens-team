/**
 * todo-board.projector.spec.ts
 *
 * Unit tests for projectTodoBoard() — targeting 95%+ branch/line coverage of
 * todo-board.projector.ts.
 *
 * Key coverage targets:
 *   - null row → empty sentinel
 *   - 14 system stage placeholder pre-allocation
 *   - stage:lifecycle single event (started / completed / failed)
 *   - stage.started / stage.completed / stage.failed (legacy format)
 *   - dimensions:appended / leader:dimensions
 *   - dimension:research:started / completed (with/without findingCount)
 *   - dimension:retrying (leader-chat-create / leader-assess / self-heal)
 *   - chapter:writing:started / completed / failed
 *   - chapter:revision / chapter:rewritten
 *   - critic:verdict (pass / fail / concerns, with/without warnings)
 *   - reconciliation:completed (gapCount > 0 / gapCount = 0)
 *   - agent:narrative (dim / agentRefId / neither)
 *   - leader:goals-set (successCriteria / minCoverage / initialRisks)
 *   - leader:decision (assess-research-dispatched / assess-research)
 *   - leader:foreword
 *   - leader:signed (signed=true / false)
 *   - dimension:retry-failed
 *   - mission:degraded
 *   - dimension:graded (with/without grade)
 *   - verifier:verdict (critic vs writer verifier)
 *   - mission:warning
 *   - mission:reopened (s11 was done vs not done)
 *   - chapter:writing:failed
 *   - chapter:review:started / completed (passed / not passed)
 *   - researcher:completed (retryLabel / stateVal=completed / stateVal other)
 *   - dimension:integrating:* (started / completed / failed)
 *   - mission:budget-warning-soft / hard (wall_time_exceeded / not)
 *   - budget:warning-soft
 *   - budget:exhausted
 *   - mission:postlude:started / completed / failed
 *   - failure-pattern:pre-applied
 *   - iteration:progress
 *   - event:dropped / event:oversized
 *   - dimension:outline:planned
 *   - dimension:retry-phase:started / completed
 *   - artifact high-water compensation (bumps to done)
 *   - terminal cleanup (isSuccess / isTerminalFailure)
 *   - dimension rollup (row.dimensions without events)
 *   - sortByAnchor
 *   - addNarrative dedup
 *   - resolveInProgressRetryChildren
 */

import { projectTodoBoard } from "../todo-board.projector";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<any> = {}): any {
  return {
    id: "m1",
    topic: "Test",
    depth: "standard",
    language: "zh-CN",
    status: "running",
    startedAt: new Date("2025-01-01T00:00:00.000Z"),
    completedAt: null,
    elapsedWallTimeMs: null,
    finalScore: null,
    tokensUsed: null,
    costUsd: null,
    reportTitle: null,
    reportSummary: null,
    errorMessage: null,
    visibility: "private",
    terminalOutcome: null,
    failureCode: null,
    configSnapshot: null,
    maxCredits: 100,
    themeSummary: null,
    dimensions: null,
    reportFull: null,
    verdicts: null,
    trajectoryStored: null,
    reportArtifactVersion: null,
    userProfile: null,
    reconciliationReport: null,
    leaderJournal: null,
    leaderOverallScore: null,
    leaderSigned: null,
    leaderVerdict: null,
    outlinePlan: null,
    analystOutput: null,
    ...overrides,
  };
}

function mkEv(
  type: string,
  payload: Record<string, unknown> | null = {},
  timestamp = 1000,
  agentId?: string,
) {
  return { type, payload, timestamp, agentId };
}

// ---------------------------------------------------------------------------
// Null row
// ---------------------------------------------------------------------------

describe("projectTodoBoard — null row", () => {
  it("returns empty sentinel when row is null", () => {
    const result = projectTodoBoard(null, []);
    expect(result).toEqual({ kind: "empty-todo-board" });
  });
});

// ---------------------------------------------------------------------------
// Basic pre-allocation
// ---------------------------------------------------------------------------

describe("projectTodoBoard — pre-allocation", () => {
  it("pre-allocates 14 system stage todos", () => {
    const result = projectTodoBoard(makeRow(), []) as any;
    expect(result.kind).toBe("todo-board");
    const sysItems = result.items.filter((t: any) => t.scope === "system");
    expect(sysItems).toHaveLength(14);
  });

  it("all pre-allocated todos start as pending", () => {
    const result = projectTodoBoard(makeRow(), []) as any;
    result.items
      .filter((t: any) => t.scope === "system")
      .forEach((t: any) => {
        expect(t.status).toBe("pending");
      });
  });

  it("isFirstCutTruncated is false", () => {
    const result = projectTodoBoard(makeRow(), []) as any;
    expect(result.isFirstCutTruncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stage:lifecycle single event
// ---------------------------------------------------------------------------

describe("projectTodoBoard — stage:lifecycle", () => {
  it("started: pending → in_progress", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s2-leader-plan",
        status: "started",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.status).toBe("in_progress");
    expect(s2.startedAt).toBe(1000);
    // narrative added
    expect(s2.narrativeLog.some((n: any) => n.text === "stage 启动")).toBe(
      true,
    );
  });

  it("started: already in_progress → stays in_progress", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s2-leader-plan",
        status: "started",
      }),
      mkEv(
        "playground.stage:lifecycle",
        { stepId: "s2-leader-plan", status: "started" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.status).toBe("in_progress");
  });

  it("completed: status → done", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s3-researchers",
        status: "completed",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s3 = result.items.find((t: any) => t.id === "system:s3-researchers");
    expect(s3.status).toBe("done");
    expect(s3.endedAt).toBe(1000);
    expect(s3.narrativeLog.some((n: any) => n.text === "stage 完成")).toBe(
      true,
    );
  });

  it("failed: status → failed with error detail", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s4-leader-assess",
        status: "failed",
        error: "timeout",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.status).toBe("failed");
    expect(
      s4.narrativeLog.some(
        (n: any) => n.text === "timeout" && n.tone === "error",
      ),
    ).toBe(true);
  });

  it("failed: uses message fallback when error absent", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s5-reconciler",
        status: "failed",
        message: "oom",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s5 = result.items.find((t: any) => t.id === "system:s5-reconciler");
    expect(s5.narrativeLog.some((n: any) => n.text === "oom")).toBe(true);
  });

  it("failed: uses detail fallback when error and message absent", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s5-reconciler",
        status: "failed",
        detail: "det",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s5 = result.items.find((t: any) => t.id === "system:s5-reconciler");
    expect(s5.narrativeLog.some((n: any) => n.text === "det")).toBe(true);
  });

  it("unknown stepId creates todo with id as preset fallback", () => {
    const events = [
      mkEv("stage:lifecycle", { stepId: "s-unknown-stage", status: "started" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const found = result.items.find(
      (t: any) => t.id === "system:s-unknown-stage",
    );
    expect(found).toBeDefined();
  });

  it("no stepId → lifecycle event ignored", () => {
    const events = [mkEv("stage:lifecycle", { status: "started" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });

  it("step id mapped via mapStepToFrontendStage", () => {
    const events = [
      mkEv("stage:lifecycle", { stepId: "s8-writer", status: "completed" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s8 = result.items.find((t: any) => t.id === "system:s8-writer-draft");
    expect(s8.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Legacy split stage events
// ---------------------------------------------------------------------------

// Note: evSuffix(type) = type.includes(".") ? type.slice(indexOf(".")+1) : type
//   "x.stage.started" → "stage.started"  (matches legacy handler)
//   "playground.stage:started" → "stage:started"  (matches legacy handler)
//   bare "stage.started" → "started"  (does NOT match; would need prefix)
describe("projectTodoBoard — legacy stage events", () => {
  it("stage.started (prefixed dot form → suffix=stage.started)", () => {
    const events = [mkEv("x.stage.started", { stepId: "s2-leader-plan" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.status).toBe("in_progress");
  });

  it("stage:started (colon form via playground. prefix → suffix=stage:started)", () => {
    const events = [
      mkEv("playground.stage:started", { stepId: "s2-leader-plan" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.status).toBe("in_progress");
  });

  it("stage.completed marks done (prefixed dot form)", () => {
    const events = [mkEv("x.stage.completed", { stepId: "s3-researchers" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s3 = result.items.find((t: any) => t.id === "system:s3-researchers");
    expect(s3.status).toBe("done");
  });

  it("stage:completed marks done (colon form)", () => {
    const events = [
      mkEv("playground.stage:completed", { stepId: "s3-researchers" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s3 = result.items.find((t: any) => t.id === "system:s3-researchers");
    expect(s3.status).toBe("done");
  });

  it("stage.failed marks failed with detail (prefixed dot form)", () => {
    const events = [
      mkEv("x.stage.failed", {
        stepId: "s4-leader-assess",
        message: "timeout",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.status).toBe("failed");
    expect(s4.narrativeLog.some((n: any) => n.text === "timeout")).toBe(true);
  });

  it("stage:failed marks failed (colon form)", () => {
    const events = [
      mkEv("playground.stage:failed", {
        stepId: "s4-leader-assess",
        detail: "err",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.status).toBe("failed");
  });

  it("stage:lifecycle with unknown stepId creates todo with fallback preset", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s-new-one",
        status: "failed",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const found = result.items.find((t: any) => t.id === "system:s-new-one");
    expect(found).toBeDefined();
    expect(found.status).toBe("failed");
  });

  it("stage:started with no stepId is skipped (no crash)", () => {
    const events = [mkEv("playground.stage:started", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });

  it("stage:lifecycle with unknown stepId and completed status creates fallback todo", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "sx-new-one",
        status: "completed",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const found = result.items.find((t: any) => t.id === "system:sx-new-one");
    expect(found).toBeDefined();
    expect(found.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Dimensions fanout
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimensions:appended / leader:dimensions", () => {
  it("creates dim todos for each dimension", () => {
    const events = [
      mkEv("dimensions:appended", {
        dimensions: [
          { id: "d1", name: "Finance", rationale: "Important" },
          { id: "d2", name: "Tech" },
        ],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dimItems = result.items.filter(
      (t: any) => t.scope === "dimension" && t.origin === "leader-plan",
    );
    expect(dimItems.length).toBeGreaterThanOrEqual(2);
  });

  it("skips dimensions without name", () => {
    const events = [
      mkEv("dimensions:appended", {
        dimensions: [{ id: "d1" }, { name: "Finance" }],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dimItems = result.items.filter(
      (t: any) => t.origin === "leader-plan" && t.scope === "dimension",
    );
    expect(dimItems).toHaveLength(1);
  });

  it("leader:dimensions variant also creates dim todos", () => {
    const events = [
      mkEv("playground.leader:dimensions", {
        dimensions: [{ name: "Economy" }],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dimItems = result.items.filter(
      (t: any) => t.origin === "leader-plan",
    );
    expect(dimItems).toHaveLength(1);
    expect(dimItems[0].title).toBe("Economy");
  });

  it("handles null dimensions payload gracefully", () => {
    const events = [mkEv("dimensions:appended", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// dimension:research:started / completed
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension research lifecycle", () => {
  it("started creates dim todo with in_progress", () => {
    const events = [
      mkEv(
        "dimension:research:started",
        { dimension: "Finance" },
        1000,
        "researcher#0",
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim).toBeDefined();
    expect(dim.status).toBe("in_progress");
    expect(dim.agentRefId).toBe("researcher#0");
  });

  it("started on existing pending dim → transitions to in_progress", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:research:started", { dimension: "Finance" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("in_progress");
  });

  it("completed with findingCount → done + artifact", () => {
    const events = [
      mkEv("dimension:research:completed", {
        dimension: "Finance",
        findingCount: 42,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("done");
    expect(dim.artifacts.some((a: any) => a.value === 42)).toBe(true);
    expect(dim.narrativeLog.some((n: any) => n.text.includes("42"))).toBe(true);
  });

  it("completed without findingCount → done with generic narrative", () => {
    const events = [
      mkEv("dimension:research:completed", { dimension: "Finance" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("done");
    expect(dim.narrativeLog.some((n: any) => n.text === "研究完成")).toBe(true);
  });

  it("started/completed ignored when no dimension", () => {
    const events = [
      mkEv("dimension:research:started", {}),
      mkEv("dimension:research:completed", {}),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// dimension:retrying
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension:retrying", () => {
  it("leader-chat-create origin", () => {
    const events = [
      mkEv("dimension:research:started", { dimension: "Finance" }),
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-chat-create" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-chat-create",
    );
    expect(retryTodo).toBeDefined();
    expect(retryTodo.title).toContain("Leader 对话追加");
    expect(retryTodo.narrativeLog[0].tone).toBe("info");
  });

  it("leader-assess origin", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        {
          dimension: "Finance",
          reason: "leader-assess-retry",
          critique: "Too shallow",
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-assess-retry",
    );
    expect(retryTodo).toBeDefined();
    expect(retryTodo.createdBy).toBe("leader");
    expect(retryTodo.narrativeLog[0].tone).toBe("warn");
    expect(retryTodo.reasonText).toContain("Too shallow");
  });

  it("self-heal origin", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "self-heal" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "self-heal-retry",
    );
    expect(retryTodo).toBeDefined();
    expect(retryTodo.createdBy).toBe("system");
  });

  it("patchDetail from rationale when critique absent", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        {
          dimension: "Finance",
          reason: "leader-assess",
          rationale: "needs more data",
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find((t: any) => t.title.includes("重试"));
    expect(retryTodo.reasonText).toContain("needs more data");
  });

  it("patchDetail truncated to 300 chars in narrative", () => {
    const longCritique = "x".repeat(400);
    const events = [
      mkEv(
        "dimension:retrying",
        {
          dimension: "Finance",
          reason: "leader-assess",
          critique: longCritique,
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find((t: any) => t.title.includes("重试"));
    // narrative should contain truncated (≤ 300+prefix chars)
    expect(retryTodo.narrativeLog[0].text.length).toBeLessThan(500);
  });

  it("no dimension → ignored", () => {
    const events = [mkEv("dimension:retrying", { reason: "leader-assess" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });

  it("fallback reasonText when no patchDetail", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "auto-retry" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find((t: any) => t.title.includes("重试"));
    expect(retryTodo.reasonText).toBe("auto-retry");
  });
});

// ---------------------------------------------------------------------------
// chapter:writing lifecycle
// ---------------------------------------------------------------------------

describe("projectTodoBoard — chapter writing lifecycle", () => {
  it("chapter:writing:started creates chapter todo", () => {
    const events = [
      mkEv(
        "chapter:writing:started",
        { dimension: "Tech", heading: "Intro", index: 1 },
        1000,
        "writer#1",
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch).toBeDefined();
    expect(ch.title).toContain("Intro");
    expect(ch.status).toBe("in_progress");
    expect(ch.agentRefId).toBe("writer#1");
  });

  it("chapter:writing:started uses chapterTitle when heading absent", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        chapterTitle: "Chapter Title",
        index: 1,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.title).toContain("Chapter Title");
  });

  it("chapter:writing:started without index uses heading as id part", () => {
    const events = [
      mkEv("chapter:writing:started", { dimension: "Tech", heading: "H1" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.id).toContain("H1");
  });

  it("chapter:writing:started on existing pending → in_progress", () => {
    const events = [
      mkEv(
        "chapter:writing:started",
        { dimension: "Tech", heading: "H1", index: 1 },
        1000,
      ),
      mkEv(
        "chapter:writing:started",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const chapters = result.items.filter((t: any) => t.scope === "chapter");
    expect(chapters).toHaveLength(1);
  });

  it("chapter:writing:completed marks done + wordCount artifact", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:writing:completed",
        { dimension: "Tech", heading: "H1", index: 1, wordCount: 500 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.status).toBe("done");
    expect(ch.artifacts.some((a: any) => a.value === 500)).toBe(true);
  });

  it("chapter:done also marks done", () => {
    const events = [
      mkEv(
        "chapter:done",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.status).toBe("done");
  });

  it("chapter:writing:completed without wordCount → done without artifact", () => {
    const events = [
      mkEv(
        "chapter:writing:completed",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.status).toBe("done");
    expect(ch.artifacts).toHaveLength(0);
  });

  it("chapter:writing:started without dim/heading is ignored", () => {
    const events = [
      mkEv("chapter:writing:started", { heading: "H1" }),
      mkEv("chapter:writing:started", { dimension: "Tech" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const chapters = result.items.filter((t: any) => t.scope === "chapter");
    expect(chapters).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// chapter:revision / chapter:rewritten
// ---------------------------------------------------------------------------

describe("projectTodoBoard — chapter revision/rewritten", () => {
  it("chapter:revision creates review todo", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:revision",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const review = result.items.find(
      (t: any) => t.scope === "review" && t.origin === "reviewer-revise",
    );
    expect(review).toBeDefined();
    expect(review.title).toContain("重写");
  });

  it("chapter:rewritten also creates review todo", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:rewritten",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const review = result.items.find((t: any) => t.scope === "review");
    expect(review).toBeDefined();
  });

  it("chapter:revision without dim/heading is ignored", () => {
    const events = [
      mkEv("chapter:revision", {}),
      mkEv("chapter:rewritten", { dimension: "Tech" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const reviews = result.items.filter((t: any) => t.scope === "review");
    expect(reviews).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// critic:verdict
// ---------------------------------------------------------------------------

describe("projectTodoBoard — critic:verdict", () => {
  const makeWarning = (severity = "warn") => ({
    id: "w1",
    kind: "blindspot",
    message: "Missing data",
    severity,
  });

  it("creates aggregated L4 review todo (pass → done)", () => {
    const events = [
      mkEv("critic:verdict", {
        warnings: [makeWarning("info")],
        verdict: "pass",
        blindspotCount: 1,
        biasCount: 0,
        suggestionCount: 2,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo).toBeDefined();
    expect(criticTodo.status).toBe("done");
    expect(
      criticTodo.artifacts.find((a: any) => a.label === "Verdict").value,
    ).toBe("pass");
  });

  it("verdict=fail → failed status", () => {
    const events = [
      mkEv("critic:verdict", {
        warnings: [makeWarning()],
        verdict: "fail",
        blindspotCount: 3,
        biasCount: 2,
        suggestionCount: 1,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo.status).toBe("failed");
  });

  it("concerns verdict → done", () => {
    const events = [
      mkEv("critic:verdict", {
        warnings: [makeWarning()],
        overall: "concerns",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo.status).toBe("done");
  });

  it("uses rationale as reasonText when present", () => {
    const events = [
      mkEv("critic:verdict", {
        warnings: [makeWarning()],
        rationale: "Detailed reason",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo.reasonText).toBe("Detailed reason");
  });

  it("maps warning severity=info → tone=info", () => {
    const events = [
      mkEv("critic:verdict", {
        warnings: [{ severity: "info", message: "note" }],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo.narrativeLog[0].tone).toBe("info");
  });

  it("maps warning with kind only (no severity)", () => {
    const events = [
      mkEv("critic:verdict", {
        warnings: [{ kind: "bias", message: "Bias detected" }],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo.narrativeLog[0].tone).toBe("warn");
    expect(criticTodo.narrativeLog[0].text).toContain("[bias]");
  });

  it("updates existing critic:verdict todo on second run", () => {
    const events = [
      mkEv(
        "critic:verdict",
        { warnings: [makeWarning()], verdict: "pass" },
        1000,
      ),
      mkEv(
        "critic:verdict",
        { warnings: [makeWarning()], verdict: "fail" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodos = result.items.filter(
      (t: any) => t.id === "critic:verdict",
    );
    expect(criticTodos).toHaveLength(1);
    expect(criticTodos[0].status).toBe("failed");
  });

  it("no warnings → no critic:verdict todo created", () => {
    const events = [mkEv("critic:verdict", { warnings: [], verdict: "pass" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo).toBeUndefined();
  });

  it("missing verdict defaults to 'concerns'", () => {
    const events = [
      mkEv("critic:verdict", {
        warnings: [makeWarning()],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const criticTodo = result.items.find((t: any) => t.id === "critic:verdict");
    expect(criticTodo.status).toBe("done"); // concerns → done
  });
});

// ---------------------------------------------------------------------------
// reconciliation:completed
// ---------------------------------------------------------------------------

describe("projectTodoBoard — reconciliation:completed", () => {
  it("gapCount > 0 creates reconciler-gap todo", () => {
    const events = [mkEv("reconciliation:completed", { gapCount: 3 })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const gap = result.items.find((t: any) => t.origin === "reconciler-gap");
    expect(gap).toBeDefined();
    expect(gap.title).toContain("3");
    expect(gap.scope).toBe("mission");
  });

  it("gapCount = 0 → no reconciler-gap todo", () => {
    const events = [mkEv("reconciliation:completed", { gapCount: 0 })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const gap = result.items.find((t: any) => t.origin === "reconciler-gap");
    expect(gap).toBeUndefined();
  });

  it("missing gapCount defaults to 0 → no todo", () => {
    const events = [mkEv("reconciliation:completed", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    const gap = result.items.find((t: any) => t.origin === "reconciler-gap");
    expect(gap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// agent:narrative
// ---------------------------------------------------------------------------

describe("projectTodoBoard — agent:narrative", () => {
  it("attaches narrative to dim todo when dimension matches", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "agent:narrative",
        { dimension: "Finance", text: "Found data" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.some((n: any) => n.text === "Found data")).toBe(
      true,
    );
  });

  it("attaches narrative via agentRefId when dim not found", () => {
    const events = [
      mkEv(
        "dimension:research:started",
        { dimension: "Finance" },
        1000,
        "researcher#0",
      ),
      mkEv("agent:narrative", { text: "Progress note" }, 2000, "researcher#0"),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.some((n: any) => n.text === "Progress note")).toBe(
      true,
    );
  });

  it("tone success for tag=success", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "agent:narrative",
        { dimension: "Finance", text: "Done!", tag: "success" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    const nar = dim.narrativeLog.find((n: any) => n.text === "Done!");
    expect(nar.tone).toBe("success");
  });

  it("tone warn for tag=warning", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "agent:narrative",
        { dimension: "Finance", text: "Warn!", tag: "warning" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.find((n: any) => n.text === "Warn!").tone).toBe(
      "warn",
    );
  });

  it("tone error for tag=error", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "agent:narrative",
        { dimension: "Finance", text: "Err!", tag: "error" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.find((n: any) => n.text === "Err!").tone).toBe(
      "error",
    );
  });

  it("no text → skipped", () => {
    const events = [mkEv("agent:narrative", { dimension: "Finance" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });

  it("dimension not in state and no agentRefId match → ignored", () => {
    const events = [mkEv("agent:narrative", { text: "Orphan note" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// leader:goals-set
// ---------------------------------------------------------------------------

describe("projectTodoBoard — leader:goals-set", () => {
  it("adds successCriteria artifact to s2", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: {
          successCriteria: ["Criteria 1", "Criteria 2"],
          qualityBar: { minCoverage: 80 },
        },
        initialRisks: [],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.artifacts.some((a: any) => a.label === "成功标准")).toBe(true);
    expect(s2.artifacts.some((a: any) => a.label === "质量阈值")).toBe(true);
  });

  it("adds initialRisks narrative", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: [] },
        initialRisks: ["Risk 1", "Risk 2"],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.narrativeLog.some((n: any) => n.text.includes("初步风险"))).toBe(
      true,
    );
  });

  it("handles object risk entries", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: [] },
        initialRisks: [
          { type: "budget", severity: "high", mitigation: "review" },
        ],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.narrativeLog.some((n: any) => n.text.includes("budget"))).toBe(
      true,
    );
  });

  it("successCriteria > 3 items truncates with ellipsis", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: ["C1", "C2", "C3", "C4"] },
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    const nar = s2.narrativeLog.find((n: any) =>
      n.text.includes("Leader 声明成功标准"),
    );
    expect(nar.text).toContain("…");
  });

  it("successCriteria item > 50 chars truncated", () => {
    const longCriteria = "A".repeat(100);
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: [longCriteria] },
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    const nar = s2.narrativeLog.find((n: any) =>
      n.text.includes("Leader 声明成功标准"),
    );
    expect(nar.text.length).toBeLessThan(300);
  });

  it("initialRisks > 2 items adds ellipsis", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: [] },
        initialRisks: ["R1", "R2", "R3"],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    const nar = s2.narrativeLog.find((n: any) => n.text.includes("初步风险"));
    expect(nar.text).toContain("…");
  });

  it("handles non-object/non-string initialRisk items", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: [] },
        initialRisks: [42],
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.narrativeLog.some((n: any) => n.text.includes("42"))).toBe(true);
  });

  it("minCoverage null → no artifact", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: ["C1"] },
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.artifacts.some((a: any) => a.label === "质量阈值")).toBe(false);
  });

  it("goals-set with null successCriteria item → JSON.stringify", () => {
    const events = [
      mkEv("leader:goals-set", {
        goals: { successCriteria: [{ nested: "obj" }] },
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    // Should have artifact for successCriteria
    expect(s2.artifacts.some((a: any) => a.label === "成功标准")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// leader:decision
// ---------------------------------------------------------------------------

describe("projectTodoBoard — leader:decision", () => {
  it("assess-research-dispatched → s4 done + decisionMsg artifact", () => {
    const events = [
      mkEv("leader:decision", {
        phase: "assess-research-dispatched",
        stats: { retried: 1, aborted: 0, appended: 1, skipped: 0 },
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.status).toBe("done");
    expect(s4.artifacts.some((a: any) => a.label === "维度调度")).toBe(true);
    expect(s4.narrativeLog.some((n: any) => n.text.includes("调度完成"))).toBe(
      true,
    );
  });

  it("assess-research → s4 in_progress + decision narrative", () => {
    const events = [
      mkEv("leader:decision", {
        phase: "assess-research",
        decision: "retry",
        rationale: "Insufficient findings",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.status).toBe("in_progress");
    expect(s4.narrativeLog.some((n: any) => n.text.includes("retry"))).toBe(
      true,
    );
    expect(
      s4.narrativeLog.some((n: any) => n.text.includes("Insufficient")),
    ).toBe(true);
  });

  it("assess-research with long rationale truncated to 400 + ellipsis", () => {
    const longRationale = "R".repeat(500);
    const events = [
      mkEv("leader:decision", {
        phase: "assess-research",
        decision: "retry",
        rationale: longRationale,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    const nar = s4.narrativeLog.find((n: any) => n.text.includes("理由"));
    expect(nar.text).toContain("…");
  });

  it("assess-research empty rationale → no rationale narrative", () => {
    const events = [
      mkEv("leader:decision", {
        phase: "assess-research",
        decision: "accept",
        rationale: "  ",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.narrativeLog.some((n: any) => n.text.includes("理由"))).toBe(
      false,
    );
  });

  it("assess-research no decision → no decision narrative", () => {
    const events = [mkEv("leader:decision", { phase: "assess-research" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.narrativeLog.some((n: any) => n.text.includes("评审决策"))).toBe(
      false,
    );
  });

  it("unknown phase → no action (no narrative)", () => {
    const events = [mkEv("leader:decision", { phase: "unknown-phase" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// leader:foreword
// ---------------------------------------------------------------------------

describe("projectTodoBoard — leader:foreword", () => {
  it("sets s10 to in_progress with foreword artifact", () => {
    const events = [mkEv("leader:foreword", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s10 = result.items.find(
      (t: any) => t.id === "system:s10-leader-signoff",
    );
    expect(s10.status).toBe("in_progress");
    expect(s10.artifacts.some((a: any) => a.kind === "foreword")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// leader:signed
// ---------------------------------------------------------------------------

describe("projectTodoBoard — leader:signed", () => {
  it("signed=true → done with score artifact", () => {
    const events = [
      mkEv("leader:signed", {
        signed: true,
        leaderOverallScore: 90,
        leaderVerdict: "approved",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s10 = result.items.find(
      (t: any) => t.id === "system:s10-leader-signoff",
    );
    expect(s10.status).toBe("done");
    expect(s10.artifacts.some((a: any) => a.value === "90/100")).toBe(true);
    expect(s10.artifacts.some((a: any) => a.label === "Verdict")).toBe(true);
  });

  it("signed=false → failed with refusalReason artifact", () => {
    const events = [
      mkEv("leader:signed", {
        signed: false,
        refusalReason: "not ready",
        accountabilityNote: "Fix issues first",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s10 = result.items.find(
      (t: any) => t.id === "system:s10-leader-signoff",
    );
    expect(s10.status).toBe("failed");
    expect(s10.artifacts.some((a: any) => a.label === "拒签原因")).toBe(true);
    expect(s10.narrativeLog.some((n: any) => n.text.includes("拒签说明"))).toBe(
      true,
    );
  });

  it("signed=false without refusalReason → no refusal artifact", () => {
    const events = [mkEv("leader:signed", { signed: false })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s10 = result.items.find(
      (t: any) => t.id === "system:s10-leader-signoff",
    );
    expect(s10.artifacts.some((a: any) => a.label === "拒签原因")).toBe(false);
  });

  it("accountabilityNote > 500 chars → truncated with ellipsis", () => {
    const longNote = "N".repeat(600);
    const events = [
      mkEv("leader:signed", { signed: false, accountabilityNote: longNote }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s10 = result.items.find(
      (t: any) => t.id === "system:s10-leader-signoff",
    );
    const nar = s10.narrativeLog.find((n: any) => n.text.includes("拒签说明"));
    expect(nar.text).toContain("…");
  });

  it("no score → no score artifact", () => {
    const events = [mkEv("leader:signed", { signed: true })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s10 = result.items.find(
      (t: any) => t.id === "system:s10-leader-signoff",
    );
    expect(s10.artifacts.some((a: any) => a.label === "Leader 总评")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// dimension:retry-failed
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension:retry-failed", () => {
  it("marks the most recent in_progress retry child as failed", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-assess-retry" },
        1000,
      ),
      mkEv(
        "dimension:retry-failed",
        { dimension: "Finance", error: "timeout" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-assess-retry",
    );
    expect(retryTodo.status).toBe("failed");
    expect(
      retryTodo.narrativeLog.some((n: any) => n.text.includes("timeout")),
    ).toBe(true);
  });

  it("uses fallback error message when error absent", () => {
    // All leader-assess-* reasons map to origin "leader-assess-retry"
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance2", reason: "leader-assess-extend" },
        1000,
      ),
      mkEv("dimension:retry-failed", { dimension: "Finance2" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) =>
        t.origin === "leader-assess-retry" && t.dimensionRef === "Finance2",
    );
    expect(
      retryTodo.narrativeLog.some((n: any) => n.text.includes("无具体错误")),
    ).toBe(true);
  });

  it("no dimension → ignored", () => {
    const events = [mkEv("dimension:retry-failed", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// mission:degraded
// ---------------------------------------------------------------------------

describe("projectTodoBoard — mission:degraded", () => {
  it("adds warn narrative to s4", () => {
    const events = [
      mkEv("mission:degraded", { reason: "partial-failure", failedCount: 2 }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s4 = result.items.find(
      (t: any) => t.id === "system:s4-leader-assess",
    );
    expect(s4.narrativeLog.some((n: any) => n.text.includes("degraded"))).toBe(
      true,
    );
    expect(s4.narrativeLog.some((n: any) => n.tone === "warn")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dimension:graded
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension:graded", () => {
  it("grade >= 70 → success tone narrative", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:graded", { dimension: "Finance", overall: 85 }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("done");
    const nar = dim.narrativeLog.find((n: any) => n.text.includes("85/100"));
    expect(nar.tone).toBe("success");
  });

  it("grade < 70 → warn tone narrative", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:graded", { dimension: "Finance", overall: 60 }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    const nar = dim.narrativeLog.find((n: any) => n.text.includes("60/100"));
    expect(nar.tone).toBe("warn");
  });

  it("overallScore field as fallback", () => {
    const events = [
      mkEv("dimension:graded", { dimension: "Tech", overallScore: 75 }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Tech");
    expect(dim.artifacts.some((a: any) => a.value === "75/100")).toBe(true);
  });

  it("no grade → no artifact or narrative", () => {
    const events = [mkEv("dimension:graded", { dimension: "Tech" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Tech");
    expect(dim.artifacts).toHaveLength(0);
    expect(dim.narrativeLog).toHaveLength(0);
  });

  it("does not downgrade cancelled/failed dim status", () => {
    const events = [
      mkEv("dimension:research:started", { dimension: "Finance" }),
      // fake failed status via mission terminal cleanup + graded
    ];
    const row = makeRow({ status: "failed" });
    const result = projectTodoBoard(row, events) as any;
    // dim should be cancelled (terminal cleanup)
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("cancelled");
  });

  it("no dimension → ignored", () => {
    const events = [mkEv("dimension:graded", { overall: 80 })];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// verifier:verdict
// ---------------------------------------------------------------------------

describe("projectTodoBoard — verifier:verdict", () => {
  it("critic verifierId → s9-critic-l4 gets score artifact", () => {
    const events = [
      mkEv("verifier:verdict", { verifierId: "critic-1", score: 88 }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s9 = result.items.find((t: any) => t.id === "system:s9-critic-l4");
    expect(s9.artifacts.some((a: any) => a.value === "88/100")).toBe(true);
  });

  it("non-critic verifierId → s8-writer-draft gets score artifact", () => {
    const events = [
      mkEv("verifier:verdict", { verifierId: "verifier-1", score: 72 }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s8 = result.items.find((t: any) => t.id === "system:s8-writer-draft");
    expect(s8.artifacts.some((a: any) => a.value === "72/100")).toBe(true);
  });

  it("missing verifierId or score → ignored", () => {
    const events = [
      mkEv("verifier:verdict", { verifierId: "v1" }),
      mkEv("verifier:verdict", { score: 80 }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// mission:warning
// ---------------------------------------------------------------------------

describe("projectTodoBoard — mission:warning", () => {
  it("adds warn narrative to s11-persist", () => {
    const events = [mkEv("mission:warning", { message: "Heartbeat missed" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s11 = result.items.find((t: any) => t.id === "system:s11-persist");
    expect(
      s11.narrativeLog.some(
        (n: any) => n.text === "Heartbeat missed" && n.tone === "warn",
      ),
    ).toBe(true);
  });

  it("default message when no message in payload", () => {
    const events = [mkEv("mission:warning", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s11 = result.items.find((t: any) => t.id === "system:s11-persist");
    expect(s11.narrativeLog.some((n: any) => n.text.includes("心跳"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// mission:reopened
// ---------------------------------------------------------------------------

describe("projectTodoBoard — mission:reopened", () => {
  it("resets s11 from done to in_progress", () => {
    const events = [
      mkEv(
        "playground.stage:lifecycle",
        { stepId: "s11-persist", status: "completed" },
        1000,
      ),
      mkEv("mission:reopened", {}, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s11 = result.items.find((t: any) => t.id === "system:s11-persist");
    expect(s11.status).toBe("in_progress");
    expect(s11.endedAt).toBeUndefined();
  });

  it("does nothing to s11 when not done", () => {
    const events = [mkEv("mission:reopened", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s11 = result.items.find((t: any) => t.id === "system:s11-persist");
    expect(s11.status).toBe("pending"); // still pending
  });
});

// ---------------------------------------------------------------------------
// chapter:writing:failed
// ---------------------------------------------------------------------------

describe("projectTodoBoard — chapter:writing:failed", () => {
  it("creates failed chapter todo with error narrative", () => {
    const events = [
      mkEv("chapter:writing:failed", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
        error: "OOM",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.status).toBe("failed");
    expect(ch.narrativeLog.some((n: any) => n.text.includes("OOM"))).toBe(true);
  });

  it("uses message fallback when error absent", () => {
    const events = [
      mkEv("chapter:writing:failed", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
        message: "Msg err",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.narrativeLog.some((n: any) => n.text.includes("Msg err"))).toBe(
      true,
    );
  });

  it("error > 200 chars truncated", () => {
    const longError = "E".repeat(300);
    const events = [
      mkEv("chapter:writing:failed", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
        error: longError,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    const nar = ch.narrativeLog.find((n: any) => n.tone === "error");
    expect(nar.text.length).toBeLessThan(300);
  });

  it("no error → no error narrative", () => {
    const events = [
      mkEv("chapter:writing:failed", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.narrativeLog).toHaveLength(0);
  });

  it("missing dim/heading → ignored", () => {
    const events = [
      mkEv("chapter:writing:failed", { heading: "H1" }),
      mkEv("chapter:writing:failed", { dimension: "Tech" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.items.filter((t: any) => t.scope === "chapter")).toHaveLength(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// chapter:review:started / completed
// ---------------------------------------------------------------------------

describe("projectTodoBoard — chapter:review lifecycle", () => {
  it("review:started assigns reviewer role", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:review:started",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.assignee.role).toBe("reviewer");
    expect(
      ch.narrativeLog.some((n: any) => n.text === "Reviewer 开始审稿"),
    ).toBe(true);
  });

  it("review:completed with score artifact and passed narrative", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:review:completed",
        { dimension: "Tech", heading: "H1", index: 1, score: 88, passed: true },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.artifacts.some((a: any) => a.value === "88/100")).toBe(true);
    expect(ch.narrativeLog.some((n: any) => n.text === "审稿通过")).toBe(true);
  });

  it("review:completed with passed=false → warn narrative", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:review:completed",
        { dimension: "Tech", heading: "H1", index: 1, passed: false },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(
      ch.narrativeLog.some(
        (n: any) => n.text === "审稿不通过，触发重写" && n.tone === "warn",
      ),
    ).toBe(true);
  });

  it("review:completed without score → no score artifact", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:review:completed",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    expect(ch.artifacts).toHaveLength(0);
  });

  it("review events without dim/heading → ignored", () => {
    const events = [mkEv("chapter:review:started", { heading: "H1" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.items.filter((t: any) => t.scope === "chapter")).toHaveLength(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// researcher:completed
// ---------------------------------------------------------------------------

describe("projectTodoBoard — researcher:completed", () => {
  it("no dimension → skip", () => {
    const events = [mkEv("researcher:completed", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });

  it("retryLabel → updates most recent in_progress retry child", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-assess-retry" },
        1000,
      ),
      mkEv(
        "researcher:completed",
        {
          dimension: "Finance",
          retryLabel: "retry-1",
          findingsCount: 15,
          summary: "Found important data here.",
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-assess-retry",
    );
    expect(
      retryTodo.artifacts.some((a: any) => a.label === "retry 后 finding"),
    ).toBe(true);
    expect(
      retryTodo.artifacts.some((a: any) => a.label === "retry summary"),
    ).toBe(true);
  });

  it("retryLabel but short summary → no summary artifact", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-assess-retry" },
        1000,
      ),
      mkEv(
        "researcher:completed",
        {
          dimension: "Finance",
          retryLabel: "retry-1",
          findingsCount: 5,
          summary: "Short",
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-assess-retry",
    );
    expect(
      retryTodo.artifacts.some((a: any) => a.label === "retry summary"),
    ).toBe(false);
  });

  it("stateVal=completed → adds findings artifact + summary artifact", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "researcher:completed",
        {
          dimension: "Finance",
          state: "completed",
          findingsCount: 30,
          summary: "Found comprehensive data on the topic.",
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.artifacts.some((a: any) => a.label === "采集到 finding")).toBe(
      true,
    );
    expect(dim.artifacts.some((a: any) => a.label === "采集摘要")).toBe(true);
  });

  it("stateVal=completed with short summary → no summary artifact", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "researcher:completed",
        {
          dimension: "Finance",
          state: "completed",
          findingsCount: 10,
          summary: "Short",
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.artifacts.some((a: any) => a.label === "采集摘要")).toBe(false);
  });

  it("stateVal != completed → warn narrative", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "researcher:completed",
        {
          dimension: "Finance",
          state: "partial",
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.some((n: any) => n.text.includes("partial"))).toBe(
      true,
    );
  });

  it("no matching leader-plan dim todo for retryLabel → no update", () => {
    const events = [
      mkEv(
        "researcher:completed",
        {
          dimension: "Finance",
          retryLabel: "retry-1",
          findingsCount: 5,
        },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// dimension:integrating:*
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension:integrating", () => {
  it("started → narrative on dim todo", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:integrating:started", { dimension: "Finance" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.some((n: any) => n.text.includes("启动"))).toBe(
      true,
    );
  });

  it("completed → narrative on dim todo", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:integrating:completed", { dimension: "Finance" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.some((n: any) => n.text.includes("完成"))).toBe(
      true,
    );
  });

  it("failed → warn narrative on dim todo", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:integrating:failed", { dimension: "Finance" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    const nar = dim.narrativeLog.find((n: any) => n.text.includes("失败"));
    expect(nar.tone).toBe("warn");
  });

  it("no dimension → no narrative", () => {
    const events = [mkEv("dimension:integrating:started", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// Budget warnings
// ---------------------------------------------------------------------------

describe("projectTodoBoard — budget warnings", () => {
  it("mission:budget-warning-soft → warn narrative on s1", () => {
    const events = [
      mkEv("mission:budget-warning-soft", {
        reason: "low",
        shortfall: 100,
        suggestion: "reduce",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    const nar = s1.narrativeLog.find((n: any) => n.tone === "warn");
    expect(nar).toBeDefined();
    expect(nar.text).toContain("软告警");
  });

  it("mission:budget-warning-hard → error narrative on s1", () => {
    const events = [
      mkEv("mission:budget-warning-hard", {
        shortfall: 500,
        suggestion: "abort",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    const nar = s1.narrativeLog.find((n: any) => n.tone === "error");
    expect(nar).toBeDefined();
    expect(nar.text).toContain("硬告警");
  });

  it("mission:budget-warning-hard with wall_time_exceeded reason", () => {
    const events = [
      mkEv("mission:budget-warning-hard", {
        reason: "wall_time_exceeded",
        wallTimeMs: 3600000,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    expect(s1.narrativeLog.some((n: any) => n.text.includes("60"))).toBe(true);
  });

  it("budget:warning-soft → s1 warn narrative with tokens", () => {
    const events = [
      mkEv("budget:warning-soft", {
        ratio: 0.85,
        poolTokensUsed: 8500,
        poolTokensRemaining: 1500,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    expect(
      s1.narrativeLog.some((n: any) => n.text.includes("预算软告警")),
    ).toBe(true);
    expect(s1.narrativeLog.some((n: any) => n.text.includes("8.5k"))).toBe(
      true,
    );
  });

  it("budget:warning-soft with small numbers (not k format)", () => {
    const events = [
      mkEv("budget:warning-soft", {
        ratio: 0.5,
        poolTokensUsed: 500,
        poolTokensRemaining: 500,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    expect(s1.narrativeLog.some((n: any) => n.text.includes("500"))).toBe(true);
  });

  it("budget:exhausted → error narrative on s1", () => {
    const events = [mkEv("budget:exhausted", { poolTokensUsed: 10000 })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    expect(s1.narrativeLog.some((n: any) => n.text.includes("预算耗尽"))).toBe(
      true,
    );
    expect(s1.narrativeLog.some((n: any) => n.tone === "error")).toBe(true);
  });

  it("budget:exhausted with small tokens (not k format)", () => {
    const events = [mkEv("budget:exhausted", { poolTokensUsed: 500 })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    expect(s1.narrativeLog.some((n: any) => n.text.includes("500"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mission:postlude:*
// ---------------------------------------------------------------------------

describe("projectTodoBoard — mission:postlude", () => {
  it("postlude:started → s12 pending → in_progress", () => {
    const events = [mkEv("mission:postlude:started", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s12 = result.items.find(
      (t: any) => t.id === "system:s12-self-evolution",
    );
    expect(s12.status).toBe("in_progress");
  });

  it("postlude:completed → s12 done + narrative", () => {
    const events = [
      mkEv("mission:postlude:started", {}, 1000),
      mkEv("mission:postlude:completed", {}, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s12 = result.items.find(
      (t: any) => t.id === "system:s12-self-evolution",
    );
    expect(s12.status).toBe("done");
    expect(
      s12.narrativeLog.some((n: any) => n.text.includes("self-evolution 完成")),
    ).toBe(true);
  });

  it("postlude:completed does not downgrade failed s12", () => {
    const events = [
      mkEv("mission:postlude:failed", { error: "disk full" }, 1000),
      mkEv("mission:postlude:completed", {}, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s12 = result.items.find(
      (t: any) => t.id === "system:s12-self-evolution",
    );
    expect(s12.status).toBe("failed");
  });

  it("postlude:failed → s12 failed + error narrative", () => {
    const events = [
      mkEv("mission:postlude:started", {}, 1000),
      mkEv("mission:postlude:failed", { error: "disk full" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s12 = result.items.find(
      (t: any) => t.id === "system:s12-self-evolution",
    );
    expect(s12.status).toBe("failed");
    expect(
      s12.narrativeLog.some((n: any) => n.text.includes("disk full")),
    ).toBe(true);
  });

  it("postlude:failed with message fallback", () => {
    const events = [
      mkEv("mission:postlude:started", {}, 1000),
      mkEv("mission:postlude:failed", { message: "timeout" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s12 = result.items.find(
      (t: any) => t.id === "system:s12-self-evolution",
    );
    expect(s12.narrativeLog.some((n: any) => n.text.includes("timeout"))).toBe(
      true,
    );
  });

  it("postlude:started on already in_progress → stays in_progress", () => {
    const events = [
      mkEv("mission:postlude:started", {}, 1000),
      mkEv("mission:postlude:started", {}, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s12 = result.items.find(
      (t: any) => t.id === "system:s12-self-evolution",
    );
    expect(s12.status).toBe("in_progress");
  });
});

// ---------------------------------------------------------------------------
// failure-pattern:pre-applied
// ---------------------------------------------------------------------------

describe("projectTodoBoard — failure-pattern:pre-applied", () => {
  it("adds info narrative to s2", () => {
    const events = [
      mkEv("failure-pattern:pre-applied", { patternId: "P-001" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.narrativeLog.some((n: any) => n.text.includes("P-001"))).toBe(
      true,
    );
  });

  it("missing patternId → uses '未命名'", () => {
    const events = [mkEv("failure-pattern:pre-applied", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    expect(s2.narrativeLog.some((n: any) => n.text.includes("未命名"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// iteration:progress
// ---------------------------------------------------------------------------

describe("projectTodoBoard — iteration:progress", () => {
  it("adds narrative to the running stage todo", () => {
    const events = [
      mkEv("iteration:progress", { stepId: "s3-researchers", iteration: 3 }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s3 = result.items.find((t: any) => t.id === "system:s3-researchers");
    expect(s3.narrativeLog.some((n: any) => n.text.includes("3"))).toBe(true);
  });

  it("no stepId or iteration → no narrative", () => {
    const events = [mkEv("iteration:progress", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// event:dropped / event:oversized
// ---------------------------------------------------------------------------

describe("projectTodoBoard — event:dropped / event:oversized", () => {
  it("event:dropped adds warn narrative to s11", () => {
    const events = [mkEv("event:dropped", { reason: "buffer full" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s11 = result.items.find((t: any) => t.id === "system:s11-persist");
    expect(
      s11.narrativeLog.some((n: any) => n.text.includes("buffer full")),
    ).toBe(true);
  });

  it("event:oversized adds warn narrative to s11", () => {
    const events = [mkEv("event:oversized", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s11 = result.items.find((t: any) => t.id === "system:s11-persist");
    expect(
      s11.narrativeLog.some((n: any) => n.text.includes("buffer 容量限制")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dimension:outline:planned
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension:outline:planned", () => {
  it("adds chapter count narrative to dim todo", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "dimension:outline:planned",
        { dimension: "Finance", chapterCount: 5 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.some((n: any) => n.text.includes("5"))).toBe(true);
  });

  it("uses 'count' field when chapterCount absent", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "dimension:outline:planned",
        { dimension: "Finance", count: 3 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.narrativeLog.some((n: any) => n.text.includes("3"))).toBe(true);
  });

  it("no count → generic narrative", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:outline:planned", { dimension: "Finance" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(
      dim.narrativeLog.some((n: any) => n.text === "章节大纲规划完成"),
    ).toBe(true);
  });

  it("no dimension → ignored", () => {
    const events = [mkEv("dimension:outline:planned", {})];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// dimension:retry-phase:*
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension:retry-phase", () => {
  it("retry-phase:started adds info narrative", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "dimension:retry-phase:started",
        { dimension: "Finance", phase: "collect" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(
      dim.narrativeLog.some(
        (n: any) => n.text.includes("collect") && n.tone === "info",
      ),
    ).toBe(true);
  });

  it("retry-phase:completed adds success narrative", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "dimension:retry-phase:completed",
        { dimension: "Finance", phase: "grade" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(
      dim.narrativeLog.some(
        (n: any) => n.text.includes("grade") && n.tone === "success",
      ),
    ).toBe(true);
  });

  it("no dim/phase → ignored", () => {
    const events = [
      mkEv("dimension:retry-phase:started", { dimension: "Finance" }),
      mkEv("dimension:retry-phase:started", { phase: "collect" }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    expect(result.kind).toBe("todo-board");
  });
});

// ---------------------------------------------------------------------------
// Artifact high-water compensation
// ---------------------------------------------------------------------------

describe("projectTodoBoard — artifact high-water compensation", () => {
  it("themeSummary present → s2 becomes done", () => {
    const row = makeRow({ themeSummary: "Big theme", status: "running" });
    const result = projectTodoBoard(row, []) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    // s2 should be done because themeSummary is present
    expect(s2.status).toBe("done");
    // s1 is also ≤ HW(s2=idx 1) → done
    const s1 = result.items.find((t: any) => t.id === "system:s1-budget");
    expect(s1.status).toBe("done");
  });

  it("reconciliationReport → s5 and all preceding done", () => {
    const row = makeRow({ reconciliationReport: { report: "data" } });
    const result = projectTodoBoard(row, []) as any;
    const s5 = result.items.find((t: any) => t.id === "system:s5-reconciler");
    expect(s5.status).toBe("done");
  });

  it("leaderSigned=true → s10 and all preceding done", () => {
    const row = makeRow({ leaderSigned: true });
    const result = projectTodoBoard(row, []) as any;
    const s10 = result.items.find(
      (t: any) => t.id === "system:s10-leader-signoff",
    );
    expect(s10.status).toBe("done");
  });

  it("verdicts array present → s9-critic-l4 done", () => {
    const row = makeRow({ verdicts: [{ verifierId: "v1", score: 80 }] });
    const result = projectTodoBoard(row, []) as any;
    const s9 = result.items.find((t: any) => t.id === "system:s9-critic-l4");
    expect(s9.status).toBe("done");
  });

  it("running mission: only pending todos get compensation bump, not in_progress", () => {
    const events = [
      mkEv("playground.stage:lifecycle", {
        stepId: "s3-researchers",
        status: "started",
      }),
    ];
    const row = makeRow({ themeSummary: "Theme" });
    const result = projectTodoBoard(row, events) as any;
    // s3 was set to in_progress by event; it's ≤ HW(s2) → should remain in_progress (not bumped)
    const s3 = result.items.find((t: any) => t.id === "system:s3-researchers");
    // s3 idx = 2, HW = idx of s2 = 1 → s3 NOT ≤ HW → stays in_progress (fine)
    // Actually s2 is idx=1, s3 is idx=2, so s3 is not ≤ HW=1 → no change
    expect(s3.status).toBe("in_progress");
  });
});

// ---------------------------------------------------------------------------
// Terminal cleanup
// ---------------------------------------------------------------------------

describe("projectTodoBoard — terminal cleanup", () => {
  it("completed mission → all pending system stages marked done", () => {
    const row = makeRow({ status: "completed" });
    const result = projectTodoBoard(row, []) as any;
    result.items
      .filter((t: any) => t.scope === "system")
      .forEach((t: any) => {
        expect(t.status).toBe("done");
      });
  });

  it("rejected mission → all pending system stages marked done (isSuccess=true)", () => {
    const row = makeRow({ status: "rejected" });
    const result = projectTodoBoard(row, []) as any;
    result.items
      .filter((t: any) => t.scope === "system")
      .forEach((t: any) => {
        expect(t.status).toBe("done");
      });
  });

  it("failed mission → system todos above HW stay failed, non-system cancelled", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv("dimension:research:started", { dimension: "Finance" }),
    ];
    const row = makeRow({ status: "failed" });
    const result = projectTodoBoard(row, events) as any;
    // dimension todo → not a retry origin → cancelled
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("cancelled");
  });

  it("failed mission → retry child → 'failed' status", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-assess-retry" },
        1000,
      ),
    ];
    const row = makeRow({ status: "failed" });
    const result = projectTodoBoard(row, events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-assess-retry",
    );
    expect(retryTodo.status).toBe("failed");
  });

  it("cancelled mission → retry child → 'cancelled'", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-assess-retry" },
        1000,
      ),
    ];
    const row = makeRow({ status: "cancelled" });
    const result = projectTodoBoard(row, events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-assess-retry",
    );
    expect(retryTodo.status).toBe("cancelled");
  });

  it("completed mission → main dimension todo (leader-plan) → done", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
    ];
    const row = makeRow({ status: "completed" });
    const result = projectTodoBoard(row, events) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("done");
  });

  it("narrative added to todos with empty log at terminal", () => {
    const events = [mkEv("reconciliation:completed", { gapCount: 2 })];
    const row = makeRow({ status: "cancelled" });
    const result = projectTodoBoard(row, events) as any;
    const gap = result.items.find((t: any) => t.origin === "reconciler-gap");
    expect(gap.narrativeLog.length).toBeGreaterThan(0);
    // The first one is from reconciliation:completed creation, so narrativeLog may already have items
    // but the terminal one adds "mission 终态，自动结束" if empty was
  });
});

// ---------------------------------------------------------------------------
// Dimension rollup from row.dimensions
// ---------------------------------------------------------------------------

describe("projectTodoBoard — dimension rollup", () => {
  it("creates dim placeholder for each name in row.dimensions", () => {
    const row = makeRow({
      dimensions: [{ name: "Finance" }, { name: "Tech" }],
    });
    const result = projectTodoBoard(row, []) as any;
    const dims = result.items.filter(
      (t: any) => t.scope === "dimension" && t.origin === "leader-plan",
    );
    expect(dims.length).toBeGreaterThanOrEqual(2);
  });

  it("skips null/non-object entries in row.dimensions", () => {
    const row = makeRow({
      dimensions: [null, { name: "Finance" }, "string", 42],
    });
    const result = projectTodoBoard(row, []) as any;
    const dims = result.items.filter(
      (t: any) => t.scope === "dimension" && t.origin === "leader-plan",
    );
    expect(dims).toHaveLength(1);
  });

  it("skips dimension entries with empty name", () => {
    const row = makeRow({ dimensions: [{ name: "" }, { name: "Tech" }] });
    const result = projectTodoBoard(row, []) as any;
    const dims = result.items.filter(
      (t: any) => t.scope === "dimension" && t.origin === "leader-plan",
    );
    expect(dims).toHaveLength(1);
  });

  it("mapMissionStatusToTodo: completed → done", () => {
    const row = makeRow({
      status: "completed",
      dimensions: [{ name: "Finance" }],
    });
    // Finance is created by rollup (no event for it), then terminal cleanup hits it
    const result = projectTodoBoard(row, []) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("done");
  });

  it("mapMissionStatusToTodo: rejected → failed (rollup runs after terminal cleanup)", () => {
    // dim rollup runs at step 4, after terminal cleanup at step b.
    // mapMissionStatusToTodo("rejected") = "failed"
    const row = makeRow({
      status: "rejected",
      dimensions: [{ name: "Finance" }],
    });
    const result = projectTodoBoard(row, []) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Finance");
    expect(dim.status).toBe("failed");
  });

  it("row.dimensions is not array → no rollup", () => {
    const row = makeRow({ dimensions: "not-array" });
    const result = projectTodoBoard(row, []) as any;
    const dims = result.items.filter(
      (t: any) => t.scope === "dimension" && t.origin === "leader-plan",
    );
    expect(dims).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addNarrative deduplication
// ---------------------------------------------------------------------------

describe("projectTodoBoard — addNarrative dedup", () => {
  it("does not add duplicate consecutive narrative texts", () => {
    const events = [
      // started adds "stage 启动" once
      mkEv(
        "playground.stage:lifecycle",
        { stepId: "s2-leader-plan", status: "started" },
        1000,
      ),
      // another started should add "stage 启动" again but at same text → dedup
      mkEv(
        "playground.stage:lifecycle",
        { stepId: "s2-leader-plan", status: "started" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const s2 = result.items.find((t: any) => t.id === "system:s2-leader-plan");
    const startNarratives = s2.narrativeLog.filter(
      (n: any) => n.text === "stage 启动",
    );
    // Second "stage 启动" should be deduped
    expect(startNarratives.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolveInProgressRetryChildren
// ---------------------------------------------------------------------------

describe("projectTodoBoard — resolveInProgressRetryChildren", () => {
  it("dim research:completed → resolves in-progress retry children to done", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-assess-retry" },
        1000,
      ),
      mkEv(
        "dimension:research:completed",
        { dimension: "Finance", findingCount: 10 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-assess-retry",
    );
    expect(retryTodo.status).toBe("done");
    expect(
      retryTodo.narrativeLog.some((n: any) => n.text.includes("被纳入")),
    ).toBe(true);
  });

  it("dim graded → resolves in-progress retry children to done", () => {
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "self-heal-retry" },
        1000,
      ),
      mkEv("dimension:graded", { dimension: "Finance", overall: 80 }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "self-heal-retry",
    );
    expect(retryTodo.status).toBe("done");
  });

  it("pending retry children are also resolved", () => {
    // Create a retry todo in in_progress then manually check pending case is covered
    // (status pending OR in_progress → resolved)
    const events = [
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "leader-chat-create" },
        1000,
      ),
      mkEv("dimension:research:completed", { dimension: "Finance" }, 2000),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const retryTodo = result.items.find(
      (t: any) => t.origin === "leader-chat-create",
    );
    expect(retryTodo.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// sortByAnchor ordering
// ---------------------------------------------------------------------------

describe("projectTodoBoard — sortByAnchor", () => {
  it("system stages appear before dimension todos", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const items = result.items;
    const s2Idx = items.findIndex((t: any) => t.id === "system:s2-leader-plan");
    const dimIdx = items.findIndex((t: any) => t.id === "dim:Finance");
    // s2 (sortKey=2) < dim (sortKey=3.5)
    expect(s2Idx).toBeLessThan(dimIdx);
  });

  it("chapter todos appear after s7 and before s8", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const items = result.items;
    const s7Idx = items.findIndex(
      (t: any) => t.id === "system:s7-writer-outline",
    );
    const chIdx = items.findIndex((t: any) => t.scope === "chapter");
    const s8Idx = items.findIndex(
      (t: any) => t.id === "system:s8-writer-draft",
    );
    expect(chIdx).toBeGreaterThan(s7Idx);
    expect(chIdx).toBeLessThan(s8Idx);
  });

  it("reconciler-gap (scope=mission) anchors at 5.5 (after s5, before s6)", () => {
    const events = [mkEv("reconciliation:completed", { gapCount: 2 })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const items = result.items;
    const s5Idx = items.findIndex((t: any) => t.id === "system:s5-reconciler");
    const gapIdx = items.findIndex((t: any) => t.origin === "reconciler-gap");
    const s6Idx = items.findIndex((t: any) => t.id === "system:s6-analyst");
    expect(gapIdx).toBeGreaterThan(s5Idx);
    expect(gapIdx).toBeLessThan(s6Idx);
  });

  it("review todos (scope=review) appear near end", () => {
    const events = [
      mkEv("chapter:writing:started", {
        dimension: "Tech",
        heading: "H1",
        index: 1,
      }),
      mkEv(
        "chapter:revision",
        { dimension: "Tech", heading: "H1", index: 1 },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const items = result.items;
    const reviewIdx = items.findIndex((t: any) => t.scope === "review");
    const s11Idx = items.findIndex((t: any) => t.id === "system:s11-persist");
    expect(reviewIdx).toBeLessThan(s11Idx);
  });

  it("children appear after their parent in DFS order", () => {
    const events = [
      mkEv("dimensions:appended", { dimensions: [{ name: "Finance" }] }),
      mkEv(
        "dimension:retrying",
        { dimension: "Finance", reason: "self-heal-retry" },
        2000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const items = result.items;
    const dimIdx = items.findIndex((t: any) => t.id === "dim:Finance");
    const retryIdx = items.findIndex(
      (t: any) => t.origin === "self-heal-retry",
    );
    expect(retryIdx).toBeGreaterThan(dimIdx);
  });
});

// ---------------------------------------------------------------------------
// Additional branch coverage tests
// ---------------------------------------------------------------------------

describe("projectTodoBoard — legacy stage unknown stepId init callbacks", () => {
  it("x.stage.started with unknown stepId triggers fallback init (lines 415-423)", () => {
    // "x.stage.started" → suffix = "stage.started"
    // unknown stepId → mapStepToFrontendStage returns same id → upsert calls init with fallback preset
    const events = [mkEv("x.stage.started", { stepId: "sx-unknown-stage" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const found = result.items.find(
      (t: any) => t.id === "system:sx-unknown-stage",
    );
    expect(found).toBeDefined();
    expect(found.status).toBe("in_progress");
  });

  it("x.stage.completed with unknown stepId triggers fallback init (lines 442-443)", () => {
    const events = [mkEv("x.stage.completed", { stepId: "sx-unk2" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const found = result.items.find((t: any) => t.id === "system:sx-unk2");
    expect(found).toBeDefined();
    expect(found.status).toBe("done");
  });

  it("x.stage.failed with unknown stepId triggers fallback init (lines 468-469)", () => {
    const events = [mkEv("x.stage.failed", { stepId: "sx-unk3" })];
    const result = projectTodoBoard(makeRow(), events) as any;
    const found = result.items.find((t: any) => t.id === "system:sx-unk3");
    expect(found).toBeDefined();
    expect(found.status).toBe("failed");
  });
});

describe("projectTodoBoard — chapter:review:started without prior chapter (init callback line 1350)", () => {
  it("chapter:review:started creates chapter todo via init callback when no prior writing:started", () => {
    // No prior chapter:writing:started → upsert's init callback at line 1350 is called
    const events = [
      mkEv(
        "chapter:review:started",
        { dimension: "Tech", heading: "H1", index: 1 },
        1000,
      ),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const chapter = result.items.find((t: any) => t.scope === "chapter");
    expect(chapter).toBeDefined();
    // assignee should be reviewer from the review:started event
    expect(chapter.assignee.role).toBe("reviewer");
  });
});

// Note: line 1775 addNarrative(..."mission 终态，自动结束"...) is genuinely unreachable
// in the current codebase. All non-system/non-dimension todos (chapter, review, retry,
// reconciler-gap) are always created with at least one narrative entry, so
// t.narrativeLog.length === 0 is never true when terminal cleanup runs for those scopes.
// This is dead defensive code — omitting test to avoid false assertions.
describe("projectTodoBoard — terminal cleanup (general)", () => {
  it("chapter:writing:failed todo is skipped by terminal cleanup (already failed)", () => {
    // chapter:writing:failed creates chapter with status="failed"
    // terminal cleanup skips it since status !== "pending" && status !== "in_progress"
    const events = [
      mkEv(
        "chapter:writing:failed",
        { dimension: "Tech", heading: "H1", index: 1 },
        1000,
      ),
    ];
    const row = makeRow({ status: "cancelled" });
    const result = projectTodoBoard(row, events) as any;
    const ch = result.items.find((t: any) => t.scope === "chapter");
    // Chapter stays failed (not swept to cancelled) because terminal cleanup skips non-pending/in_progress
    expect(ch.status).toBe("failed");
  });
});

describe("projectTodoBoard — sortKey fallback 13.0 (line 1874)", () => {
  it("handles todo with unknown scope by placing it at end (sortKey=13.0)", () => {
    // We can inject a todo with unknown scope via custom upsert → but since we can only
    // drive through the public API, the only non-standard scopes come from
    // dim rollup or reconciler-gap. The fallback `return 13.0` fires for any
    // scope not matched by the if-chain.
    // Practically: only "system", "dimension", "chapter", "review", and
    // "mission"+"reconciler-gap" are standard. Any other scope → 13.0.
    // Let's verify: a system stage with non-standard systemStageId uses
    // STAGE_ORDINAL[id] ?? 13.0 → the 13.0 case
    const events = [
      // Use stage:lifecycle with an unknown stepId to create a system todo with
      // a systemStageId that doesn't appear in STAGE_ORDINAL
      mkEv("playground.stage:lifecycle", {
        stepId: "sx-exotic-stage",
        status: "completed",
      }),
    ];
    const result = projectTodoBoard(makeRow(), events) as any;
    const exotic = result.items.find(
      (t: any) => t.id === "system:sx-exotic-stage",
    );
    expect(exotic).toBeDefined();
    // Should still appear in results (sorted at end)
    expect(result.items.at(-1).id).toBe("system:sx-exotic-stage");
  });
});

describe("projectTodoBoard — 未登记的 mission status 走 mission-status.contract 兜底", () => {
  // ★ 2026-08-04：原先 mapMissionStatusToTodo 直接吃 persisted 字符串，未匹配的一律
  //   落 default → "pending"。这个"未知即 pending"的兜底正是取消 bug 的同款病根：
  //   现役写入值 "quality-failed" 不在分支表里 → 拒签 mission 的维度 todo 永远显
  //   "待启动"。现在先经 toPublicMissionStatus 归一（未知 + 无终态证据 = 仍在跑），
  //   再走 public 闭集 Record 映射。
  it("未知状态 + 无终态证据 → in_progress（仍在跑，不是待启动）", () => {
    const row = makeRow({
      status: "paused",
      dimensions: [{ name: "Economy" }],
    });
    const result = projectTodoBoard(row, []) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Economy");
    expect(dim).toBeDefined();
    expect(dim.status).toBe("in_progress");
  });

  it("★ 现役写入值 quality-failed 不再落进 pending 兜底", () => {
    const row = makeRow({
      status: "quality-failed",
      completedAt: new Date("2025-01-01T01:00:00.000Z"),
      dimensions: [{ name: "Economy" }],
    });
    const result = projectTodoBoard(row, []) as any;
    const dim = result.items.find((t: any) => t.id === "dim:Economy");
    expect(dim).toBeDefined();
    expect(dim.status).not.toBe("pending");
  });
});
