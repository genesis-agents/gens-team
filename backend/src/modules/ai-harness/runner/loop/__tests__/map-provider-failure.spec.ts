/**
 * mapProviderFailure 回归锁（深度检视修复 2026-07-03）：
 * b791054e 语义——quota/billing 真因永远不被 typed 模糊判定（auth/server_error/
 * rate_limit）掩盖；typed 精确判定（quota/model/context）不受文案干扰。
 */

import { mapProviderFailure } from "../provider-failure-mapping";

type Typed = Parameters<typeof mapProviderFailure>[0];

const typed = (kind: NonNullable<Typed>["kind"]): Typed => ({ kind }) as Typed;

describe("mapProviderFailure", () => {
  describe("typed 精确判定直通", () => {
    it("quota_exceeded → PROVIDER_QUOTA_EXCEEDED", () => {
      expect(mapProviderFailure(typed("quota_exceeded"), "whatever")).toEqual({
        failureCode: "PROVIDER_QUOTA_EXCEEDED",
        fallbackReason: "byok_quota_exceeded",
      });
    });

    it("model_not_found 不被 quota 文案干扰", () => {
      expect(
        mapProviderFailure(typed("model_not_found"), "insufficient quota"),
      ).toEqual({
        failureCode: "PROVIDER_BYOK_MODEL_NOT_FOUND",
        fallbackReason: "model_not_found",
      });
    });

    it("context_too_long 直通", () => {
      expect(mapProviderFailure(typed("context_too_long"), "x")).toEqual({
        failureCode: "PROVIDER_TRUNCATED",
        fallbackReason: "context_too_long",
      });
    });
  });

  describe("quota 文案对 typed 模糊判定的最高优先级 refinement（b791054e 回归锁）", () => {
    it("BYOK QuotaExceededError 经 403 被 typed 归 auth 时，quota 文案纠正为 QUOTA", () => {
      expect(
        mapProviderFailure(
          typed("auth"),
          "BYOK key quota exceeded: You exceeded your current quota, please check your plan and billing details",
        ),
      ).toEqual({
        failureCode: "PROVIDER_QUOTA_EXCEEDED",
        fallbackReason: "byok_quota_exceeded",
      });
    });

    it("代理 429 + Insufficient balance（带空格）被 typed 归 rate_limit 时纠正为 QUOTA", () => {
      expect(
        mapProviderFailure(
          typed("rate_limit"),
          "Insufficient balance, please top up",
        ),
      ).toEqual({
        failureCode: "PROVIDER_QUOTA_EXCEEDED",
        fallbackReason: "byok_quota_exceeded",
      });
    });

    it("server_error + billing details 文案纠正为 QUOTA", () => {
      expect(
        mapProviderFailure(typed("server_error"), "check billing details"),
      ).toEqual({
        failureCode: "PROVIDER_QUOTA_EXCEEDED",
        fallbackReason: "byok_quota_exceeded",
      });
    });

    it("auth + cooldown 文案归 rate_limit（瞬态退避而非 outage）", () => {
      expect(
        mapProviderFailure(
          typed("auth"),
          "Provider deepseek in cooldown, 30s remaining",
        ),
      ).toEqual({
        failureCode: "PROVIDER_RATE_LIMIT",
        fallbackReason: "rate_limit",
      });
    });

    it("纯 auth 无特殊文案保持默认 API_ERROR/outage（语义面不变）", () => {
      expect(mapProviderFailure(typed("auth"), "invalid api key")).toEqual({
        failureCode: "PROVIDER_API_ERROR",
        fallbackReason: "outage",
      });
    });
  });

  describe("typed 拿不到时旧 regex 链零下降", () => {
    it.each([
      ["insufficient_quota", "PROVIDER_QUOTA_EXCEEDED"],
      [
        "You exceeded your current quota, check billing details",
        "PROVIDER_QUOTA_EXCEEDED",
      ],
      ["insufficient balance", "PROVIDER_QUOTA_EXCEEDED"],
      ["payment required", "PROVIDER_QUOTA_EXCEEDED"],
      ["429 too many requests", "PROVIDER_RATE_LIMIT"],
      ["provider in cooldown", "PROVIDER_RATE_LIMIT"],
      ["The requested resource was not found", "PROVIDER_BYOK_MODEL_NOT_FOUND"],
      ["maximum context length exceeded", "PROVIDER_TRUNCATED"],
      ["random unknown error", "PROVIDER_API_ERROR"],
    ])("%s → %s", (message, expected) => {
      expect(mapProviderFailure(null, message).failureCode).toBe(expected);
    });
  });
});
