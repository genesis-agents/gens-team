/**
 * chapter-pipeline.helper.spec.ts
 *
 * Unit tests for runChapterPipeline, emitChapterFailedDoneEvent, and emitCacheHitChapters.
 */

// Mock all external dependencies
// Paths relative to THIS spec file (helpers/__tests__/), going up to mission/agents/
jest.mock("../../../agents/writer/chapter-writer.agent", () => ({
  ChapterWriterAgent: class ChapterWriterAgent {},
}));
jest.mock("../../../agents/writer/chapter-reviewer.agent", () => ({
  ChapterReviewerAgent: class ChapterReviewerAgent {},
}));
jest.mock("@/modules/ai-harness/facade", () => ({
  extractTokenSpend: jest.fn().mockReturnValue(0),
  REVIEW_PASS_THRESHOLD: 60,
  REVIEW_REWRITE_FLOOR: 40,
  CHAPTER_MAX_REVISION_ATTEMPTS: 2,
  jaccardSimilarity: jest.fn().mockReturnValue(0),
  restoreGlobalIndices: jest.fn().mockImplementation((body: string) => body),
  scanContentDefects: jest.fn().mockReturnValue({
    bareLatexCount: 0,
    brokenDollarNesting: 0,
    unwrappedEnvironments: 0,
    pseudoCodeLines: 0,
    leakedMetaNotes: 0,
    leakedFigureNotes: 0,
    longListItems: 0,
    trappedConclusions: 0,
  }),
  sanitizeSectionOutput: jest.fn().mockImplementation((body: string) => body),
}));
jest.mock("@/modules/ai-engine/facade", () => ({
  stripChartJsonFromContent: jest
    .fn()
    .mockImplementation((body: string) => body),
}));
jest.mock("../../../artifacts/narrative.util", () => ({
  narrate: jest.fn().mockResolvedValue(undefined),
}));

import {
  runChapterPipeline,
  emitChapterFailedDoneEvent,
  emitCacheHitChapters,
  type OutlineChapter,
  type ChapterPipelineContext,
} from "../chapter-pipeline.helper";
import { jaccardSimilarity } from "@/modules/ai-harness/facade";
// ★ 交付线比例来自 playground 策略旋钮（DEFAULTS → 模型档位 profile → env →
//   DB overlay），spec 读同一个源，避免"测试写死一个数、生产用另一个"。
import { getPlaygroundStrategyThresholds } from "../../../../runtime/playground-strategy-policy";

const MIN_DELIVERY_RATIO =
  getPlaygroundStrategyThresholds().chapterMinDeliveryRatio;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChapter(index = 1): OutlineChapter {
  return {
    index,
    heading: `Chapter ${index}`,
    thesis: `Thesis for chapter ${index}`,
    keyPoints: ["Point A", "Point B"],
    sourceIndices: [0, 1],
  };
}

