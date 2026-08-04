/**
 * mission-view.status-projection.spec.ts
 *
 * ★ 2026-08-04 生产事故回归（Screenshot_46「点取消，始终无效」）。
 *
 * 为什么已有的 playground-quality-failed fixture 没拦住：
 *   该 fixture 的 mission-row.json 存的是 **legacy** 值 `"rejected"`，而
 *   mission-lifecycle.helper.buildFailedUpdate 现役写入的是 `"quality-failed"`。
 *   projector 恰好只有 rejected 分支 → fixture 常绿、生产常坏。
 *   本 spec 按**现役写入值**逐一投影，堵掉这个盲区。
 *
 * 锁死的用户可见契约：终态 mission 的 canCancel 必须为 false —— 否则前端取消按钮
 * 常亮，点击必被 cancel 端点以 400 "status is X, not running" 顶回，用户侧表现为
 * 「点取消，始终无效」的死循环。
 */

import type { MissionDetail } from "../../lifecycle/mission-store.service";
import type { MissionQueryInputs } from "../../query/mission-query.service";
import { projectMissionView } from "../mission-view.projector";

function makeRow(overrides: Partial<MissionDetail> = {}): MissionDetail {
  return {
    id: "m-status-0001",
    userId: "u1",
    topic: "status projection",
    depth: "deep",
    language: "zh-CN",
    status: "running",
    startedAt: new Date("2026-08-04T01:00:00Z"),
    completedAt: null,
    elapsedWallTimeMs: null,
    finalScore: null,
    tokensUsed: null,
    costUsd: null,
    reportTitle: null,
    reportSummary: null,
    errorMessage: null,
    terminalOutcome: null,
    failureCode: null,
    configSnapshot: null,
    maxCredits: 12000,
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
    lastCompletedStage: null,
    outlinePlan: null,
    analystOutput: null,
    heartbeatAt: null,
    visibility: "PRIVATE",
    ...overrides,
  } as unknown as MissionDetail;
}

function project(row: MissionDetail) {
  const inputs: MissionQueryInputs = {
    mode: "row-loaded",
    missionId: row.id,
    row,
    events: [],
    resume: { resumable: false, reason: "n/a" },
    rerunnableStages: [],
    reportVersions: [],
    composedArtifact: {
      kind: "empty-artifact",
      reason: "not-yet-materialized",
    },
  };
  return projectMissionView(inputs).mission;
}

describe("canonical view — persisted status 投影（现役写入值）", () => {
  it.each([
    // [persisted, publicStatus, canCancel]
    ["running", "running", true],
    ["completed", "completed", false],
    ["failed", "failed", false],
    ["cancelled", "cancelled", false],
    // ★ 事故值：现役写入拼写
    ["quality-failed", "quality-failed", false],
    // legacy 拼写仍需兼容（老行还在库里）
    ["rejected", "quality-failed", false],
  ])("%s → status=%s canCancel=%s", (persisted, expected, canCancel) => {
    const m = project(
      makeRow({
        status: persisted,
        completedAt: persisted === "running" ? null : new Date(),
      }),
    );
    expect(m.status).toBe(expected);
    expect(m.canCancel).toBe(canCancel);
  });

  it("★ 事故核心：quality-failed 的 mission 不得对外报 running / canCancel", () => {
    // 恢复旧 resolvePublicStatus（无 quality-failed 分支 → 兜底 return "running"）
    // 时，这两条断言都会红。
    const m = project(
      makeRow({ status: "quality-failed", completedAt: new Date() }),
    );
    expect(m.status).not.toBe("running");
    expect(m.canCancel).toBe(false);
  });

  it("未知状态 + 有终态证据 → 不报 running、不给取消按钮", () => {
    const m = project(
      makeRow({ status: "some-future-status", completedAt: new Date() }),
    );
    expect(m.status).not.toBe("running");
    expect(m.canCancel).toBe(false);
  });

  it("未知状态 + 无终态证据 → 仍算运行中，允许取消", () => {
    const m = project(makeRow({ status: "some-future-status" }));
    expect(m.status).toBe("running");
    expect(m.canCancel).toBe(true);
  });
});
