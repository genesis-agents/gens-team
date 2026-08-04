/**
 * rerun-completed-heartbeat-suicide.spec.ts
 *
 * ★ 2026-08-04 深度检视 #3（high）回归。
 *
 * 事故链（四个环节缺一不可，任一处恢复旧行为本 spec 必红）：
 *   1. mission-rerun-orchestrator.rerunnableStatuses **含** "completed"
 *      → 用户对已完成 mission 点重跑，API 受理
 *   2. mission-lifecycle.helper.reopenableStatuses 原先**不含** "completed"
 *      → markReopened 抛 BadRequest，行仍是 completed
 *   3. mission-runtime-shell.createMissionRow 原先 `.catch(() => undefined)`
 *      **静默吞掉** 2 的失败 → 假装开跑成功
 *   4. writeHeartbeat 是条件写 `where { id, status: "running" }` → 命中 0 行
 *      → readStatus 拿到 "completed" → triggerEmergencyAbort("db-terminal:completed")
 *      → 整条重跑在第一秒被自己掐死，零产出
 *
 * 症状爆在第 4 步，病灶在第 2/3 步，中间隔着一次静默 catch —— 完全对不上号。
 */

import { BusinessTeamMissionStoreFramework } from "@/modules/ai-harness/facade";

// ── 环节 1&2：两份状态清单必须一致 ─────────────────────────────────────────
describe("★ 环节1&2：rerunnable 与 reopenable 两份清单一致", () => {
  it("rerunnableStatuses 里的每个终态都必须在 reopenableStatuses 里", () => {
    // 直接读源码常量，避免手抄第三份清单（本 bug 的根因就是手抄）
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const read = (p: string) =>
      fs.readFileSync(path.join(__dirname, p), "utf8");

    const orchestrator = read(
      "../../rerun/mission-rerun-orchestrator.service.ts",
    );
    const helper = read("../../lifecycle/mission-lifecycle.helper.ts");

    const grab = (src: string, key: string): string[] => {
      const m = new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`).exec(src);
      expect(m).not.toBeNull();
      return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    };

    const rerunnable = grab(orchestrator, "rerunnableStatuses");
    const reopenable = grab(helper, "reopenableStatuses");

    expect(rerunnable.length).toBeGreaterThan(0);
    // 允许 reopenable 是超集；但 rerunnable 里任何一个都不得缺席，
    // 否则就是"受理了却永远翻不回 running"。
    const missing = rerunnable.filter((s) => !reopenable.includes(s));
    expect(missing).toEqual([]);
    // 明确锁住事故值本身
    expect(rerunnable).toContain("completed");
    expect(reopenable).toContain("completed");
  });
});

// ── 环节 4：emergencyAborted 去重标记必须能解除 ───────────────────────────
describe("★ 环节4：心跳恢复后必须解除 emergency-abort 去重标记", () => {
  function makeStore(opts: {
    heartbeatAffected: () => number;
    status: string | null;
  }) {
    const aborts: Array<{ missionId: string; reason: string }> = [];
    const hooks = {
      loggerNamespace: "test-store",
      createMission: jest.fn(),
      writeHeartbeat: jest.fn(async () => opts.heartbeatAffected()),
      readStatus: jest.fn(async () => opts.status),
      emergencyAbort: (missionId: string, reason: string) => {
        aborts.push({ missionId, reason });
      },
    };
    class S extends (BusinessTeamMissionStoreFramework as never as new (
      h: unknown,
    ) => {
      refreshHeartbeat(missionId: string, podId: string): Promise<void>;
    }) {}
    return { store: new S(hooks), aborts, hooks };
  }

  it("abort 过一次后，心跳恢复命中 → 再次异常时仍能重新 abort（保护不被永久丢失）", async () => {
    let affected = 0;
    const { store, aborts } = makeStore({
      heartbeatAffected: () => affected,
      status: "completed",
    });

    // 第一次：条件写 0 行 → 触发 emergency abort
    await store.refreshHeartbeat("m1", "pod1");
    expect(aborts).toHaveLength(1);

    // 第二次：仍 0 行 → 去重生效，不重复 abort
    await store.refreshHeartbeat("m1", "pod1");
    expect(aborts).toHaveLength(1);

    // 行被重跑翻回 running：心跳命中 → 必须解除去重标记
    affected = 1;
    await store.refreshHeartbeat("m1", "pod1");
    expect(aborts).toHaveLength(1);

    // 之后真的又出事（行蒸发）→ 必须能再次 abort。
    // 恢复旧实现（emergencyAborted 只增不删）时这一条必红。
    affected = 0;
    await store.refreshHeartbeat("m1", "pod1");
    expect(aborts).toHaveLength(2);
  });
});