function makeCtx(
  overrides: Partial<ChapterPipelineContext> = {},
): ChapterPipelineContext {
  return {
    missionId: "m-test",
    userId: "u-test",
    dimensionIdx: 0,
    dimensionName: "Market Analysis",
    topic: "AI Trends",
    language: "zh-CN",
    targetWordsPerChapter: 1000,
    lengthProfile: "standard",
    billing: {} as ChapterPipelineContext["billing"],
    budgetMultiplier: 1.0,
    pool: {} as ChapterPipelineContext["pool"],
    firstUseByChapter: new Map([[1, new Set([0, 1])]]),
    findings: [
      { claim: "Claim A", evidence: "Evidence A", source: "http://a.com" },
      { claim: "Claim B", evidence: "Evidence B", source: "http://b.com" },
    ],
    figureCandidates: [],
    emitChapterFailedDone: jest.fn().mockResolvedValue(undefined),
    store: {
      saveChapterDraft: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChapterPipelineContext["store"],
    ...overrides,
  };
}

function makeWriterResult(
  overrides: Partial<{
    state: string;
    body: string;
    wordCount: number;
    citationsUsed: string[];
    figureReferences: unknown[];
    events: unknown[];
  }> = {},
) {
  return {
    state: overrides.state ?? "completed",
    output: {
      body:
        overrides.body ?? "This is the chapter body content with enough words.",
      wordCount: overrides.wordCount ?? 1000,
      citationsUsed: overrides.citationsUsed ?? ["[1]"],
      figureReferences: overrides.figureReferences ?? [],
    },
    events: overrides.events ?? [],
  };
}

function makeReviewerResult(
  overrides: Partial<{
    state: string;
    decision: "pass" | "revise";
    score: number;
    critique: string;
    summary: string;
    issues: unknown[];
    events: unknown[];
  }> = {},
) {
  return {
    state: overrides.state ?? "completed",
    output: {
      decision: overrides.decision ?? "pass",
      score: overrides.score ?? 80,
      summary: overrides.summary ?? "Good chapter",
      issues: overrides.issues ?? [],
      critique: overrides.critique ?? "Well written",
    },
    events: overrides.events ?? [],
  };
}

function makeDeps(invokeResults: unknown[] = []) {
  let callCount = 0;
  const invoker = {
    invoke: jest.fn().mockImplementation(() => {
      return Promise.resolve(invokeResults[callCount++] ?? makeWriterResult());
    }),
    tickCost: jest.fn().mockResolvedValue(undefined),
  };
  return {
    emit: jest.fn().mockResolvedValue(undefined),
    log: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    invoker,
  } as unknown as Parameters<typeof runChapterPipeline>[3];
}

// ─── runChapterPipeline tests ─────────────────────────────────────────────────

describe("runChapterPipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("happy path — writer passes, reviewer passes", () => {
    it("returns WrittenChapter with correct fields", async () => {
      const writerRes = makeWriterResult({ wordCount: 1000 });
      const reviewerRes = makeReviewerResult({ decision: "pass", score: 85 });
      const deps = makeDeps([writerRes, reviewerRes]);
      const ctx = makeCtx();

      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);

      expect(result).not.toBeNull();
      expect(result!.index).toBe(1);
      expect(result!.heading).toBe("Chapter 1");
      expect(result!.finalized).toBe(true);
      expect(result!.qualified).toBe(true);
      expect(result!.decision).toBe("passed");
      expect(result!.finalScore).toBe(85);
    });

    it("emits chapter:writing:started event", async () => {
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      const writingStarted = (deps.emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "playground.chapter:writing:started",
      );
      expect(writingStarted).toBeDefined();
    });

    it("emits chapter:writing:completed event", async () => {
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      const writingCompleted = (deps.emit as jest.Mock).mock.calls.find(
        (c) =>
          c[0].type === "playground.chapter:writing:completed" &&
          c[0].payload.state === "completed",
      );
      expect(writingCompleted).toBeDefined();
    });

    it("emits chapter:review:started event", async () => {
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      const reviewStarted = (deps.emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "playground.chapter:review:started",
      );
      expect(reviewStarted).toBeDefined();
    });

    it("emits chapter:review:completed event", async () => {
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      const reviewCompleted = (deps.emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "playground.chapter:review:completed",
      );
      expect(reviewCompleted).toBeDefined();
    });

    it("emits chapter:done event with qualified=true", async () => {
      const deps = makeDeps([
        makeWriterResult(),
        makeReviewerResult({ decision: "pass", score: 85 }),
      ]);
      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      const doneCalled = (deps.emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "playground.chapter:done",
      );
      expect(doneCalled).toBeDefined();
      expect(doneCalled[0].payload.qualified).toBe(true);
    });

    it("calls store.saveChapterDraft after success", async () => {
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      const ctx = makeCtx();
      await runChapterPipeline(makeChapter(1), [], ctx, deps);
      expect(ctx.store.saveChapterDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId: "m-test",
          dimension: "Market Analysis",
          chapterIndex: 1,
        }),
      );
    });

    it("passes previousCritique to writer on second attempt", async () => {
      // First attempt: reviewer says revise, second attempt: reviewer passes
      const writerRes1 = makeWriterResult({ wordCount: 1000 });
      const reviewerRes1 = makeReviewerResult({
        decision: "revise",
        score: 50,
        critique: "Needs more detail",
      });
      const writerRes2 = makeWriterResult({ wordCount: 1000 });
      const reviewerRes2 = makeReviewerResult({ decision: "pass", score: 80 });
      const deps = makeDeps([
        writerRes1,
        reviewerRes1,
        writerRes2,
        reviewerRes2,
      ]);

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);

      // Second invoke call (index 2) should have previousCritique set
      const secondWriterCall = (deps.invoker.invoke as jest.Mock).mock.calls[2];
      expect(secondWriterCall[1].previousCritique).toBeDefined();
    });

    it("figureReferences propagated from writer output", async () => {
      const figureReferences = [
        { figureId: "FIG-1", anchorParagraph: 2, caption: "Test fig" },
      ];
      const writerRes = makeWriterResult({ figureReferences });
      const reviewerRes = makeReviewerResult({ decision: "pass", score: 90 });
      const deps = makeDeps([writerRes, reviewerRes]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );
      expect(result!.figureReferences).toEqual(figureReferences);
    });

    it("figureCandidates passed to writer invoke as availableFigures", async () => {
      const ctx = makeCtx({
        figureCandidates: [
          {
            sourceUrl: "http://fig.com/1.png",
            imageUrl: "http://img.com/1.png",
            caption: "Fig caption",
            relevanceHint: "high",
          },
        ],
      });
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      await runChapterPipeline(makeChapter(1), [], ctx, deps);
      const writerCall = (deps.invoker.invoke as jest.Mock).mock.calls[0][1];
      expect(writerCall.availableFigures).toHaveLength(1);
      expect(writerCall.availableFigures[0].figureId).toBe("FIG-1");
    });
  });

  describe("writer failure paths", () => {
    it("writer state=failed → returns null", async () => {
      const failedWriter = { state: "failed", output: null, events: [] };
      const deps = makeDeps([failedWriter]);
      const ctx = makeCtx();

      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);

      expect(result).toBeNull();
      expect(ctx.emitChapterFailedDone).toHaveBeenCalledWith(
        1,
        "writer-failed",
        0,
      );
    });

    it("writer state=cancelled (no output) → returns null", async () => {
      const cancelledWriter = {
        state: "cancelled",
        output: undefined,
        events: [],
      };
      const deps = makeDeps([cancelledWriter]);
      const ctx = makeCtx();

      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);

      expect(result).toBeNull();
    });

    it("writer failed → emits chapter:writing:completed with state=failed", async () => {
      const failedWriter = { state: "failed", output: null, events: [] };
      const deps = makeDeps([failedWriter]);

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);

      const completedFailed = (deps.emit as jest.Mock).mock.calls.find(
        (c) =>
          c[0].type === "playground.chapter:writing:completed" &&
          c[0].payload.state === "failed",
      );
      expect(completedFailed).toBeDefined();
    });

    it("emit chapter:writing:started failure is swallowed (only warns)", async () => {
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      (deps.emit as jest.Mock).mockImplementation(
        async (event: { type: string }) => {
          if (event.type === "playground.chapter:writing:started") {
            throw new Error("emit failed");
          }
          return undefined;
        },
      );

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      // Should not throw; emit failure is caught
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("emit chapter:writing:started"),
      );
      // Writer invoke still proceeds
      expect(deps.invoker.invoke as jest.Mock).toHaveBeenCalled();
    });

    it("emit chapter:writing:completed (failed) failure is swallowed", async () => {
      let invokeCalled = false;
      const deps = makeDeps([{ state: "failed", output: null, events: [] }]);
      (deps.emit as jest.Mock).mockImplementation(
        async (event: { type: string; payload?: { state?: string } }) => {
          if (
            event.type === "playground.chapter:writing:completed" &&
            event.payload?.state === "failed" &&
            !invokeCalled
          ) {
            invokeCalled = true;
            throw new Error("emit failed");
          }
          return undefined;
        },
      );

      const ctx = makeCtx();
      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);
      expect(result).toBeNull();
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("emit chapter:writing:completed (failed)"),
      );
    });
  });

  describe("reviewer fallback paths", () => {
    it("reviewer state=failed → treated as revise (score=40)", async () => {
      const failedReviewer = { state: "failed", output: null, events: [] };
      // After 2 MAX_REVISION_ATTEMPTS + 1 = 3 loops total but CHAPTER_MAX_REVISION_ATTEMPTS=2
      // first attempt: revise, second: revise (cap), third would exit
      // Actually with MAX_REVISION_ATTEMPTS=2 and reviewer always failing:
      // attempt 1: write OK, review fails → revise (consecutiveFailures=1)
      // attempt 2: write OK, review fails → reviewerExhausted (consecutiveFailures=2 >= 2)
      //   → exit loop with fallback-exhausted
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        failedReviewer,
        makeWriterResult({ wordCount: 1000 }),
        failedReviewer,
      ]);
      const ctx = makeCtx();

      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);

      expect(result).not.toBeNull();
      expect(result!.decision).toBe("fallback-exhausted");
    });

    it("reviewer output null (success state) → fallback verdict used", async () => {
      // Reviewer returns completed but no output = treated as failure
      const badReviewer = { state: "completed", output: null, events: [] };
      const deps = makeDeps([
        makeWriterResult(),
        badReviewer,
        makeWriterResult(),
        badReviewer,
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );

      // Both reviewer calls fail consecutively → reviewerExhausted → fallback-exhausted
      expect(result).not.toBeNull();
      expect(result!.decision).toBe("fallback-exhausted");
    });

    it("emit chapter:review:started failure is swallowed (warns)", async () => {
      let reviewStartedEmitted = false;
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      (deps.emit as jest.Mock).mockImplementation(
        async (event: { type: string }) => {
          if (
            event.type === "playground.chapter:review:started" &&
            !reviewStartedEmitted
          ) {
            reviewStartedEmitted = true;
            throw new Error("review:started emit failed");
          }
          return undefined;
        },
      );

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("emit chapter:review:started"),
      );
    });

    it("emit chapter:review:completed failure is swallowed (warns)", async () => {
      let reviewCompletedEmitted = false;
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      (deps.emit as jest.Mock).mockImplementation(
        async (event: { type: string }) => {
          if (
            event.type === "playground.chapter:review:completed" &&
            !reviewCompletedEmitted
          ) {
            reviewCompletedEmitted = true;
            throw new Error("review:completed emit failed");
          }
          return undefined;
        },
      );

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("emit chapter:review:completed"),
      );
    });

    it("emit chapter:done failure is swallowed (warns)", async () => {
      let doneCalled = false;
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);
      (deps.emit as jest.Mock).mockImplementation(
        async (event: { type: string }) => {
          if (event.type === "playground.chapter:done" && !doneCalled) {
            doneCalled = true;
            throw new Error("chapter:done emit failed");
          }
          return undefined;
        },
      );

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("emit chapter:done"),
      );
      // Still returns a result (emit failure is non-fatal)
      expect(result).not.toBeNull();
    });

    it("reviewer consecutive failure cap triggers fallback-exhausted", async () => {
      // CHAPTER_MAX_REVISION_ATTEMPTS=2, MAX_REVIEWER_FAILURES=2
      // attempt 1: write OK, review fails (consecutiveFailures=1)
      // attempt 2: write OK, review fails (consecutiveFailures=2 >= 2 → reviewerExhausted=true)
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        { state: "failed", output: null, events: [] },
        makeWriterResult({ wordCount: 1000 }),
        { state: "failed", output: null, events: [] },
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );

      expect(result).not.toBeNull();
      expect(result!.decision).toBe("fallback-exhausted");
      expect(result!.qualified).toBe(false);
    });
  });

  describe("score threshold and fallback decision logic", () => {
    it("reviewer score >= PASS_THRESHOLD (60) → decision=passed even if decision=revise", async () => {
      // score=60 >= PASS_THRESHOLD=60 → pass (by score)
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 60 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );

      expect(result!.decision).toBe("passed");
    });

    it("review score < dynamicThreshold on last attempt → fallback-length", async () => {
      // attempt 1: score=45 → below threshold (60) → continue
      // attempt 2: score=45 → below threshold (50 for attempt 2) → still below
      // attempt 3 (MAX_REVISION_ATTEMPTS+1=3): exits with fallback-length
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );

      expect(result).not.toBeNull();
      // after all attempts exhausted → fallback-length
      expect(result!.decision).toBe("fallback-length");
      expect(result!.qualified).toBe(false);
    });

    it("review score >= dynamicThreshold → decides passed", async () => {
      // attempt 1: score=80 → dynamicThreshold = max(40, 60-0*10)=60 → 80>60 → pass
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 80 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );

      expect(result!.decision).toBe("passed");
    });

    it("fallback-length narrates a warning", async () => {
      // Make all attempts fail with low scores to trigger fallback-length
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
      ]);

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      // chapterDecision !== "passed" → narrate warning called
      // narrate is mocked and called
      const { narrate } = require("../../../artifacts/narrative.util");
      expect(narrate).toHaveBeenCalled();
    });
  });

  describe("word count length fail path", () => {
    // ★ 2026-08-03 回归（用户实证：多章精确落在 612 字 = round(target × 0.7)）：
    //   判定线此前内联 0.4，意味着"交付 70% 目标字数"被系统判为合格，而 writer
    //   提示词恰好把 0.7× 写成建议下限 —— 模型精确贴着系统认可的地板写。
    //   现在交付线由 pipeline 一次算出，writer/reviewer/闸门/记账共用同一个值。
    it("★ 事故复现：0.7× 目标字数（612/874 那种）现在会被判欠交付并打回", async () => {
      const target = 1000;
      const belowLine = Math.round(target * 0.7); // 700，旧判定线 400 之上 → 旧代码放行
      expect(belowLine).toBeGreaterThan(Math.round(target * 0.4));
      expect(belowLine).toBeLessThan(Math.round(target * MIN_DELIVERY_RATIO));

      const deps = makeDeps([
        makeWriterResult({ wordCount: belowLine }),
        makeReviewerResult({ decision: "pass", score: 90 }), // 质量满分也不放行
        makeWriterResult({ wordCount: target }),
        makeReviewerResult({ decision: "pass", score: 90 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx({ targetWordsPerChapter: target }),
        deps,
      );

      // 第 2 次 writer 调用存在 == 第一稿被打回了（旧代码只会调 1 次 writer）
      const writerCalls = (deps.invoker.invoke as jest.Mock).mock.calls;
      expect(writerCalls.length).toBeGreaterThanOrEqual(3);
      expect(result!.wordCount).toBe(target);
    });

    it("打回话术给的重写目标不得低于判定线（否则又是一个更省力的锚）", async () => {
      const target = 1000;
      const rewriteLine = Math.round(target * MIN_DELIVERY_RATIO);
      const deps = makeDeps([
        makeWriterResult({ wordCount: 300 }),
        makeReviewerResult({ decision: "pass", score: 90 }),
        makeWriterResult({ wordCount: target }),
        makeReviewerResult({ decision: "pass", score: 90 }),
      ]);

      await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx({ targetWordsPerChapter: target }),
        deps,
      );

      const critique = (deps.invoker.invoke as jest.Mock).mock.calls[2][1]
        .previousCritique as string;
      expect(critique).toContain(String(rewriteLine)); // 判定线要如实告知
      expect(critique).toContain(String(target)); // 重写目标 = 目标本身
      // 旧话术："< 40%" + "目标 600 字以上即可"（比判定线还低）
      expect(critique).not.toContain("40%");
      expect(critique).not.toContain(String(Math.round(target * 0.6)));
    });

    it("★ 交付线下传给 writer 与 reviewer（两处印的是同一个值，不是各算各的）", async () => {
      const target = 1000;
      const expected = Math.round(target * MIN_DELIVERY_RATIO);
      const deps = makeDeps([
        makeWriterResult({ wordCount: target }),
        makeReviewerResult({ decision: "pass", score: 90 }),
      ]);

      await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx({ targetWordsPerChapter: target }),
        deps,
      );

      const calls = (deps.invoker.invoke as jest.Mock).mock.calls;
      expect(calls[0][1].minDeliveryWords).toBe(expected); // writer
      expect(calls[1][1].chapter.minDeliveryWords).toBe(expected); // reviewer
    });

    it("★ 记账诚实：终局仍欠交付 → 即使 reviewer 给 90 分也不记 passed", async () => {
      const target = 1000;
      const short = Math.round(target * MIN_DELIVERY_RATIO) - 1;
      // 每一轮都欠交付；最后一轮不再打回（attempt 用尽）但必须如实记账
      const deps = makeDeps([
        makeWriterResult({ wordCount: short }),
        makeReviewerResult({ decision: "pass", score: 90 }),
        makeWriterResult({ wordCount: short }),
        makeReviewerResult({ decision: "pass", score: 90 }),
        makeWriterResult({ wordCount: short }),
        makeReviewerResult({ decision: "pass", score: 90 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx({ targetWordsPerChapter: target }),
        deps,
      );

      expect(result).not.toBeNull();
      // 修复前：verdict.score 90 ≥ PASS_THRESHOLD → passed / qualified=true，
      //         30% 的欠交付对上游（维度评分、mission 报表）完全隐身
      expect(result!.decision).toBe("fallback-length");
      expect(result!.qualified).toBe(false);
    });

    it("达到交付线则照常按质量分记 passed（不误伤）", async () => {
      const target = 1000;
      const ok = Math.round(target * MIN_DELIVERY_RATIO);
      const deps = makeDeps([
        makeWriterResult({ wordCount: ok }),
        makeReviewerResult({ decision: "pass", score: 90 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx({ targetWordsPerChapter: target }),
        deps,
      );

      expect(result!.decision).toBe("passed");
      expect(result!.qualified).toBe(true);
    });

    it("wordCount < 40% of target on attempt < max → continues (length fail)", async () => {
      // targetWordsPerChapter=1000, 40% = 400; wordCount=100 < 400 → length fail, continue
      const deps = makeDeps([
        makeWriterResult({ wordCount: 100 }),
        makeReviewerResult({ decision: "revise", score: 80 }), // score OK but length fail → continue
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "pass", score: 80 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );

      // Should succeed on second attempt
      expect(result).not.toBeNull();
      expect(result!.decision).toBe("passed");
      // lengthCritiquePrefix should be included in lastCritique
    });

    it("emit chapter:revision failure is swallowed", async () => {
      let revisionEmitted = false;
      const deps = makeDeps([
        makeWriterResult({ wordCount: 100 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "pass", score: 80 }),
      ]);
      (deps.emit as jest.Mock).mockImplementation(
        async (event: { type: string }) => {
          if (
            event.type === "playground.chapter:revision" &&
            !revisionEmitted
          ) {
            revisionEmitted = true;
            throw new Error("revision emit failed");
          }
          return undefined;
        },
      );

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("emit chapter:revision"),
      );
    });
  });

  describe("stuck-revision guard", () => {
    it("stuckCount >= MAX_STUCK_COUNT (2) → exits early with result", async () => {
      // Make jaccardSimilarity return > 0.9 to trigger stuck detection
      (jaccardSimilarity as jest.Mock).mockReturnValue(0.95);

      // attempt 1: write → review (revise, score 45)
      // attempt 2: write → jaccardSim = 0.95 → stuckCount=1, review (revise)
      // attempt 3: write → jaccardSim = 0.95 → stuckCount=2 >= 2 → exits
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
        makeWriterResult({ wordCount: 1000 }),
        makeReviewerResult({ decision: "revise", score: 45 }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );

      // Exits with fallback (stuckRevision or attempts exhausted)
      expect(result).not.toBeNull();
      // Reset for other tests
      (jaccardSimilarity as jest.Mock).mockReturnValue(0);
    });
  });

  describe("RTK dedup logic", () => {
    it("source not in firstUseByChapter.get → deduplicated with brief hint", async () => {
      // chapter.index=2 not in firstUseByChapter (only has 1) → all sources are deduplicated
      const ctx = makeCtx({
        firstUseByChapter: new Map([[1, new Set([0])]]), // Chapter 2 not in map
      });
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);

      const result = await runChapterPipeline(
        makeChapter(2), // chapter index 2 not in firstUseByChapter
        [],
        ctx,
        deps,
      );

      // Should still work, sources are deduped but chapter runs
      expect(result).not.toBeNull();
    });

    it("null finding in sourceIndices → filtered out", async () => {
      const ctx = makeCtx({
        findings: [null as never], // null finding at index 0
        firstUseByChapter: new Map([[1, new Set([0])]]),
      });
      const chapter = { ...makeChapter(1), sourceIndices: [0] };
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);

      const result = await runChapterPipeline(chapter, [], ctx, deps);
      expect(result).not.toBeNull(); // null finding filtered, continues
    });
  });

  describe("store.saveChapterDraft", () => {
    it("saveChapterDraft failure is swallowed (warns)", async () => {
      const ctx = makeCtx({
        store: {
          saveChapterDraft: jest.fn().mockRejectedValue(new Error("DB error")),
        } as unknown as ChapterPipelineContext["store"],
      });
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);

      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);
      expect(result).not.toBeNull();
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("saveChapterDraft failed"),
      );
    });

    it("store missing saveChapterDraft → skips saving", async () => {
      const ctx = makeCtx({
        store: {} as ChapterPipelineContext["store"],
      });
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);

      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);
      expect(result).not.toBeNull();
    });

    it("no store at all → skips saving", async () => {
      const ctx = makeCtx({
        store: undefined as unknown as ChapterPipelineContext["store"],
      });
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);

      const result = await runChapterPipeline(makeChapter(1), [], ctx, deps);
      expect(result).not.toBeNull();
    });
  });

  describe("reviewer output with critique-only (no issues array)", () => {
    it("critique-only reviewer → builds issues from critique text", async () => {
      const deps = makeDeps([
        makeWriterResult(),
        makeReviewerResult({
          decision: "pass",
          score: 80,
          issues: [],
          critique: "Good overall",
        }),
      ]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );
      expect(result).not.toBeNull();
      // review:completed payload should have issues built from critique
      const reviewCompleted = (deps.emit as jest.Mock).mock.calls.find(
        (c) => c[0].type === "playground.chapter:review:completed",
      );
      expect(reviewCompleted).toBeDefined();
      expect(reviewCompleted[0].payload.issues).toBeDefined();
    });

    it("no critique no issues → empty issues array", async () => {
      const reviewerRes = {
        state: "completed",
        output: {
          decision: "pass" as const,
          score: 80,
          summary: "OK",
          issues: [],
          critique: undefined,
        },
        events: [],
      };
      const deps = makeDeps([makeWriterResult(), reviewerRes]);

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );
      expect(result).not.toBeNull();
    });
  });

  describe("reviewerFallback narrate tag", () => {
    it("reviewer fallback state → narrate uses warning tag", async () => {
      // reviewer failed → isReviewerFallback=true → narrate with warning
      const deps = makeDeps([
        makeWriterResult({ wordCount: 1000 }),
        { state: "failed", output: null, events: [] },
        makeWriterResult({ wordCount: 1000 }),
        { state: "failed", output: null, events: [] },
      ]);

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);
      const { narrate } = require("../../../artifacts/narrative.util");
      const narrateCalls = (narrate as jest.Mock).mock.calls;
      // narrate is called with (emit, missionId, userId, {tag, ...})
      const reviewerNarrate = narrateCalls.find(
        (c: unknown[]) =>
          typeof c[3] === "object" &&
          (c[3] as { role: string }).role === "reviewer",
      );
      expect(reviewerNarrate).toBeDefined();
    });
  });

  describe("tickCost called for writer and reviewer", () => {
    it("calls tickCost twice (once for writer, once for reviewer)", async () => {
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);

      expect(deps.invoker.tickCost as jest.Mock).toHaveBeenCalledTimes(2);
    });
  });

  describe("emit chapter:writing:completed (success) failure is swallowed", () => {
    it("warns when chapter:writing:completed (success) emit fails", async () => {
      // This covers line 342 - the .catch on the success writing:completed emit
      let writingCompletedCalled = false;
      const deps = makeDeps([
        makeWriterResult(),
        makeReviewerResult({ decision: "pass", score: 80 }),
      ]);
      (deps.emit as jest.Mock).mockImplementation(
        async (event: { type: string; payload?: { state?: string } }) => {
          if (
            event.type === "playground.chapter:writing:completed" &&
            event.payload?.state === "completed" &&
            !writingCompletedCalled
          ) {
            writingCompletedCalled = true;
            throw new Error("writing:completed success emit failed");
          }
          return undefined;
        },
      );

      const result = await runChapterPipeline(
        makeChapter(1),
        [],
        makeCtx(),
        deps,
      );
      expect(deps.log.warn as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining("emit chapter:writing:completed for"),
      );
      // Should still produce a result
      expect(result).not.toBeNull();
    });
  });

  describe("defect scan path", () => {
    it("defects > 0 → includes defectScan in writing:completed payload", async () => {
      const { scanContentDefects } = require("@/modules/ai-harness/facade");
      (scanContentDefects as jest.Mock).mockReturnValueOnce({
        bareLatexCount: 2,
        brokenDollarNesting: 1,
        unwrappedEnvironments: 0,
        pseudoCodeLines: 0,
        leakedMetaNotes: 0,
        leakedFigureNotes: 0,
        longListItems: 0,
        trappedConclusions: 0,
      });
      const deps = makeDeps([makeWriterResult(), makeReviewerResult()]);

      await runChapterPipeline(makeChapter(1), [], makeCtx(), deps);

      const writingCompleted = (deps.emit as jest.Mock).mock.calls.find(
        (c) =>
          c[0].type === "playground.chapter:writing:completed" &&
          c[0].payload.state === "completed",
      );
      expect(writingCompleted[0].payload.defectScan).toBeDefined();
      expect(writingCompleted[0].payload.defectScan.total).toBe(3);
    });
  });
});

