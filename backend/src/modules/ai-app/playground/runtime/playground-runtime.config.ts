/**
 * playground-runtime.config.ts —— Typed runtime tunables for the
 * playground (mission pipeline).
 *
 * Replaces scattered `Number(process.env.X) || N` reads throughout
 * playground / ai-harness with a single Zod-validated config
 * loaded once at boot.
 *
 * Two consumer paths:
 *   1. NestJS DI — inject ConfigService and read via the registered
 *      namespace (preferred for services).
 *   2. Static utils / AgentSpec classes — call loadPlaygroundRuntimeConfig()
 *      directly. The same Zod schema is used; defaults are guaranteed
 *      consistent.
 *
 * All numeric env vars are parsed via parseNonNegativeIntEnv /
 * parsePositiveIntEnv to reject negatives and preserve "0" semantics.
 * All boolean flags are parsed via parseBooleanEnv (opt-in: undefined →
 * production-safe default).
 *
 * Design rule: defaults MUST match the corresponding constants in
 * `@/modules/ai-harness/evaluation/thresholds.constants` so frontier-model
 * behavior is unchanged when nothing is overridden.
 */

import { registerAs } from "@nestjs/config";
import { z } from "zod";
import {
  parseNonNegativeIntEnv,
  parsePositiveIntEnv,
} from "@/common/utils/schema-coercion.utils";
import {
  getProfileOverrides,
  parsePlaygroundTuningProfile,
  type PlaygroundTuningProfile,
} from "./playground-tuning-profile";

/**
 * Per-knob default. **Single source of truth** — both DI and non-DI
 * loaders read from this table. To change a default in production, edit
 * here. To override per-environment, set the env var.
 */
