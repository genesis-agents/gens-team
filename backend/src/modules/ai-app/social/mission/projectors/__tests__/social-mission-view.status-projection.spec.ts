/**
 * social-mission-view.status-projection.spec.ts
 *
 * ★ 2026-08-04：与 playground Screenshot_46「点取消，始终无效」同款病根。
 *
 *   social-mission-store.markCancelled 写入的是 "cancelled"，而 projector 的
 *   resolvePublicStatus 只认 "aborted" → 真实写入值落进 `default: return "running"`。
 *   后果：被取消的 mission 对外永远报 running + canCancel=true，取消按钮常亮，
 *   点击必被 cancel 端点以 400 not-running 顶回，用户侧就是"点了没反应"。
 */

import type { SocialMissionQueryInputs } from "../../query/social-mission-query.service";
import { projectSocialMissionView } from "../social-mission-view.projector";

function project(status: string) {
  const row = {
    id: "sm-1",
    userId: "u1",
    contentId: "c1",
    platforms: ["xiaohongshu"],
    connectionIds: null,
    depth: "standard",
    budgetProfile: "balanced",
    language: "zh-CN",
    maxCredits: 100,
    status,
    startedAt: new Date("2026-08-04T01:00:00Z"),
    completedAt: status === "running" ? null : new Date(),
    elapsedWallTimeMs: null,
    tokensUsed: null,
    costUsd: null,
    errorMessage: null,
    failureCode: null,
    lastCompletedStage: 3,
  };
  const inputs = {
    mode: "row-loaded",
    missionId: row.id,
    row,
    events: [],
  } as unknown as SocialMissionQueryInputs;
  return projectSocialMissionView(inputs);
}

describe("social canonical view — persisted status 投影", () => {
  it.each([
    ["running", "running", true],
    ["completed", "completed", false],
    ["failed", "failed", false],
    // ★ store 现役写入拼写
    ["cancelled", "cancelled", false],
    // 历史拼写仍需兼容
    ["aborted", "cancelled", false],
  ])("%s → status=%s canCancel=%s", (persisted, expected, canCancel) => {
    const m = project(persisted).mission;
    expect(m.status).toBe(expected);
    expect(m.canCancel).toBe(canCancel);
  });

  it("★ 事故核心：cancelled 不得被投影成 running / 不得给取消按钮", () => {
    // 删掉 `case "cancelled"` 恢复旧实现时，这两条必红
    const m = project("cancelled").mission;
    expect(m.status).not.toBe("running");
    expect(m.canCancel).toBe(false);
    expect(m.terminalOutcome).toBe("cancelled");
  });
});

// ★ 深度检视自查补漏（2026-08-04）：本 spec 原先只取 .mission，**完全不碰 .agents**，
//   于是同一文件里 projectSocialAgents 手抄的第二份状态清单（同样漏 "cancelled"）
//   零覆盖 —— 页头显示"已取消"、agent 卡却全部"待启动"。属于典型的"假绿"。
describe("social agents phase — 不得再手抄第二份状态清单", () => {
  it.each([
    ["running", "running", false],
    ["completed", "completed", true],
    ["failed", "failed", true],
    // ★ store 现役写入拼写：agent 卡必须跟着进终态，不能落 pending
    ["cancelled", "failed", true],
    ["aborted", "failed", true],
  ])("%s → leader.phase=%s terminal=%s", (persisted, expectedPhase) => {
    const view = project(persisted);
    const leader = view.agents.find((a) => a.id === "leader");
    expect(leader?.phase).toBe(expectedPhase);
    expect(leader?.phase).not.toBe("pending");
  });

  it("★ cancelled 的 publisher 卡也必须进终态，不得停在「待启动」", () => {
    const view = project("cancelled");
    const publishers = view.agents.filter((a) => a.role === "publisher");
    expect(publishers.length).toBeGreaterThan(0);
    for (const p of publishers) expect(p.phase).not.toBe("pending");
  });
});