// ─── emitChapterFailedDoneEvent tests ─────────────────────────────────────────

describe("emitChapterFailedDoneEvent", () => {
  it("emits playground.chapter:done with fallback-exhausted decision", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const log = {
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const deps = { emit, log } as unknown as Parameters<
      typeof emitChapterFailedDoneEvent
    >[0];

    await emitChapterFailedDoneEvent(deps, {
      missionId: "m1",
      userId: "u1",
      dimensionIdx: 0,
      dimensionName: "Market",
      chapterIndex: 2,
      failedAttempt: 3,
      reason: "writer-failed",
      wordCount: 0,
      targetWordCount: 1000,
      finalScore: 0,
    });

    const chapterDone = emit.mock.calls.find(
      (c) => c[0].type === "playground.chapter:done",
    );
    expect(chapterDone).toBeDefined();
    expect(chapterDone[0].payload.decision).toBe("fallback-exhausted");
    expect(chapterDone[0].payload.finalized).toBe(true);
    expect(chapterDone[0].payload.qualified).toBe(false);
  });

  it("uses finalScore from args (non-zero for real scores)", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const log = {
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const deps = { emit, log } as unknown as Parameters<
      typeof emitChapterFailedDoneEvent
    >[0];

    await emitChapterFailedDoneEvent(deps, {
      missionId: "m1",
      userId: "u1",
      dimensionIdx: 0,
      dimensionName: "Market",
      chapterIndex: 1,
      failedAttempt: 2,
      reason: "loop-exhausted",
      wordCount: 500,
      targetWordCount: 1000,
      finalScore: 55,
    });

    const chapterDone = emit.mock.calls.find(
      (c) => c[0].type === "playground.chapter:done",
    );
    expect(chapterDone[0].payload.finalScore).toBe(55);
    expect(chapterDone[0].payload.wordCount).toBe(500);
  });

  it("defaults finalScore to 0 when not provided", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const log = {
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const deps = { emit, log } as unknown as Parameters<
      typeof emitChapterFailedDoneEvent
    >[0];

    await emitChapterFailedDoneEvent(deps, {
      missionId: "m1",
      userId: "u1",
      dimensionIdx: 0,
      dimensionName: "Market",
      chapterIndex: 1,
      failedAttempt: 1,
      reason: "writer-failed",
      wordCount: 0,
      targetWordCount: 1000,
      // finalScore omitted → defaults to 0
    });

    const chapterDone = emit.mock.calls.find(
      (c) => c[0].type === "playground.chapter:done",
    );
    expect(chapterDone[0].payload.finalScore).toBe(0);
  });

  it("emit failure is swallowed (warns)", async () => {
    const emit = jest.fn().mockRejectedValue(new Error("emit error"));
    const log = {
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const deps = { emit, log } as unknown as Parameters<
      typeof emitChapterFailedDoneEvent
    >[0];

    await expect(
      emitChapterFailedDoneEvent(deps, {
        missionId: "m1",
        userId: "u1",
        dimensionIdx: 0,
        dimensionName: "Market",
        chapterIndex: 1,
        failedAttempt: 1,
        reason: "writer-failed",
        wordCount: 0,
        targetWordCount: 1000,
      }),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("failed-finalized"),
    );
  });

  it("includes dimension and chapterIndex in payload", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const log = {
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const deps = { emit, log } as unknown as Parameters<
      typeof emitChapterFailedDoneEvent
    >[0];

    await emitChapterFailedDoneEvent(deps, {
      missionId: "m1",
      userId: "u1",
      dimensionIdx: 1,
      dimensionName: "Tech Trends",
      chapterIndex: 3,
      failedAttempt: 2,
      reason: "loop-exhausted",
      wordCount: 100,
      targetWordCount: 1000,
    });

    const chapterDone = emit.mock.calls.find(
      (c) => c[0].type === "playground.chapter:done",
    );
    expect(chapterDone[0].payload.dimension).toBe("Tech Trends");
    expect(chapterDone[0].payload.chapterIndex).toBe(3);
  });
});

// ─── emitCacheHitChapters tests ───────────────────────────────────────────────

describe("emitCacheHitChapters", () => {
  const mockChapters = [
    {
      index: 1,
      heading: "Chapter 1",
      thesis: "Thesis 1",
      wordCount: 1000,
      finalScore: 85,
    },
    {
      index: 2,
      heading: "Chapter 2",
      thesis: "Thesis 2",
      wordCount: 900,
      finalScore: 78,
    },
  ];

  it("emits dimension:outline:planned with fromCache=true", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const log = { warn: jest.fn() };

    await emitCacheHitChapters(
      emit,
      "m1",
      "u1",
      "Market",
      0,
      mockChapters,
      log,
    );

    const outlinePlanned = emit.mock.calls.find(
      (c) => c[0].type === "playground.dimension:outline:planned",
    );
    expect(outlinePlanned).toBeDefined();
    expect(outlinePlanned[0].payload.fromCache).toBe(true);
    expect(outlinePlanned[0].payload.chapters).toHaveLength(2);
  });

  it("emits chapter:writing:started for each chapter", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    await emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters);

    const writingStarted = emit.mock.calls.filter(
      (c) => c[0].type === "playground.chapter:writing:started",
    );
    expect(writingStarted).toHaveLength(2);
    expect(writingStarted[0][0].payload.fromCache).toBe(true);
  });

  it("emits chapter:writing:completed for each chapter", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    await emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters);

    const writingCompleted = emit.mock.calls.filter(
      (c) => c[0].type === "playground.chapter:writing:completed",
    );
    expect(writingCompleted).toHaveLength(2);
  });

  it("emits chapter:review:completed with decision=pass for each chapter", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    await emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters);

    const reviewCompleted = emit.mock.calls.filter(
      (c) => c[0].type === "playground.chapter:review:completed",
    );
    expect(reviewCompleted).toHaveLength(2);
    expect(reviewCompleted[0][0].payload.decision).toBe("pass");
    expect(reviewCompleted[0][0].payload.fromCache).toBe(true);
  });

  it("emits chapter:done with qualified=true and decision=passed for each chapter", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    await emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters);

    const chapterDone = emit.mock.calls.filter(
      (c) => c[0].type === "playground.chapter:done",
    );
    expect(chapterDone).toHaveLength(2);
    expect(chapterDone[0][0].payload.qualified).toBe(true);
    expect(chapterDone[0][0].payload.decision).toBe("passed");
    expect(chapterDone[0][0].payload.fromCache).toBe(true);
  });

  it("uses chapter finalScore in done payload", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    await emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters);

    const chapterDone = emit.mock.calls.filter(
      (c) => c[0].type === "playground.chapter:done",
    );
    expect(chapterDone[0][0].payload.finalScore).toBe(85);
    expect(chapterDone[1][0].payload.finalScore).toBe(78);
  });

  it("outline:planned emit failure is swallowed", async () => {
    let outlineCalled = false;
    const emit = jest
      .fn()
      .mockImplementation(async (event: { type: string }) => {
        if (
          event.type === "playground.dimension:outline:planned" &&
          !outlineCalled
        ) {
          outlineCalled = true;
          throw new Error("outline emit failed");
        }
        return undefined;
      });
    const log = { warn: jest.fn() };

    await expect(
      emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters, log),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("emit outline:planned failed"),
    );
  });

  it("chapter:writing:started emit failure is swallowed", async () => {
    let writingStartedCalled = false;
    const emit = jest
      .fn()
      .mockImplementation(async (event: { type: string }) => {
        if (
          event.type === "playground.chapter:writing:started" &&
          !writingStartedCalled
        ) {
          writingStartedCalled = true;
          throw new Error("writing:started emit failed");
        }
        return undefined;
      });
    const log = { warn: jest.fn() };

    await expect(
      emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters, log),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("emit chapter:writing:started failed"),
    );
  });

  it("chapter:writing:completed emit failure is swallowed", async () => {
    let writingCompletedCalled = false;
    const emit = jest
      .fn()
      .mockImplementation(async (event: { type: string }) => {
        if (
          event.type === "playground.chapter:writing:completed" &&
          !writingCompletedCalled
        ) {
          writingCompletedCalled = true;
          throw new Error("writing:completed emit failed");
        }
        return undefined;
      });
    const log = { warn: jest.fn() };

    await expect(
      emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters, log),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("emit chapter:writing:completed failed"),
    );
  });

  it("chapter:review:completed emit failure is swallowed", async () => {
    let reviewCompletedCalled = false;
    const emit = jest
      .fn()
      .mockImplementation(async (event: { type: string }) => {
        if (
          event.type === "playground.chapter:review:completed" &&
          !reviewCompletedCalled
        ) {
          reviewCompletedCalled = true;
          throw new Error("review:completed emit failed");
        }
        return undefined;
      });
    const log = { warn: jest.fn() };

    await expect(
      emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters, log),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("emit chapter:review:completed failed"),
    );
  });

  it("chapter:done emit failure is swallowed", async () => {
    let doneCalled = false;
    const emit = jest
      .fn()
      .mockImplementation(async (event: { type: string }) => {
        if (event.type === "playground.chapter:done" && !doneCalled) {
          doneCalled = true;
          throw new Error("chapter:done emit failed");
        }
        return undefined;
      });
    const log = { warn: jest.fn() };

    await expect(
      emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters, log),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("emit chapter:done failed"),
    );
  });

  it("works with empty chapters array", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    await expect(
      emitCacheHitChapters(emit, "m1", "u1", "Market", 0, []),
    ).resolves.toBeUndefined();
    // Only outline:planned emitted
    const outlinePlanned = emit.mock.calls.filter(
      (c) => c[0].type === "playground.dimension:outline:planned",
    );
    expect(outlinePlanned).toHaveLength(1);
  });

  it("chapter:writing:completed includes wordCount", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    await emitCacheHitChapters(emit, "m1", "u1", "Market", 0, [
      { index: 1, heading: "Ch 1", wordCount: 1500, finalScore: 90 },
    ]);

    const writingCompleted = emit.mock.calls.find(
      (c) => c[0].type === "playground.chapter:writing:completed",
    );
    expect(writingCompleted[0].payload.wordCount).toBe(1500);
  });

  it("works without log parameter", async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    // Swallows emit errors silently when no log is provided
    await expect(
      emitCacheHitChapters(emit, "m1", "u1", "Market", 0, mockChapters),
    ).resolves.toBeUndefined();
  });
});
