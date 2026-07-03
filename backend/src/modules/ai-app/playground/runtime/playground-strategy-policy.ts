/**
 * playground-strategy-policy.ts —— L3 W1 批 2c：playground 策略阈值 dual-read overlay
 *
 * 只覆盖"策略类"旋钮（影响产出质量的业务决策：minFindingsThreshold /
 * chapterToleranceRatio）；"安全网类"旋钮（liveness 看门狗 / 墙钟 / token cap）
 * 永不数据化——W3 变体提议器将获得改 PolicyConfig 的权力，系统不应能修改
 * 自己的保险丝（设计稿 §七）。
 *
 * 形态：researcher.agent 的 validateBusinessRules 是框架 finalize 同步校验
 * （不能 await、无 ctx 参数），故不做 per-call resolve，而是 mission 启动时
 * （dispatcher.runMission 起点，async + DI 可用）刷新一次模块级 overlay 快照；
 * 同步消费方读 getPlaygroundStrategyThresholds()（overlay 叠加在 env/profile
 * 加载结果之上）。overlay 为空 = 行为逐字节等同现状（零下降）。
 *
 * mission 内一致性（2026-07-03 深度检视修复）：快照是模块级共享的，调用方
 * （playground.pipeline）只在无在跑 mission 的静默时刻刷新——忙时跳过，
 * 保证在跑 mission 的阈值不中途变化；代价是新 activate 延迟到下一个静默
 * 启动才生效（人工激活低频，可接受）。
 */

import { Logger } from "@nestjs/common";
import { z } from "zod";
import type { PolicyConfigService } from "@/modules/platform/facade";
import { loadPlaygroundRuntimeConfig } from "./playground-runtime.config";

export const PLAYGROUND_STRATEGY_POLICY_KEY =
  "playground.threshold.runtime-strategy";

/** DB overlay 允许只覆盖部分旋钮；未覆盖的回 env/profile 值 */
const StrategyOverlaySchema = z.object({
  minFindingsThreshold: z.number().int().min(0).optional(),
  chapterToleranceRatio: z.number().min(0).max(1).optional(),
});

export type PlaygroundStrategyOverlay = z.infer<typeof StrategyOverlaySchema>;

export interface PlaygroundStrategyThresholds {
  minFindingsThreshold: number;
  chapterToleranceRatio: number;
}

const logger = new Logger("PlaygroundStrategyPolicy");

// 模块级快照：仅 refreshPlaygroundStrategyOverlay 写入（mission 启动时序），
// 测试用 __reset 防跨用例污染（Claude Code 反向洞察 #8）
let overlay: PlaygroundStrategyOverlay | null = null;

/**
 * 同步读取策略阈值：DB overlay（若 mission 启动时已刷到）叠加在
 * loadPlaygroundRuntimeConfig()（DEFAULTS → tuning profile → env）之上。
 */
export function getPlaygroundStrategyThresholds(): PlaygroundStrategyThresholds {
  const base = loadPlaygroundRuntimeConfig();
  return {
    minFindingsThreshold:
      overlay?.minFindingsThreshold ?? base.minFindingsThreshold,
    chapterToleranceRatio:
      overlay?.chapterToleranceRatio ?? base.chapterToleranceRatio,
  };
}

/**
 * mission 启动时刷新 overlay。DB 无 active 行 / flag 未含 playground /
 * value 形状非法 → overlay 清空（纯 env/profile 现状）。
 */
export async function refreshPlaygroundStrategyOverlay(
  policyConfig: PolicyConfigService,
): Promise<void> {
  const resolution =
    await policyConfig.resolve<PlaygroundStrategyOverlay | null>(
      PLAYGROUND_STRATEGY_POLICY_KEY,
      null,
    );
  if (resolution.source === "code" || resolution.value == null) {
    overlay = null;
    return;
  }
  const parsed = StrategyOverlaySchema.safeParse(resolution.value);
  if (!parsed.success) {
    logger.warn(
      `Policy "${PLAYGROUND_STRATEGY_POLICY_KEY}" v${resolution.version} ` +
        `value malformed, keeping env/profile values: ${parsed.error.message}`,
    );
    overlay = null;
    return;
  }
  overlay = parsed.data;
  logger.log(
    `Strategy overlay active (v${resolution.version}): ` +
      JSON.stringify(parsed.data),
  );
}

/** 测试专用：重置模块级快照，防跨用例状态污染 */
export function __resetPlaygroundStrategyOverlayForTest(): void {
  overlay = null;
}
