/**
 * start-claim-toctou.spec.ts
 *
 * ★ 2026-08-04 深度检视 #1 回归。
 *
 * 原缺陷：runMission 的重入护栏 `sessions.has` 与落键 `sessions.set` 之间隔着
 * 多次 await（两次 overlay 刷新 + openSession 的 validateModels/validateCredits/
 * createMissionRow）。两个相隔 <100ms 的请求都能通过检查、都开出 session，后者
 * 覆盖前者 entry；任一 run 的 finally 里 `sessions.delete` 删掉的是**另一个 run
 * 还在用的** entry → 对方 stage hook 撞 "no active session for mission"。
 *
 * 本 spec 直接打这个窗口：让 openSession 挂起，在它 pending 期间发第二次
 * runMission —— 必须被 ConflictException 挡住，且 openSession 只被调用一次。
 */

import { ConflictException } from "@nestjs/common";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * 只取被测逻辑的最小骨架：同步占位 + TTL + 护栏。
 * 直接 new 真 dispatcher 需要 15+ 依赖，与本缺陷无关；这里复刻**同一份判据**，
 * 并在下方用源码断言把骨架与真实实现绑定，防止两者漂移。
 */
class ClaimGuard {
  private readonly sessions = new Map<string, object>();
  private readonly startClaims = new Map<string, number>();
  private static readonly TTL = 60_000;
  openSessionCalls = 0;

  private hasFreshStartClaim(id: string): boolean {
    const at = this.startClaims.get(id);
    if (at === undefined) return false;
    if (Date.now() - at > ClaimGuard.TTL) {
      this.startClaims.delete(id);
      return false;
    }
    return true;
  }

  hasActiveLocalRun(id: string): boolean {
    return this.sessions.has(id) || this.hasFreshStartClaim(id);
  }

  async runMission(id: string, openSession: () => Promise<object>) {
    if (this.sessions.has(id) || this.hasFreshStartClaim(id)) {
      throw new ConflictException(`concurrent run for mission ${id} rejected`);
    }
    this.startClaims.set(id, Date.now()); // 同步占位，与检查之间无 await
    try {
      this.openSessionCalls += 1;
      const session = await openSession().catch((e: unknown) => {
        this.startClaims.delete(id);
        throw e;
      });
      this.sessions.set(id, session);
      return session;
    } finally {
      // 真实实现在 mission 跑完的 finally 里同时 delete sessions + startClaims
      this.startClaims.delete(id);
    }
  }
}

describe("★ 同步占位挡住 check→set 之间的双击窗口", () => {
  it("openSession 仍 pending 时的第二次调用必须被拒，且 openSession 只跑一次", async () => {
    const g = new ClaimGuard();
    const d = deferred<object>();

    const first = g.runMission("m1", () => d.promise);
    // 让第一次跑到 await openSession 处挂起
    await Promise.resolve();

    // 恢复旧行为（去掉同步占位）时，这里不会抛 —— 两个 run 都会开出 session
    await expect(g.runMission("m1", () => d.promise)).rejects.toThrow(
      ConflictException,
    );
    expect(g.openSessionCalls).toBe(1);

    d.resolve({ ok: true });
    await first;
  });

  it("hasActiveLocalRun 在占位期间即为 true（前置检查与护栏同一判据）", async () => {
    const g = new ClaimGuard();
    const d = deferred<object>();
    const first = g.runMission("m2", () => d.promise);
    await Promise.resolve();
    // 此刻 sessions 尚未落键，只有占位 —— 上游 409 前置检查必须也能看见
    expect(g.hasActiveLocalRun("m2")).toBe(true);
    d.resolve({});
    await first;
  });

  it("openSession 抛错时立即释放占位，用户重试不被自己的残留挡住", async () => {
    const g = new ClaimGuard();
    await expect(
      g.runMission("m3", () => Promise.reject(new Error("credits"))),
    ).rejects.toThrow("credits");
    expect(g.hasActiveLocalRun("m3")).toBe(false);
    // 立即重试可以进去
    await g.runMission("m3", () => Promise.resolve({}));
    expect(g.openSessionCalls).toBe(2);
  });
});

// ── 骨架与真实实现绑定：防止上面的复刻与源码漂移 ──────────────────────────
describe("骨架必须与真实 dispatcher 实现一致", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "../playground.pipeline.ts"),
    "utf8",
  ) as string;

  it("护栏与 hasActiveLocalRun 都读 startClaims", () => {
    expect(src).toMatch(
      /hasActiveLocalRun[\s\S]{0,400}?hasFreshStartClaim\(missionId\)/,
    );
    expect(src).toMatch(
      /sessions\.has\(missionId\)\s*\|\|\s*this\.hasFreshStartClaim\(missionId\)/,
    );
  });

  it("占位是同步落下的：检查与 startClaims.set 之间不得出现 await", () => {
    const i = src.indexOf("this.startClaims.set(missionId, Date.now())");
    expect(i).toBeGreaterThan(0);
    const guardIdx = src.lastIndexOf("throw new ConflictException", i);
    expect(guardIdx).toBeGreaterThan(0);
    // 必须先剥掉注释再判 —— 否则解释这段窗口的注释里出现 "await" 就会误判
    // （本断言第一版正是这样自误的）。
    // 注意不要用 /\/\/.*$/：文件是 CRLF，`.` 不匹配 \r，`$` 锚点会让整条规则
    // 匹配失败，注释原样留下 —— 第一版正是这样自误的。
    const codeOnly = src
      .slice(guardIdx, i)
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*/, ""))
      .join("\n");
    expect(codeOnly).not.toContain("await");
  });

  it("finally 与 openSession 的 catch 都释放占位", () => {
    expect(src).toMatch(
      /sessions\.delete\(missionId\);\s*\n\s*this\.startClaims\.delete\(missionId\);/,
    );
    expect(src).toMatch(
      /catch\(\(err: unknown\) => \{\s*\n\s*this\.startClaims\.delete\(missionId\);/,
    );
  });
});
