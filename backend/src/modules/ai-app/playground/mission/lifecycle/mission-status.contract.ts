/**
 * mission-status.contract.ts —— 持久化 mission 状态 → 对外 view 状态的**唯一**映射源。
 *
 * ★ 2026-08-04 生产事故（Screenshot_46「点取消，始终无效」）根因：
 *   `agent_playground_missions.status` 是自由 VarChar(20)，写入方早已改写
 *   "quality-failed"（Leader 拒签，见 mission-lifecycle.helper buildFailedUpdate），
 *   但读取方 resolvePublicStatus 的分支表停留在老枚举（completed / rejected /
 *   failed / running / cancelled），**没有 quality-failed 这一支**，落到兜底
 *   `return "running"`。后果链：
 *     canonical view 报 status=running + canCancel=true
 *       → 页头永远「研究中 · N 秒」且秒数一直涨
 *       → 取消按钮常亮，用户点击
 *       → 后端 cancel 端点读 DB 真状态，抛 400 "status is quality-failed, not running"
 *       → 前端 catch 命中 /status is/ → toast + reload → view 又报 running
 *       → **死循环，取消永远无效**（生产日志 10:17:52 / 10:18:01 两次 400 实证）
 *
 *   同一份状态清单在本模块被手抄了 4 份，每份子集都不一样（漏 quality-failed 的、
 *   漏 rejected 的、两个都漏的），所以症状不止取消：终态 mission 的 agent 卡
 *   "running"、章节卡 "撰写中"、rollup todo 卡 "pending"。
 *
 * 机制（而非逐处打补丁）：
 *   1. 持久化取值收敛成一个 union，映射表用 `Record<PersistedMissionStatus, …>`
 *      —— 以后新增一个持久化状态而不补映射，**tsc 直接编译失败**，不会再静默降级。
 *   2. 兜底不再一律 "running"。未知取值按行上的终态证据（completedAt /
 *      terminalOutcome）判定，宁可显示终态也不制造"永远在跑"的假象。
 *   3. 终态 / 成功态判定统一走本文件导出的谓词，禁止各处再手写字面量清单。
 */

import { isMissionTerminal } from "@/modules/ai-harness/facade";
import type { MissionStatus } from "../../api/contracts/view-state.contract";

/**
 * DB 列 `agent_playground_missions.status` 可能出现的全部取值。
 * "rejected" 是 legacy：早期版本把「Leader 拒签」写成 rejected，现写 quality-failed，
 * 老行仍在库里，必须继续认。
 */
export const PERSISTED_MISSION_STATUSES = [
  "running",
  "completed",
  "failed",
  "cancelled",
  "quality-failed",
  "rejected",
] as const;

export type PersistedMissionStatus =
  (typeof PERSISTED_MISSION_STATUSES)[number];

/**
 * 持久化 → public 的唯一映射表（§6.4.1.a per-app 映射）。
 * Record 穷举：漏一个 key 就编译不过。
 */
const PERSISTED_TO_PUBLIC: Record<PersistedMissionStatus, MissionStatus> = {
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  "quality-failed": "quality-failed",
  // legacy 行：语义等同 quality-failed（产出有了，Leader 没签）
  rejected: "quality-failed",
};

const KNOWN_STATUSES: ReadonlySet<string> = new Set(PERSISTED_MISSION_STATUSES);

export function isKnownPersistedMissionStatus(
  status: string,
): status is PersistedMissionStatus {
  return KNOWN_STATUSES.has(status);
}

/** 映射只需要 row 的这三个字段，方便 projector / policy / 测试复用。 */
export interface MissionStatusRow {
  status: string;
  completedAt?: Date | string | null;
  terminalOutcome?: string | null;
}

/**
 * 持久化状态 → public 状态。
 *
 * 未知取值**不再**一律降级 running —— 那正是本次事故：终态行被当成运行中，
 * 取消按钮常亮但后端必然 400。改为按行上的终态证据判定，无证据才算运行中。
 */
export function toPublicMissionStatus(row: MissionStatusRow): MissionStatus {
  if (isKnownPersistedMissionStatus(row.status)) {
    return PERSISTED_TO_PUBLIC[row.status];
  }
  const hasTerminalEvidence =
    Boolean(row.completedAt) || Boolean(row.terminalOutcome);
  return hasTerminalEvidence ? "failed" : "running";
}

/** 该行是否已进入终态（唯一判据，禁止各处再手写字面量清单）。 */
export function isPersistedMissionTerminal(row: MissionStatusRow): boolean {
  return isMissionTerminal(toPublicMissionStatus(row));
}

/**
 * 终态里的「有产出」子集：completed（全绿）与 quality-failed（产出齐了但 Leader
 * 拒签）。展示侧据此把滞留的 agent / 章节 / todo 收成"已完成"而非"失败"。
 */
export function isPersistedMissionSuccessLike(row: MissionStatusRow): boolean {
  const publicStatus = toPublicMissionStatus(row);
  return publicStatus === "completed" || publicStatus === "quality-failed";
}
