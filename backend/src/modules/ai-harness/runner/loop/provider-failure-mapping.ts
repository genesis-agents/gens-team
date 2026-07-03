/**
 * provider 异常 → (failureCode, fallbackReason) 映射（纯函数，从 react-loop
 * 抽出以便独立测试 + 遵守 god-class size guard）。
 *
 * ★ 2026-05-01 (mission b791054e 真因)：quota/billing 错误必须独立编码 —
 *   OpenAI insufficient_quota 文案是"You exceeded your current quota,
 *   please check your plan and billing details" — 不含 "rate limit" / "429"，
 *   原本兜底成 PROVIDER_API_ERROR + "Agent 内部错误"，掩盖了"账户余额耗尽"
 *   这一关键真因。优先级最高（先于 rate_limit 判断）。
 * ★ L3-W0 typed error 归一化（2026-07-02）：优先按结构化信号（HTTP status +
 *   provider error code）分类，消息文案 regex 降为兜底——文案已因 xAI/OpenAI
 *   差异修过两次，且它是 FailureLearner 等学习机制的输入地基。typed 拿不到
 *   （错误对象被中间层剥掉 axios 形状）时走既有 regex 链，行为零下降。
 * ★ 深度检视修复（2026-07-03）：quota 文案 regex 保持对 typed 模糊判定的最高
 *   优先级 refinement——BYOK QuotaExceededError 经 HttpException 后 status=403
 *   被 typed 归为 auth（默认 PROVIDER_API_ERROR）、代理 429 + "Insufficient
 *   balance" body 被归为 rate_limit，都会重演 b791054e"掩盖账户余额耗尽真因"。
 *   仅 auth/server_error/rate_limit 三类模糊判定让位于文案证据；typed 的
 *   quota/model/context 精确判定不动。
 */

import type { HarnessFailureCode } from "../../agents/abstractions";
import type { classifyProviderFailure } from "@/modules/ai-engine/llm/providers/provider-failure";

const QUOTA_MESSAGE_RE =
  /(insufficient[_\s-]?quota|exceeded[_\s\w]*quota|quota[_\s\w]*exceed|billing[_\s\w]*details|insufficient[_\s\w]*credit|insufficient[_\s\w]*balance|payment\s+required)/i;

export interface MappedProviderFailure {
  failureCode: HarnessFailureCode;
  fallbackReason:
    | "rate_limit"
    | "model_not_found"
    | "context_too_long"
    | "outage"
    | "byok_quota_exceeded";
}

export function mapProviderFailure(
  typedFailure: ReturnType<typeof classifyProviderFailure>,
  message: string,
): MappedProviderFailure {
  let failureCode: HarnessFailureCode = "PROVIDER_API_ERROR";
  let fallbackReason: MappedProviderFailure["fallbackReason"] = "outage";
  if (typedFailure) {
    switch (typedFailure.kind) {
      case "quota_exceeded":
        failureCode = "PROVIDER_QUOTA_EXCEEDED";
        fallbackReason = "byok_quota_exceeded";
        break;
      case "rate_limit":
        failureCode = "PROVIDER_RATE_LIMIT";
        fallbackReason = "rate_limit";
        break;
      case "model_not_found":
        failureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
        fallbackReason = "model_not_found";
        break;
      case "context_too_long":
        failureCode = "PROVIDER_TRUNCATED";
        fallbackReason = "context_too_long";
        break;
      case "auth":
      case "server_error":
        // 既有 regex 链无对应细分（历史归 PROVIDER_API_ERROR/outage），
        // 保持默认值不变——只提精度不改语义面
        break;
    }
    if (
      (typedFailure.kind === "auth" ||
        typedFailure.kind === "server_error" ||
        typedFailure.kind === "rate_limit") &&
      QUOTA_MESSAGE_RE.test(message)
    ) {
      failureCode = "PROVIDER_QUOTA_EXCEEDED";
      // ★ BYOK 单源原则：不自动跨 provider 切换，让用户去续费或申请 admin
      //   批 KeyAssignment（也属 BYOK）。
      fallbackReason = "byok_quota_exceeded";
    } else if (
      (typedFailure.kind === "auth" || typedFailure.kind === "server_error") &&
      /cooldown|temporarily unavailable/i.test(message)
    ) {
      // ProviderCooldownError（403 形态）是瞬态——对齐旧 regex 链语义，
      // 归 rate_limit 走有界退避重试而非 outage
      failureCode = "PROVIDER_RATE_LIMIT";
      fallbackReason = "rate_limit";
    }
  } else if (QUOTA_MESSAGE_RE.test(message)) {
    failureCode = "PROVIDER_QUOTA_EXCEEDED";
    fallbackReason = "byok_quota_exceeded";
  } else if (/rate.?limit|429|too many requests/i.test(message)) {
    failureCode = "PROVIDER_RATE_LIMIT";
    fallbackReason = "rate_limit";
  } else if (
    // ★ 2026-05-22：provider cooldown 短路（ProviderCooldownError）是瞬态，
    //   归为 rate_limit 让 suggestFallback 返回 retry → 走有界退避重试。
    /cooldown|temporarily unavailable/i.test(message)
  ) {
    failureCode = "PROVIDER_RATE_LIMIT";
    fallbackReason = "rate_limit";
  } else if (
    // ★ 2026-05-01 (mission 9a3144fc 实证)：xAI grok 模型 ID 错误返回
    //   "The requested resource was not found"，不含 "model" / "invalid model"，
    //   原 regex 漏判。补 INVALID_MODEL / requested resource / docs\.x\.ai / openai 404 等。
    /model.*not.*found|invalid[_\s-]?model|model_not_found|requested\s+resource\s+(was\s+)?not\s+found|docs\.x\.ai|model.*does.*not.*exist|404\b/i.test(
      message,
    )
  ) {
    failureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
    fallbackReason = "model_not_found";
  } else if (/context.*length|too long|maximum context/i.test(message)) {
    failureCode = "PROVIDER_TRUNCATED";
    fallbackReason = "context_too_long";
  }
  return { failureCode, fallbackReason };
}
