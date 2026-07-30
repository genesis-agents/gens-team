/**
 * S2 collect — 新源首采回捞窗口（resolveSourceSince）
 *
 * 背景（2026-07-30）：topic 级 since 由 S1 分三档算出（首轮 24h / 定时
 * lastRunAt-5min / 手动 30 天）。往一个已经跑了很久的 topic 里新加源时，该源套用
 * topic 当前窗口——定时档只有 5 分钟，新源存量内容一条都进不来。
 * 规则：source.lastFetchAt 为空 → 用 90 天窗口回捞一次。
 */
import { resolveSourceSince } from "../s2-collect.stage";
import { RADAR_FIRST_COLLECTION_LOOKBACK_MS } from "../../../../runtime/radar.constants";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("resolveSourceSince", () => {
  it("老源（lastFetchAt 有值）沿用 topic 级 since，不受首采窗口影响", () => {
    const topicSince = new Date(NOW.getTime() - 5 * 60 * 1000); // 定时档 5min
    expect(
      resolveSourceSince(
        { lastFetchAt: new Date("2026-07-29T00:00:00Z") },
        topicSince,
        NOW,
      ),
    ).toEqual(topicSince);
  });

  it("新源（lastFetchAt 为空）用 90 天回捞，而非 topic 的 5 分钟窗口", () => {
    const topicSince = new Date(NOW.getTime() - 5 * 60 * 1000);
    const since = resolveSourceSince({ lastFetchAt: null }, topicSince, NOW);
    expect(since).toEqual(
      new Date(NOW.getTime() - RADAR_FIRST_COLLECTION_LOOKBACK_MS),
    );
    // 落在 90 天前那一天（2026-05-01），而不是 5 分钟前
    expect(since.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("topic 窗口比首采窗口更早时取 topic 的，不缩小范围", () => {
    // 假想场景：首采窗口被调小 / topic 手动窗口被调到 180 天
    const topicSince = new Date(NOW.getTime() - 180 * DAY_MS);
    expect(resolveSourceSince({ lastFetchAt: null }, topicSince, NOW)).toEqual(
      topicSince,
    );
  });

  it("首轮 24h 档的新源同样被放宽到 90 天（首轮 topicSince 更晚）", () => {
    const topicSince = new Date(NOW.getTime() - DAY_MS);
    const since = resolveSourceSince({ lastFetchAt: null }, topicSince, NOW);
    expect(since.getTime()).toBeLessThan(topicSince.getTime());
  });

  it("90 天窗口仍是时间窗：更早的低频源不会因此被捞到", () => {
    // karpathy.bearblog.dev 最近一篇 2026-04-30，落在 2026-05-01 之外
    const topicSince = new Date(NOW.getTime() - DAY_MS);
    const since = resolveSourceSince({ lastFetchAt: null }, topicSince, NOW);
    const karpathyLatestPost = new Date("2026-04-30T23:50:33Z");
    expect(karpathyLatestPost.getTime()).toBeLessThan(since.getTime());
  });
});
