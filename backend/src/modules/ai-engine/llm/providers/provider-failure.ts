/**
 * Provider typed failure 分类 — L3-W0 造尺子（2026-07-02）
 *
 * 背景：上游（harness react-loop / model-fallback）此前只能靠 provider 错误
 * **消息文案 regex** 推断失败类型，已因 xAI/OpenAI 文案差异修过两次
 * （2026-05-01 mission b791054e / 9a3144fc）。文案是 provider 随时会改的
 * UI 字符串，不是契约；structured 信号（HTTP status + provider error code）
 * 才是。失败分类的准确性是 FailureLearner / self-heal 等学习机制的输入地基。
 *
 * 本文件基于既有 {@link extractErrorSignal}（严格：只认 e.status /
 * e.response.status 数字 + 按 provider 形态取 error code，拒绝 message 嗅探）
 * 做失败种类判定。**双轨约定**：返回 null = 无结构化信号（错误对象已被中间层
 * 剥掉 axios 形状等），调用方必须回落既有 regex 路径——本分类器只增强、
 * 不替代，行为零下降。
 */

import {
  extractErrorSignal,
  type ErrorSignal,
} from "../models/capability/error-signal.types";

/** 失败种类 —— 与 harness 侧 fallbackReason 语义对齐的最小集合 */
export type ProviderFailureKind =
  | "quota_exceeded" // 账户配额/余额耗尽（不应自动跨 provider 重试）
  | "rate_limit" // 瞬态限流（有界退避重试）
  | "model_not_found" // 模型 ID 不存在/无权访问
  | "context_too_long" // 输入超上下文窗口
  | "auth" // key 无效/权限不足
  | "server_error"; // provider 5xx/过载

/** errorCode 中判定"配额/计费耗尽"的结构化关键词（provider 官方 code，非文案） */
const QUOTA_CODES =
  /insufficient_quota|billing_hard_limit|billing_not_active|insufficient[_-]?(credit|balance)|quota[_-]?exceeded|RESOURCE_EXHAUSTED_BILLING/i;

/** errorCode 中判定"模型不存在"的结构化关键词 */
const MODEL_NOT_FOUND_CODES = /model_not_found|model_decommissioned|NOT_FOUND/i;

/** errorCode / bodySnippet 中判定"上下文超长"的结构化关键词 */
const CONTEXT_CODES =
  /context_length_exceeded|max_tokens_exceeded|string_above_max_length|request_too_large/i;

/**
 * 按结构化信号分类 provider 失败。
 *
 * @returns 分类结果；null = 无结构化信号或无法判定，**调用方必须回落 regex 路径**
 */
export function classifyProviderFailure(
  err: unknown,
): { kind: ProviderFailureKind; signal: ErrorSignal } | null {
  const signal = extractErrorSignal(err);
  if (!signal) return null;
  const kind = classifySignal(signal);
  return kind ? { kind, signal } : null;
}

function classifySignal(sig: ErrorSignal): ProviderFailureKind | null {
  const { httpStatus, errorCode, bodySnippet } = sig;

  // 402 Payment Required —— 无歧义的配额信号
  if (httpStatus === 402) return "quota_exceeded";

  // 429：先分"配额耗尽"（OpenAI insufficient_quota 走 429）再归瞬态限流
  if (httpStatus === 429) {
    if (QUOTA_CODES.test(errorCode) || QUOTA_CODES.test(bodySnippet)) {
      return "quota_exceeded";
    }
    return "rate_limit";
  }

  // 401/403：key 无效/权限不足（403 里 billing 类归 quota）
  if (httpStatus === 401) return "auth";
  if (httpStatus === 403) {
    if (QUOTA_CODES.test(errorCode) || QUOTA_CODES.test(bodySnippet)) {
      return "quota_exceeded";
    }
    return "auth";
  }

  // 404：chat completion 端点上的 404 实践上即"模型不存在"
  //（xAI 对错误 model id 返回 404 "requested resource was not found"）
  if (httpStatus === 404) return "model_not_found";

  // 4xx 中的结构化子类
  if (httpStatus === 400 || httpStatus === 413 || httpStatus === 422) {
    if (CONTEXT_CODES.test(errorCode) || CONTEXT_CODES.test(bodySnippet)) {
      return "context_too_long";
    }
    if (MODEL_NOT_FOUND_CODES.test(errorCode)) return "model_not_found";
    // 其余 400 类（invalid_request 等）不在本分类集合 → 回落 regex
    return null;
  }

  // 5xx / Anthropic 529 overloaded
  if (httpStatus >= 500) return "server_error";

  return null;
}
