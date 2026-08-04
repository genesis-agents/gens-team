/**
 * mission-status.contract.spec.ts
 *
 * ★ 2026-08-04 生产事故回归（Screenshot_46「点取消，始终无效」）。
 *
 * 事故链（Railway 日志实证）：
 *   DB 里 status='quality-failed' 的 mission，被 resolvePublicStatus 的兜底
 *   `return "running"` 投影成 running → view.canCancel=true → 前端页头「研究中」
 *   + 取消按钮常亮 → 点击 → 后端读 DB 真状态抛
 *   `400 mission ... status is quality-failed, not running`
 *   → 前端 catch 到 "status is" 就 reload → view 又报 running → **无限循环**。
 *
 * 本 spec 三层看护：
 *   1. 映射表逐值正确（尤其 quality-failed / cancelled 两个"漏网"值）
 *   2. 未知取值的兜底**不得**一律 running（这是病根本身）
 *   3. 机制扫描：全模块里拿 mission row 状态做比较的字面量，必须都在本 union 里
 *      —— 有人在别处用了新状态值却不来登记，这里直接红
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
  PERSISTED_MISSION_STATUSES,
  isKnownPersistedMissionStatus,
  isPersistedMissionSuccessLike,
  isPersistedMissionTerminal,
  toPublicMissionStatus,
} from "../mission-status.contract";

const row = (status: string, extra: Record<string, unknown> = {}) => ({
  status,
  completedAt: null,
  terminalOutcome: null,
  ...extra,
});

describe("toPublicMissionStatus — 持久化 → public 映射", () => {
  it.each([
    ["running", "running"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    // ★ 事故值：写入方早已写 quality-failed，读取方分支表没有它
    ["quality-failed", "quality-failed"],
    // legacy 行：老代码把 Leader 拒签写成 rejected，语义等同 quality-failed
    ["rejected", "quality-failed"],
  ])("%s → %s", (persisted, expected) => {
    expect(toPublicMissionStatus(row(persisted))).toBe(expected);
  });

  it("★ 事故核心：quality-failed 绝不能被投影成 running", () => {
    // 恢复旧实现（无 quality-failed 分支 → 兜底 return "running"）时此断言必红
    expect(toPublicMissionStatus(row("quality-failed"))).not.toBe("running");
    expect(isPersistedMissionTerminal(row("quality-failed"))).toBe(true);
  });

  it("union 里每个值都被映射，且没有任何一个落进 running 兜底", () => {
    for (const s of PERSISTED_MISSION_STATUSES) {
      expect(isKnownPersistedMissionStatus(s)).toBe(true);
      if (s !== "running") {
        expect(toPublicMissionStatus(row(s))).not.toBe("running");
      }
    }
  });
});

describe("未知取值兜底 — 不得一律降级 running", () => {
  it("未知状态 + 有 completedAt → 终态（不是 running）", () => {
    const r = row("some-future-status", { completedAt: new Date() });
    expect(toPublicMissionStatus(r)).not.toBe("running");
    expect(isPersistedMissionTerminal(r)).toBe(true);
  });

  it("未知状态 + 有 terminalOutcome → 终态（不是 running）", () => {
    const r = row("some-future-status", { terminalOutcome: "failed" });
    expect(toPublicMissionStatus(r)).not.toBe("running");
    expect(isPersistedMissionTerminal(r)).toBe(true);
  });

  it("未知状态 + 无任何终态证据 → running（仍在跑，可取消）", () => {
    const r = row("some-future-status");
    expect(toPublicMissionStatus(r)).toBe("running");
    expect(isPersistedMissionTerminal(r)).toBe(false);
  });
});

describe("isPersistedMissionSuccessLike — 有产出的终态", () => {
  it.each([
    ["completed", true],
    ["quality-failed", true],
    ["rejected", true],
    ["failed", false],
    ["cancelled", false],
    ["running", false],
  ])("%s → %s", (status, expected) => {
    expect(isPersistedMissionSuccessLike(row(status))).toBe(expected);
  });
});

// ============================================================================
// 机制扫描：别处再出现本 union 之外的 mission 状态字面量，这里必须红
// ============================================================================

const PLAYGROUND_ROOT = join(__dirname, "..", "..", "..");

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      collectTsFiles(full, out);
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("★ 机制：mission row 状态字面量必须全部登记在 PERSISTED_MISSION_STATUSES", () => {
  // 只匹配「拿 mission row / detail 的 status 做比较」的写法，避开 stage/todo/agent
  // 等同名但不同枚举的 status 字段。
  const COMPARE_RE =
    /\b(?:row|detail|persisted|mission)\??\.status\s*(?:===|!==)\s*"([^"]+)"/g;
  // Prisma where 里的状态白名单：status: { in: [...] }。
  // chapterDraft / stage 等同名字段用的是别的枚举，靠"前文出现 agentPlaygroundMission"
  // 把范围收窄到 mission 表本身。
  const IN_LIST_RE = /\bstatus:\s*\{\s*in:\s*\[([^\]]+)\]/g;
  const IN_LIST_SCOPE = "agentPlaygroundMission";
  const IN_LIST_LOOKBACK = 400;
  // lifecycle 复活白名单（mission 专属）
  const REOPENABLE_RE = /\breopenableStatuses:\s*\[([^\]]+)\]/g;

  const files = collectTsFiles(PLAYGROUND_ROOT);

  it("扫描到的文件数量非零（防扫描路径写错导致空跑绿灯）", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("没有任何未登记的状态字面量", () => {
    const offenders: string[] = [];
    const known = new Set<string>(PERSISTED_MISSION_STATUSES);

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const push = (value: string) => {
        if (!known.has(value)) {
          offenders.push(`${file.replace(PLAYGROUND_ROOT, "")}: "${value}"`);
        }
      };
      for (const m of src.matchAll(COMPARE_RE)) push(m[1]);
      for (const m of src.matchAll(IN_LIST_RE)) {
        const before = src.slice(
          Math.max(0, (m.index ?? 0) - IN_LIST_LOOKBACK),
          m.index ?? 0,
        );
        if (!before.includes(IN_LIST_SCOPE)) continue; // 别的表的 status 枚举
        for (const lit of m[1].matchAll(/"([^"]+)"/g)) push(lit[1]);
      }
      for (const m of src.matchAll(REOPENABLE_RE)) {
        for (const lit of m[1].matchAll(/"([^"]+)"/g)) push(lit[1]);
      }
    }

    expect(offenders).toEqual([]);
  });
});
