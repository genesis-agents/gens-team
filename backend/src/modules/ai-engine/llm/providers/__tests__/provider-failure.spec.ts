/**
 * provider-failure 分类器测试 — L3-W0 typed error 归一化（2026-07-02）
 *
 * 契约：
 *   - 只认结构化信号（HTTP status + provider error code），不嗅探 message
 *   - 无结构化信号（纯 message Error）→ null，调用方回落 regex
 *   - 429 先分配额耗尽（OpenAI insufficient_quota）再归瞬态限流
 */
import { classifyProviderFailure } from "../provider-failure";

function axiosLike(
  status: number,
  data?: unknown,
  url = "https://api.openai.com/v1/chat/completions",
) {
  return {
    message: `Request failed with status code ${status}`,
    response: { status, data },
    config: { url },
  };
}

describe("classifyProviderFailure", () => {
  it("returns null for plain message-only Error (no structured signal)", () => {
    expect(
      classifyProviderFailure(new Error("You exceeded your current quota")),
    ).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(classifyProviderFailure(null)).toBeNull();
    expect(classifyProviderFailure(undefined)).toBeNull();
  });

  it("classifies 402 as quota_exceeded", () => {
    const r = classifyProviderFailure(axiosLike(402));
    expect(r?.kind).toBe("quota_exceeded");
  });

  it("classifies 429 + insufficient_quota code as quota_exceeded (OpenAI billing)", () => {
    const r = classifyProviderFailure(
      axiosLike(429, {
        error: {
          code: "insufficient_quota",
          type: "insufficient_quota",
          message:
            "You exceeded your current quota, please check your plan and billing details.",
        },
      }),
    );
    expect(r?.kind).toBe("quota_exceeded");
    expect(r?.signal.errorCode).toBe("insufficient_quota");
  });

  it("classifies plain 429 as rate_limit", () => {
    const r = classifyProviderFailure(
      axiosLike(429, {
        error: { code: "rate_limit_exceeded", type: "requests" },
      }),
    );
    expect(r?.kind).toBe("rate_limit");
  });

  it("classifies 401 as auth", () => {
    const r = classifyProviderFailure(
      axiosLike(401, {
        error: { code: "invalid_api_key", type: "invalid_request_error" },
      }),
    );
    expect(r?.kind).toBe("auth");
  });

  it("classifies 403 with billing evidence as quota_exceeded", () => {
    const r = classifyProviderFailure(
      axiosLike(403, {
        error: { code: "billing_hard_limit_reached", type: "billing" },
      }),
    );
    expect(r?.kind).toBe("quota_exceeded");
  });

  it("classifies 404 as model_not_found (xAI wrong model id shape)", () => {
    // xAI 对错误 model id 返回 404 "The requested resource was not found"
    // （文案不含 model 字样，regex 曾漏判 — 2026-05-01 mission 9a3144fc）
    const r = classifyProviderFailure(
      axiosLike(
        404,
        { error: { code: "not_found", type: "invalid_request_error" } },
        "https://api.x.ai/v1/chat/completions",
      ),
    );
    expect(r?.kind).toBe("model_not_found");
  });

  it("classifies 400 + context_length_exceeded as context_too_long", () => {
    const r = classifyProviderFailure(
      axiosLike(400, {
        error: {
          code: "context_length_exceeded",
          type: "invalid_request_error",
        },
      }),
    );
    expect(r?.kind).toBe("context_too_long");
  });

  it("returns null for generic 400 invalid_request (caller falls back to regex)", () => {
    const r = classifyProviderFailure(
      axiosLike(400, {
        error: { code: "invalid_value", type: "invalid_request_error" },
      }),
    );
    expect(r).toBeNull();
  });

  it("classifies 500 and 529 (Anthropic overloaded) as server_error", () => {
    expect(classifyProviderFailure(axiosLike(500))?.kind).toBe("server_error");
    expect(
      classifyProviderFailure(
        axiosLike(
          529,
          { error: { type: "overloaded_error", message: "Overloaded" } },
          "https://api.anthropic.com/v1/messages",
        ),
      )?.kind,
    ).toBe("server_error");
  });

  it("accepts top-level e.status shape (fetch-like)", () => {
    const r = classifyProviderFailure({ status: 429, message: "429" });
    expect(r?.kind).toBe("rate_limit");
  });
});
