/**
 * abort-race.util — 让 in-flight LLM 调用对 AbortSignal 立即响应。
 *
 * 背景（2026-08-04 取消失效实证）：AiChatService 此前只在**派发前**检查
 * signal.aborted（fast-path），HTTP 请求本身不接收信号——一次长输出调用
 * （长报告 30K tokens / reasoning 超时 540-900s）期间用户取消，调用方要等
 * 它自然跑完才感知，mission 事件继续滚动数分钟，用户看到"取消无效"。
 *
 * 全链把 signal 穿进 5 个 provider caller 的长位置参数签名改动面过大，这里
 * 用 race 语义达到同等用户可见效果：signal 一拉，调用方立即收到 AbortError
 * 返回（与 fast-path 同款异常，failover 分类器已明确排除 abort 不重试）；
 * 底层 HTTP 在后台自然结束，结果丢弃——token 成本与"等它跑完"完全相同，
 * 不多花一分钱，计费在后台照常入账。
 */

/**
 * 把 work 与 signal race：signal abort 时立即以 DOMException("AbortError")
 * 拒绝。work 稍后 settle 时结果被静默消费（防 unhandled rejection）。
 * 无 signal 时零开销直接返回原 promise。
 */
export function raceWithAbortSignal<T>(
  work: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return work;
  const abortError = (): DOMException =>
    new DOMException("AiChatService.chat aborted", "AbortError");
  if (signal.aborted) {
    work.catch(() => undefined);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      // 后台完成/失败都吞掉：调用方已按 abort 收尾，晚到的结果无人消费
      work.catch(() => undefined);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
