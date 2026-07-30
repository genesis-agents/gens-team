/**
 * AI Radar 模块常量
 *
 * 注册 ID / event name / 默认值，避免散落字符串。
 */

export const RADAR_TEAM_ID = "ai-radar";
export const RADAR_MODULE_NAME = "ai-app.radar";

/**
 * Agent role id（与 SKILL.md frontmatter `id` 对齐，PR-R3 引入）。
 */
export const RADAR_ROLE_IDS = {
  SOURCE_CURATOR: "ai-radar.source-curator",
  RELEVANCE_JUDGE: "ai-radar.relevance-judge",
  QUALITY_RATER: "ai-radar.quality-rater",
  ENTITY_EXTRACTOR: "ai-radar.entity-extractor",
  SIGNAL_ANALYST: "ai-radar.signal-analyst",
} as const;

/**
 * Event 名（EventBus 发布，PR-R4 接入 ws gateway）。
 */
/**
 * radar.* event types —— 与 ai-radar Socket.IO namespace + roomPrefix='radar'
 * 对接。所有 type 必须在 radar.events.ts 通过 EventRegistry 注册 zod
 * schema，否则 EventBus 会 drop+warn。
 */
export const RADAR_EVENTS = {
  RUN_STARTED: "ai-radar.run.started",
  RUN_STAGE: "ai-radar.run.stage",
  /** 细粒度：单个采集源完成（实时进度，对齐 playground 事件流粒度） */
  RUN_SOURCE_PROGRESS: "ai-radar.run.source-progress",
  RUN_COMPLETED: "ai-radar.run.completed",
  RUN_FAILED: "ai-radar.run.failed",
  RUN_CANCELLED: "ai-radar.run.cancelled",
  /** budget 预检 / framework 拒绝（2026-05-17 R4 闭环 markRejected 调用链） */
  RUN_REJECTED: "ai-radar.run.rejected",
  INSIGHT_CREATED: "ai-radar.insight.created",
  SOURCE_HEALTH_CHANGED: "ai-radar.source.health-changed",
} as const;

/**
 * 默认刷新 cron 表达式：每 6 小时。
 */
export const DEFAULT_REFRESH_CRON = "0 */6 * * *";

/**
 * 调度策略默认值（PR-R4 接入 scheduler 时使用）。
 */
export const RADAR_SCHEDULER_DEFAULTS = {
  /** 单 user 同时 RUNNING 的 run 上限 */
  perUserConcurrencyLimit: 3,
  /** 全局 RUNNING 上限（防 LLM 暴账） */
  globalConcurrencyLimit: 20,
  /** 手动触发 dedup window（秒）—— 5s 内重复 POST 返回上一条 run */
  manualDedupSeconds: 5,
  /** 单 source 连续失败几次 → cooldown 24h */
  cooldownFailureThreshold: 5,
  /** scheduler 每轮扫描 due topic 的上限 */
  sweepBatchSize: 50,
} as const;

/**
 * Pipeline 默认参数（PR-R3 引入）。
 */
export const RADAR_PIPELINE_DEFAULTS = {
  /** 单 run hard cost cap (USD) */
  budgetUsdCap: 0.5,
  /** S4 relevance scoring batch size */
  relevanceBatchSize: 10,
  /** S4 阈值 —— 低于此分数不进入 S5/S6 */
  relevanceThreshold: 40,
  /** S5 quality scoring batch size */
  qualityBatchSize: 10,
  /** S6 entity extraction batch size */
  entityBatchSize: 8,
  /** Item 入选阈值（写 accepted=true） */
  acceptedRelevanceMin: 60,
  acceptedQualityMin: 50,
  /**
   * hybrid 匹配模式：字面命中关键词（标题+正文，子串大小写不敏感）的额外加分，
   * 上限 100。literal 模式则直接把未命中项判 0 分淘汰，不在此处加分。
   */
  literalMatchBoost: 20,
  /** 单 source 单次刷新最多拉多少条 */
  perSourceItemLimit: 20,
  /** S7 信号洞察的对照窗口（天） */
  insightLookbackDays: 7,
} as const;

/**
 * 新源首次采集的回捞窗口（2026-07-30）。
 *
 * 背景：topic 级 since 分三档（S1：首轮 24h / 定时 lastRunAt-5min / 手动 30 天），
 * 但那是按 **topic** 算的。往一个跑了很久的 topic 里新加一个源时，该源会直接套用
 * topic 当前的窗口——定时档只有 5 分钟，等于新源的存量内容一条都进不来，用户加完
 * 源看到 0 产出，无从判断是"源不对"还是"还没到时间"。
 *
 * 因此：source.lastFetchAt 为空（从未成功抓取过）时改用这个更长的窗口回捞一次，
 * 抓完 lastFetchAt 被 SourceHealthService 写上，后续自动回到 topic 级窗口。
 *
 * 注意这是**时间窗**而非条数窗：源在 90 天内没发过东西仍然是 0 产出（例如
 * karpathy.bearblog.dev 最近一篇是 2026-04-30，落在 90 天外）。真要覆盖这类
 * 低频源，得把窗口调大或改成"首次采集不按时间过滤、直接取 feed 最新 N 条"。
 * 改窗口只需动这一个常量。
 */
export const RADAR_FIRST_COLLECTION_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Item 实体抽取上限（防 LLM 输出爆炸）。
 */
export const RADAR_MAX_ENTITIES_PER_ITEM = 10;

/**
 * literal 匹配模式下未命中关键词的淘汰原因。S4 写入 relevanceScores，
 * S8 流失归因时识别此哨兵值并原样呈现（否则会回落到通用「相关性 0 < 40」）。
 */
export const RADAR_LITERAL_MISS_REASON = "未命中关键词（精确匹配）";
