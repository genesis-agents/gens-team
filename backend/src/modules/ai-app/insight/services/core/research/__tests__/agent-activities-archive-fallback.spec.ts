/**
 * ★ 2026-08-04 深度检视 #6 回归。
 *
 * 原缺陷：EventArchiveReader 回落只接在 AgentActivityService 的
 * getActivitiesByDimension / getLeaderThinkingHistory 上，而这两个方法**零调用方**；
 * 前端时间线真正走的是 ResearchEventEmitterService.getAgentActivities（裸 prisma）。
 * 归档一开，旧专题返回 [] → 界面「无活动记录」，标题声称修好的 traces lost 原样保留。
 */

import { ResearchEventEmitterService } from "../research-event-emitter.service";

function mkEmitter(pgRows: unknown[], archived: unknown[] | null) {
  const prisma = {
    researchAgentActivity: { findMany: jest.fn().mockResolvedValue(pgRows) },
  };
  const agentActivityService =
    archived === null
      ? undefined
      : { readArchivedAgentActivities: jest.fn().mockResolvedValue(archived) };
  const svc = new ResearchEventEmitterService(
    prisma as never,
    { emit: jest.fn() } as never,
    undefined,
    agentActivityService as never,
  );
  return { svc, prisma, agentActivityService };
}

describe("getAgentActivities 归档回落", () => {
  it("Postgres 有数据 → 直接返回，不碰归档", async () => {
    const rows = [{ id: "a", createdAt: new Date() }];
    const { svc, agentActivityService } = mkEmitter(rows, []);
    const out = await svc.getAgentActivities("t1");
    expect(out).toHaveLength(1);
    expect(
      (agentActivityService as { readArchivedAgentActivities: jest.Mock })
        .readArchivedAgentActivities,
    ).not.toHaveBeenCalled();
  });

  it("★ Postgres 空（行已归档删除）→ 必须回读归档，而不是返回空", async () => {
    const archivedRows = [{ id: "z", createdAt: new Date() }];
    const { svc, agentActivityService } = mkEmitter([], archivedRows);
    const out = await svc.getAgentActivities("t1", {
      missionId: "m1",
      limit: 50,
    });
    // 恢复旧实现（不接回落）时，这里是 []
    expect(out).toHaveLength(1);
    expect(
      (agentActivityService as { readArchivedAgentActivities: jest.Mock })
        .readArchivedAgentActivities,
    ).toHaveBeenCalledWith("t1", { missionId: "m1", limit: 50 });
  });

  it("AgentActivityService 缺失（归档模块未装）→ 退化为只查 Postgres，不抛", async () => {
    const { svc } = mkEmitter([], null);
    await expect(svc.getAgentActivities("t1")).resolves.toEqual([]);
  });
});