const DEFAULTS = {
  // — researcher floor (used by researcher.agent.ts + s3 stage) —
  /**
   * Minimum #findings a researcher must surface; below this triggers retry.
   * ★ 2026-05-22 (4→10)：实测 researcher 已用上 arxiv/industry-report 等多源工具，
   *   单 dim 拿到 20+ 条原始结果，却只蒸馏 4-5 条 finding 就停（LLM 只做到旧成功线 4）。
   *   章节数按"唯一来源/2"派生 → 4 findings = 永远 4 章。提高成功线，强制从充足的多源
   *   结果里抽更多 finding（→ 唯一来源↑ → 章节解除 4 封顶 → 证据/广度/评审分↑）。
   *   现已可满足（工具供给充足）；local 模型仍由 profile 降到 5（采集力弱）。
   * ★ 2026-05-23 (10→5)：10 作为**硬门槛**(reject finalize + 强制 +50% 预算重试) 时，
   *   LLM 蒸馏 plateau 在 4-8 → 反复 reject → 重试风暴 → max-iter 失败 → 维度降级
   *   (用户实测「持续低分 + 频繁兜底 + 推进极慢」)。"更多 finding → 更多章节 → 更高分"
   *   的目标改由 P2(解证据预算对章节数的夹逼) + P1-grade(evidence/breadth 轴改相对)正面
   *   达成，不再靠抬高这个脆弱硬门槛硬逼。floor=5 = 真·采集不足才 reject/retry。
   */
  minFindingsThreshold: 5,

  // — chapter integrity (used by per-dim-pipeline.util.ts) —
  /**
   * Max fraction of chapters allowed to be missing/dropped before the
   * dimension hard-fails. 0.3 = up to 30% missing tolerated.
   */
  chapterToleranceRatio: 0.3,

  /**
   * 章节「最低交付比例」：实际字数 / targetWordsPerChapter 低于此值即判欠交付
   * （打回重写；终局仍不足则记为不合格，不计入 qualified）。
   *
   * ★ 2026-08-03（用户实证 + 换模型复盘）：这个旋钮存在的理由是**输出长度不能靠
   * 提示词措辞保证，只能靠测量+强制**。历史上写手提示词说"建议区间下限 0.7×、
   * 不是硬约束、低于 800 字也不会被打回"，而闸门在 0.4× 才触发 —— DeepSeek 因
   * 天然铺陈从不触碰，看起来一切正常；换成照做型模型后，它精确交付提示词里印着
   * 的那个下限（生产实测多章 612 = round(874 × 0.7)）。同一份代码、同一份提示词，
   * 换个模型就从"好"变成"系统性欠交付 30%"。
   *
   * 所以判定线必须是**唯一的、被真正执行的**那个数：写手提示词印它、reviewer
   * 按它给分、闸门按它打回、记账按它判合格 —— 四处同一个值（见
   * chapter-pipeline.helper 的 minDeliveryWords，一次计算向下传）。
   *
   * 按模型档位自适应见 playground-tuning-profile.ts：弱模型撑不住长文，硬卡会
   * 变成重写风暴（minFindingsThreshold 10→5 就是这个教训），故 local 档放宽。
   */
  chapterMinDeliveryRatio: 0.75,

  // ★ 2026-05-22 follow-up：原 7 个 loop-control 旋钮(researcherMaxIterations /
  //   HardCap / WallTimeMs / chapterWriterInternalMaxIterations /
  //   chapterMaxRevisionAttempts / missionWriterMaxAttempts / reactMaxFinalizeRejects)
  //   已删除——config 定义了但**生产代码零消费**(真实消费方读 thresholds.constants.ts
  //   硬编码常量),profile 设了也静默无效。删除消除"定义即承诺生效"的腐朽误导。
  //   如需让 loop 上限可调,应改 thresholds 消费方读 config(单独 feature,非本轮)。

  // — liveness guard (used by playground.module.ts) —
  /**
   * Mission considered stalled after N minutes of inactivity (watchdog).
   * Production default 15min preserves clean-main behavior; local models
   * override upward via PLAYGROUND_STALE_THRESHOLD_MIN.
   */
  staleThresholdMin: 15,
  /**
   * Soft warning threshold for stale mission (before hard-kill).
   * Production default 20min preserves clean-main behavior.
   */
  softWarnThresholdMin: 20,
  /**
   * LivenessGuard 的 namespace 级墙钟硬上限（ms）。0 = 不限（交给进度检测 +
   * 每-mission 档位墙钟）。
   *
   * ★ 2026-06-11 由 4h 降为 0（不限）。原因：
   *   1. 4h 是 namespace 单值，但每个 mission 自己的墙钟上限按档位是 3h/10h/**24h**
   *      （DEPTH_BUDGET_TIERS，in-shell wallTimer 强制），4h 的 guard 会把合理的
   *      深度长程任务在 4h 误杀（用户实证反馈："很多长程任务超过 4h"）。
   *   2. "按时长杀"本就是钝器——真正该检测的是"无前进进度"。心跳改为跟随真实进度后
   *      （hasRecentEvent 门控），卡死 mission 由"心跳 AND 事件双 stale>15min"在
   *      ~18min 内回收，不再依赖墙钟。
   *   绝对成本兜底仍由每-mission in-shell wallTimer（档位 3h/10h/24h）把守。
   */
  wallTimeCapMs: 0,

  /**
   * no-progress thrash 检测：effective-age 达到 graceMin 后才武装（min）。
   */
  noProgressGraceMin: 20,
  /**
   * no-progress thrash 检测：lastCompletedStage 冻结而 spend 仍涨超过此分钟即杀（min）。
   */
  noProgressKillMin: 15,
  /**
   * 绝对 spend 兜底（tokens）。0 = 不限（consumer coerce 为 Infinity）。
   */
  tokenCapUnits: 0,

  // ★ 2026-05-22 follow-up：原 disableBudgetAbort 已删除——同样 config 定义但零消费
  //   (生产代码从不读),profile 设 true 也无效,"防级联 abort"保护实际不存在。删除止误导。
} as const;

/**
 * Zod schema for the typed runtime config. Exported so consumers can
 * derive types via z.infer<typeof PlaygroundRuntimeConfigSchema>.
 */
export const PlaygroundRuntimeConfigSchema = z.object({
  minFindingsThreshold: z.number().int().min(0),
  chapterToleranceRatio: z.number().min(0).max(1),
  chapterMinDeliveryRatio: z.number().min(0).max(1),
  staleThresholdMin: z.number().int().min(1),
  softWarnThresholdMin: z.number().int().min(1),
  wallTimeCapMs: z.number().int().min(0),
  noProgressGraceMin: z.number().int().min(1),
  noProgressKillMin: z.number().int().min(1),
  tokenCapUnits: z.number().int().min(0),
});

export type PlaygroundRuntimeConfig = z.infer<
  typeof PlaygroundRuntimeConfigSchema
>;

/**
 * Parse a ratio-style env var ("0.4" / "0.0" / etc.) into a [0,1] number,
 * falling back to the default on parse failure or out-of-range.
 */
