import { raceWithAbortSignal } from "../abort-race.util";

describe("raceWithAbortSignal", () => {
  it("无 signal：原样返回结果", async () => {
    await expect(raceWithAbortSignal(Promise.resolve(42))).resolves.toBe(42);
  });

  it("signal 已 aborted：立即拒绝 AbortError，不等 work", async () => {
    const controller = new AbortController();
    controller.abort();
    const work = new Promise<number>(() => undefined); // 永不 settle
    await expect(
      raceWithAbortSignal(work, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("mid-flight abort：work 未完成时拉 signal → 立即 AbortError", async () => {
    const controller = new AbortController();
    let resolveWork: (v: string) => void = () => undefined;
    const work = new Promise<string>((r) => {
      resolveWork = r;
    });
    const raced = raceWithAbortSignal(work, controller.signal);
    controller.abort();
    await expect(raced).rejects.toMatchObject({ name: "AbortError" });
    // 晚到的结果被静默消费，不产生 unhandled rejection
    resolveWork("late");
  });

  it("work 先完成：正常返回，abort 监听被清理", async () => {
    const controller = new AbortController();
    await expect(
      raceWithAbortSignal(Promise.resolve("ok"), controller.signal),
    ).resolves.toBe("ok");
    controller.abort(); // 完成后再 abort 不应有任何影响
  });

  it("work 先失败：原始错误透传（不是 AbortError）", async () => {
    const controller = new AbortController();
    await expect(
      raceWithAbortSignal(
        Promise.reject(new Error("provider 500")),
        controller.signal,
      ),
    ).rejects.toThrow("provider 500");
  });

  it("abort 后 work 再失败：拒绝原因保持 AbortError，无 unhandled rejection", async () => {
    const controller = new AbortController();
    let rejectWork: (e: Error) => void = () => undefined;
    const work = new Promise<string>((_r, rej) => {
      rejectWork = rej;
    });
    const raced = raceWithAbortSignal(work, controller.signal);
    controller.abort();
    await expect(raced).rejects.toMatchObject({ name: "AbortError" });
    rejectWork(new Error("late failure"));
    // 给微任务队列一拍，若有 unhandled rejection 会让 jest 报错
    await new Promise((r) => setImmediate(r));
  });
});
