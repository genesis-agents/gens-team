/**
 * EventArchiveReaderService —— EventArchiveService 的「冷读」对偶（2026-07-25）。
 *
 * 背景：EventArchiveService 把 `createdAt < cutoff` 的 trace/事件行归档到 R2
 *   （`event-archive/{table}/{YYYYMMDD}_{YYYYMMDD}_{idsHash}.ndjson.gz`）后从
 *   Postgres 删除。热读路径只查 Postgres → 归档行在 UI 永久不可见（"trace 全丢"）。
 *   本服务提供按 R2 前缀 + 日期窗口的回读，供各热读路径在 Postgres 命中为空时兜底。
 *
 * 定位方式（与用户 2026-07-25 确认一致）：按日期前缀扫描——
 *   1. listObjects(prefix=`event-archive/{table}/`) 只列该表归档对象（服务端 Prefix 过滤）
 *   2. 解析 key 里的 `{first}_{last}` 天边界，保留与 [dayFrom, dayTo] 有重叠的对象
 *   3. 下载 + gunzip + 逐行 JSON.parse，套用 rowFilter，累计到 limit
 *
 * 归档对象不可变（归档即定稿），故按 key 结果做进程内短缓存，避免同一 mission 反复拉 R2。
 */

import { Injectable, Logger } from "@nestjs/common";
import * as zlib from "zlib";
import { ObjectStorageService } from "../object-store/object-storage.service";

export interface ArchiveReadQuery {
  /** 物理表名（R2 key 段），如 "agent_playground_mission_events" */
  table: string;
  /** mission/记录的时间窗口下界（含）—— 用 mission 起始日 -1 天缓冲 */
  dayFrom: Date;
  /** 时间窗口上界（含）—— 用 mission 结束日 +1 天缓冲 */
  dayTo: Date;
  /** 逐行过滤（如 r => r.missionId === id），返回 true 保留 */
  rowFilter: (row: Record<string, unknown>) => boolean;
  /** 最多返回行数 */
  limit: number;
}

const OBJECT_CACHE_MAX = 64; // 缓存最近解码的归档对象（每对象 ≤500 行）

@Injectable()
export class EventArchiveReaderService {
  private readonly logger = new Logger(EventArchiveReaderService.name);
  /** key -> 解码后的行数组（归档不可变，可安全缓存）。简易 FIFO。 */
  private readonly objectCache = new Map<string, Record<string, unknown>[]>();

  constructor(private readonly storage: ObjectStorageService) {}

  /**
   * 从 R2 归档回读匹配行。R2 未配置 / 无重叠对象 / 全部读失败 → 返回 []（绝不抛，兜底语义）。
   */
  async readArchivedRows(
    query: ArchiveReadQuery,
  ): Promise<Record<string, unknown>[]> {
    if (!this.storage.isEnabled()) return [];
    try {
      const prefix = `event-archive/${query.table}/`;
      const keys = await this.listOverlappingKeys(
        prefix,
        query.dayFrom,
        query.dayTo,
      );
      if (keys.length === 0) return [];

      const out: Record<string, unknown>[] = [];
      for (const key of keys) {
        const rows = await this.loadObject(key);
        for (const row of rows) {
          if (query.rowFilter(row)) {
            out.push(row);
            if (out.length >= query.limit) return out;
          }
        }
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `[archive-read ${query.table}] failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  /** 列出该表归档对象里日期窗口与 [dayFrom,dayTo] 有重叠的 key（分页取尽）。 */
  private async listOverlappingKeys(
    prefix: string,
    dayFrom: Date,
    dayTo: Date,
  ): Promise<string[]> {
    const from = this.dayStamp(dayFrom);
    const to = this.dayStamp(dayTo);
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.storage.listObjects({
        prefix,
        maxKeys: 1000,
        continuationToken: token,
      });
      for (const obj of res.objects) {
        const range = this.parseKeyDayRange(obj.key);
        // 区间重叠：objFirst <= windowTo && objLast >= windowFrom（字符串 YYYYMMDD 字典序=时间序）
        if (range && range.first <= to && range.last >= from) {
          keys.push(obj.key);
        }
      }
      token = res.isTruncated ? res.nextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  /** 下载 + gunzip + 逐行 parse（带缓存）。读失败返回 []。 */
  private async loadObject(key: string): Promise<Record<string, unknown>[]> {
    const cached = this.objectCache.get(key);
    if (cached) return cached;

    const gz = await this.storage.getObjectBytes(key);
    if (!gz) return [];
    const ndjson = zlib.gunzipSync(gz).toString("utf-8");
    const rows: Record<string, unknown>[] = [];
    for (const line of ndjson.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rows.push(JSON.parse(trimmed) as Record<string, unknown>);
      } catch {
        // 单行损坏不拖垮整对象
      }
    }
    this.cacheObject(key, rows);
    return rows;
  }

  private cacheObject(key: string, rows: Record<string, unknown>[]): void {
    if (this.objectCache.size >= OBJECT_CACHE_MAX) {
      const oldest = this.objectCache.keys().next().value;
      if (oldest !== undefined) this.objectCache.delete(oldest);
    }
    this.objectCache.set(key, rows);
  }

  /** `event-archive/{table}/{first}_{last}_{idsHash}.ndjson.gz` → {first,last}（YYYYMMDD）。 */
  private parseKeyDayRange(
    key: string,
  ): { first: string; last: string } | null {
    const base = key.split("/").pop() ?? "";
    const m = base.match(/^(\d{8})_(\d{8})_[0-9a-f]+\.ndjson\.gz$/);
    if (!m) return null;
    return { first: m[1], last: m[2] };
  }

  private dayStamp(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  }
}