function parseRatioEnv(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined || raw === null) return defaultValue;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || n > 1) return defaultValue;
  return n;
}

/**
 * Read env, parse + validate, return a fully populated typed config.
 *
 * Precedence:
 *   1. DEFAULTS (frontier-model production baseline) provide the starting point.
 *   2. The named tuning profile (`PLAYGROUND_TUNING_PROFILE`) overlays its
 *      profile-specific defaults — see playground-tuning-profile.ts.
 *   3. Individual env vars (MIN_FINDINGS_THRESHOLD etc.) override on top
 *      of the profile, allowing per-knob deviation from the profile baseline.
 *
 * The returned object includes `_profile` metadata so consumers can log
 * which posture the mission is running under.
 *
 * Throws via Zod if the parsed object would violate the schema — defensive
 * guard against a bug in the parser helpers above. In normal use, the
 * parser helpers always produce a value satisfying the schema.
 */
export function loadPlaygroundRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PlaygroundRuntimeConfig {
  const profile: PlaygroundTuningProfile = parsePlaygroundTuningProfile(
    env.PLAYGROUND_TUNING_PROFILE,
  );
  const profileOverrides = getProfileOverrides(profile);
  const baseline = { ...DEFAULTS, ...profileOverrides };

  const raw = {
    minFindingsThreshold: parseNonNegativeIntEnv(
      env.MIN_FINDINGS_THRESHOLD,
      baseline.minFindingsThreshold,
    ),
    chapterToleranceRatio: parseRatioEnv(
      env.CHAPTER_TOLERANCE_RATIO,
      baseline.chapterToleranceRatio,
    ),
    chapterMinDeliveryRatio: parseRatioEnv(
      env.CHAPTER_MIN_DELIVERY_RATIO,
      baseline.chapterMinDeliveryRatio,
    ),
    staleThresholdMin: parsePositiveIntEnv(
      env.PLAYGROUND_STALE_THRESHOLD_MIN,
      baseline.staleThresholdMin,
    ),
    softWarnThresholdMin: parsePositiveIntEnv(
      env.PLAYGROUND_SOFT_WARN_THRESHOLD_MIN,
      baseline.softWarnThresholdMin,
    ),
    wallTimeCapMs: parseNonNegativeIntEnv(
      env.PLAYGROUND_WALL_TIME_CAP_MS,
      baseline.wallTimeCapMs,
    ),
    noProgressGraceMin: parsePositiveIntEnv(
      env.PLAYGROUND_NO_PROGRESS_GRACE_MIN,
      baseline.noProgressGraceMin,
    ),
    noProgressKillMin: parsePositiveIntEnv(
      env.PLAYGROUND_NO_PROGRESS_KILL_MIN,
      baseline.noProgressKillMin,
    ),
    tokenCapUnits: parseNonNegativeIntEnv(
      env.PLAYGROUND_TOKEN_CAP_UNITS,
      baseline.tokenCapUnits,
    ),
  };

  // Cross-field invariants
  if (raw.softWarnThresholdMin < raw.staleThresholdMin) {
    raw.softWarnThresholdMin = raw.staleThresholdMin;
  }

  return PlaygroundRuntimeConfigSchema.parse(raw);
}

/**
 * Sibling helper that also surfaces which profile was selected. Useful for
 * boot-time logging and ops dashboards. Kept separate so consumers reading
 * a single tunable don't pay the cost of profile resolution metadata.
 */
export function loadPlaygroundRuntimeConfigWithProfile(
  env: NodeJS.ProcessEnv = process.env,
): { config: PlaygroundRuntimeConfig; profile: PlaygroundTuningProfile } {
  const profile = parsePlaygroundTuningProfile(env.PLAYGROUND_TUNING_PROFILE);
  return { config: loadPlaygroundRuntimeConfig(env), profile };
}

/**
 * NestJS @nestjs/config namespace. Inject in services as:
 *
 *   constructor(
 *     @Inject(playgroundRuntimeConfig.KEY)
 *     private readonly config: ConfigType<typeof playgroundRuntimeConfig>,
 *   ) {}
 *
 * Module wiring: `ConfigModule.forFeature(playgroundRuntimeConfig)`.
 */
export const playgroundRuntimeConfig = registerAs<PlaygroundRuntimeConfig>(
  "playgroundRuntime",
  () => loadPlaygroundRuntimeConfig(),
);
