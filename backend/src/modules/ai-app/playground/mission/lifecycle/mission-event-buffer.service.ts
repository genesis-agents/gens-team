/**
 * MissionEventBuffer — 内存事件缓冲 + DB write-through 兜底
 *
 * ★ 2026-05-24 P6 Wave 1：framework 化下沉到
 *   `ai-harness/teams/business-team/lifecycle/business-team-event-buffer.framework.ts`。
 *   本文件仅注入 playground 专属 hooks（playground.* 前缀过滤 +
 *   agent_playground_mission_events 表写入 / 读取）。
 *
 * - 写：append 到内存（FIFO 5000，TTL 1h）+ fire-and-forget INSERT 到
 *   `agent_playground_mission_events` 表，不阻塞主流程。
 * - 读：sync 优先返回内存（fast path）。无内存时调用方需用 readPersisted() 兜底。
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  BusinessTeamEventBufferFramework,
  type EventBufferHooks,
} from "@/modules/ai-harness/facade";
import { EventArchiveReaderService } from "@/modules/platform/facade";

const ARCHIVE_TABLE = "agent_playground_mission_events";
const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class MissionEventBuffer extends BusinessTeamEventBufferFramework {
  constructor(
    prisma: PrismaService,
    // @Optional：StorageModule 未 import 时归档回读退化为空（仍返回 Postgres 命中），
    // 不强依赖以避免 playground.module 与 platform storage 的循环。
    @Optional() archiveReader?: EventArchiveReaderService,
  ) {
    const hooks: EventBufferHooks = {
      adapterId: "playground.mission-buffer",
      acceptsEvent: (type) => type.startsWith("playground."),
      persistEvent: async (event) => {
        await prisma.agentPlaygroundMissionEvent.create({
          data: {
            missionId: event.missionId,
            type: event.type.slice(0, 120),
            agentId: event.agentId?.slice(0, 120),
            traceId: event.traceId?.slice(0, 120),
            payload: (event.payload ?? {}) as object,
            ts: BigInt(event.timestamp),
          },
        });
      },
      fetchPersisted: async (missionId, sinceTs, limit) => {
        const rows = await prisma.agentPlaygroundMissionEvent.findMany({
          where: {
            missionId,
            ...(sinceTs != null ? { ts: { gte: BigInt(sinceTs) } } : {}),
          },
          orderBy: { ts: "asc" },
          take: limit,
        });
        if (rows.length > 0) {
          return rows.map((r) => ({
            type: r.type,
            payload: r.payload as unknown,
            agentId: r.agentId ?? undefined,
            traceId: r.traceId ?? undefined,
            timestamp: Number(r.ts),
          }));
        }
        // ★ 2026-07-25：Postgres 空 → mission 事件可能已被 EventArchiveService
        //   归档删除，回读 R2 冷存（EventArchiveReaderService）。
        return MissionEventBuffer.readFromArchive(
          prisma,
          archiveReader,
          missionId,
          sinceTs,
          limit,
        );
      },
    };
    super(hooks, "MissionEventBuffer");
  }

  /** 从 R2 归档回读某 mission 的事件（Postgres 已归档删除时兜底）。 */
  private static async readFromArchive(
    prisma: PrismaService,
    archiveReader: EventArchiveReaderService | undefined,
    missionId: string,
    sinceTs: number | undefined,
    limit: number,
  ): Promise<
    Array<{
      type: string;
      payload: unknown;
      agentId?: string;
      traceId?: string;
      timestamp: number;
    }>
  > {
    if (!archiveReader) return [];
    const mission = await prisma.agentPlaygroundMission.findUnique({
      where: { id: missionId },
      select: { startedAt: true, completedAt: true },
    });
    if (!mission) return [];
    // 事件 createdAt 落在 [startedAt, completedAt] 内；两端各留 1 天缓冲（跨日/长跑）。
    const dayFrom = new Date(mission.startedAt.getTime() - DAY_MS);
    const dayTo = new Date(
      (mission.completedAt ?? mission.startedAt).getTime() + DAY_MS,
    );
    const archived = await archiveReader.readArchivedRows({
      table: ARCHIVE_TABLE,
      dayFrom,
      dayTo,
      rowFilter: (r) =>
        r.missionId === missionId &&
        (sinceTs == null || Number(r.ts) >= sinceTs),
      limit,
    });
    return archived
      .map((r) => ({
        type: String(r.type),
        payload: r.payload,
        agentId: r.agentId != null ? String(r.agentId) : undefined,
        traceId: r.traceId != null ? String(r.traceId) : undefined,
        timestamp: Number(r.ts),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}
