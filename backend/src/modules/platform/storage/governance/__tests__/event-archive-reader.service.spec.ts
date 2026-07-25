import * as zlib from "zlib";
import { EventArchiveReaderService } from "../event-archive-reader.service";

/** 造一个归档对象（gzip NDJSON），与 EventArchiveService.buildObject 同格式。 */
function makeGz(rows: Record<string, unknown>[]): Buffer {
  const ndjson = rows
    .map((r) =>
      JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    )
    .join("\n");
  return zlib.gzipSync(Buffer.from(ndjson, "utf-8"));
}

function makeStorage(objects: Record<string, Buffer>, enabled = true) {
  return {
    isEnabled: () => enabled,
    listObjects: jest.fn(async (opts?: { prefix?: string }) => ({
      objects: Object.keys(objects)
        .filter((k) => !opts?.prefix || k.startsWith(opts.prefix))
        .map((k) => ({ key: k, size: objects[k].length })),
      isTruncated: false,
      nextContinuationToken: undefined,
    })),
    getObjectBytes: jest.fn(async (key: string) => objects[key] ?? null),
  };
}

describe("EventArchiveReaderService", () => {
  const TABLE = "agent_playground_mission_events";
  const pfx = `event-archive/${TABLE}/`;

  it("按日期窗口重叠挑对象，gunzip+NDJSON 解析并按 rowFilter 过滤", async () => {
    const inWindow = makeGz([
      { id: "1", missionId: "m1", type: "playground.a", ts: "1000" },
      { id: "2", missionId: "OTHER", type: "playground.b", ts: "1001" },
      { id: "3", missionId: "m1", type: "playground.c", ts: "1002" },
    ]);
    const outOfWindow = makeGz([
      { id: "9", missionId: "m1", type: "playground.z", ts: "9" },
    ]);
    const storage = makeStorage({
      [`${pfx}20260710_20260710_aaaa1111.ndjson.gz`]: inWindow,
      [`${pfx}20260101_20260101_bbbb2222.ndjson.gz`]: outOfWindow, // 窗口外
    });
    const reader = new EventArchiveReaderService(storage as never);

    const rows = await reader.readArchivedRows({
      table: TABLE,
      dayFrom: new Date("2026-07-09T00:00:00Z"),
      dayTo: new Date("2026-07-11T00:00:00Z"),
      rowFilter: (r) => r.missionId === "m1",
      limit: 100,
    });

    expect(rows.map((r) => r.id)).toEqual(["1", "3"]); // OTHER 被过滤、窗口外对象未下载
    expect(storage.getObjectBytes).toHaveBeenCalledTimes(1); // 只下了窗口内那个对象
    expect(storage.listObjects).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: pfx }),
    );
  });

  it("尊重 limit（够数即停）", async () => {
    const gz = makeGz([
      { id: "1", missionId: "m1", ts: "1" },
      { id: "2", missionId: "m1", ts: "2" },
      { id: "3", missionId: "m1", ts: "3" },
    ]);
    const storage = makeStorage({
      [`${pfx}20260710_20260710_cccc3333.ndjson.gz`]: gz,
    });
    const reader = new EventArchiveReaderService(storage as never);
    const rows = await reader.readArchivedRows({
      table: TABLE,
      dayFrom: new Date("2026-07-10T00:00:00Z"),
      dayTo: new Date("2026-07-10T00:00:00Z"),
      rowFilter: () => true,
      limit: 2,
    });
    expect(rows).toHaveLength(2);
  });

  it("storage 未启用 → 返回 []（不抛、不列）", async () => {
    const storage = makeStorage({}, false);
    const reader = new EventArchiveReaderService(storage as never);
    const rows = await reader.readArchivedRows({
      table: TABLE,
      dayFrom: new Date(),
      dayTo: new Date(),
      rowFilter: () => true,
      limit: 10,
    });
    expect(rows).toEqual([]);
    expect(storage.listObjects).not.toHaveBeenCalled();
  });

  it("对象缓存：同 key 二次读不重复下载", async () => {
    const gz = makeGz([{ id: "1", missionId: "m1", ts: "1" }]);
    const storage = makeStorage({
      [`${pfx}20260710_20260710_dddd4444.ndjson.gz`]: gz,
    });
    const reader = new EventArchiveReaderService(storage as never);
    const q = {
      table: TABLE,
      dayFrom: new Date("2026-07-10T00:00:00Z"),
      dayTo: new Date("2026-07-10T00:00:00Z"),
      rowFilter: () => true,
      limit: 10,
    };
    await reader.readArchivedRows(q);
    await reader.readArchivedRows(q);
    expect(storage.getObjectBytes).toHaveBeenCalledTimes(1);
  });
});
