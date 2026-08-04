/**
 * react-loop.envelope-dialects.spec.ts —— 信封方言**排列矩阵**
 *
 * 背景（2026-08-04）：`7105552cb`(2026-04-26) 把 normalizeAction 从「静默合成
 * 空 finalize」改成「畸形一律抛 InvalidActionError」。方向是对的——静默兜底
 * 把安全过滤器拒答 / 截断 / 缺字段全伪装成"模型主动交白卷"，直接触发
 * empty-finalize 熔断，绕过重试链。但它留下一笔债：**每一种模型方言都必须被
 * 显式容错**，否则整轮作废 + 灌一条假 critique。
 *
 * 而这些容错是一次生产事故补一条加上来的：
 *   f50b50d36 (05-07) toolId 写进 kind
 *   5e860b47b (08-03) actions 简写被泛化到 finalize
 *   6b813fcfd (08-03) parallel_tool_call 的 calls/actions 混用
 *   本次      (08-04) action 压平成 kind 字符串、载荷升顶层
 *
 * 四种同一类。**病根是协议本身给同一件事提供了多种写法**（顶层裸 kind /
 * actions 简写 / action 对象 / calls vs actions），模型混用完全可预期。
 *
 * 所以这个 spec 不再"一事一测"，而是**枚举排列矩阵**：
 *   轴 A 信封形态：canonical(action 对象) / bare(顶层裸 kind) / flat(action=kind 字符串)
 *   轴 B 并行数组键：calls / actions
 *   轴 C finalize 载荷位置：action.output / 顶层 actions[].output / 无信封裸对象
 * 任何一格挂掉 = 一个真实的生产方言缺口，而不是等它在生产里烧完一轮再来补。
 */

import { ReActLoop } from "../react-loop";
import { HookRegistry } from "../../../agents/core/hook-registry";
import { ContextEnvelope } from "../../../agents/core/context-envelope";
import { ToolInvoker } from "../../tool-invoker/tool-invoker";
import type {
  IAgentEvent,
  ILoopTerminationCriteria,
} from "../../../agents/abstractions";

function makeEnvelope(tools: string[] = []): ContextEnvelope {
  return new ContextEnvelope({
    system: "sys",
    messages: [{ role: "user", content: "go", timestamp: 0 }],
    reminders: [],
    tools,
    memory: { sessionId: "s1", userId: "u1" },
    budget: {
      tokensUsed: 0,
      tokensRemaining: 10_000,
      iterationsUsed: 0,
      iterationsRemaining: 10,
      wallTimeStartMs: Date.now(),
    },
  });
}

function mkChat(responses: string[]) {
  let i = 0;
  return {
    chat: jest.fn(async () => ({
      content: responses[i++] ?? responses[responses.length - 1],
      model: "mock",
      usage: { totalTokens: 10 },
    })),
  };
}

function mkToolRegistry(ids: string[]) {
  return {
    has: jest.fn((id: string) => ids.includes(id)),
    get: jest.fn((id: string) => ({
      id,
      execute: jest.fn(async () => ({
        success: true,
        data: `data-from-${id}`,
        metadata: {
          executionId: "x",
          startTime: new Date(),
          endTime: new Date(),
        },
      })),
    })),
  };
}

async function drain(iter: AsyncIterable<IAgentEvent>): Promise<IAgentEvent[]> {
  const out: IAgentEvent[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

const criteria: ILoopTerminationCriteria = {
  maxIterations: 5,
  terminateOn: ["finalize"],
};

const FINAL = JSON.stringify({
  thinking: "done",
  action: { kind: "finalize", output: "ok" },
});

/** 跑一轮，返回真正被 invoke 的 toolId 列表 + finalize 产物。 */
async function runDialect(first: string, tools: string[] = ["web-search"]) {
  const chat = mkChat([first, FINAL]);
  const reg = mkToolRegistry(tools);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoker = new ToolInvoker(reg as any);
  const spy = jest.spyOn(invoker, "invoke");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loop = new ReActLoop(chat as any, invoker, new HookRegistry());
  const events = await drain(
    loop.run(makeEnvelope(tools), criteria, { agentId: "dialect-test" }),
  );
  // invoke(action: IToolCallAction, ...) —— 第一参是 action 对象，取 toolId
  const invoked = spy.mock.calls.map(
    (c) => (c[0] as { toolId: string }).toolId,
  );
  // ★ 断言必须读 "output" 事件 —— 那才是**真正传给下游**的产物。
  //   action_executed.payload.action 是未经归一化的原始 decision，读它会把
  //   容错是否生效判断反（例如二次序列化的 output 在那里仍是字符串）。
  const outputs = events
    .filter((e) => e.type === "output")
    .map((e) => (e.payload as { output: unknown }).output);
  return { invoked, outputs, events };
}

const TC = (toolId: string) => ({ toolId, input: { q: "x" } });

// ============================================================================
// 轴 A × 轴 B：工具调用信封的三种形态 × 并行数组的两个键名
// ============================================================================

describe("信封方言矩阵 — 单个 tool_call", () => {
  it("A1 canonical: {thinking, action:{kind:tool_call,...}}", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: { kind: "tool_call", ...TC("web-search") },
      }),
    );
    expect(invoked).toEqual(["web-search"]);
  });

  it("A2 bare: 载荷裸放顶层 {kind:tool_call,...}（协议文本标为 WRONG，但已容错）", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({ kind: "tool_call", ...TC("web-search") }),
    );
    expect(invoked).toEqual(["web-search"]);
  });

  it("★ A3 flat: {action:'tool_call', toolId, input} —— action 退化成 kind 字符串", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: "tool_call",
        ...TC("web-search"),
      }),
    );
    expect(invoked).toEqual(["web-search"]);
  });
});

describe("信封方言矩阵 — parallel_tool_call（3 形态 × 2 键名）", () => {
  const calls = [TC("web-search"), TC("job-search")];
  const TOOLS = ["web-search", "job-search"];

  it("B1 canonical + calls", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: { kind: "parallel_tool_call", calls },
      }),
      TOOLS,
    );
    expect(invoked.sort()).toEqual(TOOLS.sort());
  });

  it("B2 canonical + actions（键名混用，6b813fcfd 已容错）", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: { kind: "parallel_tool_call", actions: calls },
      }),
      TOOLS,
    );
    expect(invoked.sort()).toEqual(TOOLS.sort());
  });

  it("B3 顶层 actions 简写（协议教的）", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({ thinking: "t", actions: calls }),
      TOOLS,
    );
    expect(invoked.sort()).toEqual(TOOLS.sort());
  });

  it("B4 bare + calls: {kind:parallel_tool_call, calls}", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({ kind: "parallel_tool_call", calls }),
      TOOLS,
    );
    expect(invoked.sort()).toEqual(TOOLS.sort());
  });

  it("★ B5 flat + calls: {action:'parallel_tool_call', calls} —— 生产实证形态", async () => {
    // researcher 81653316 iter=2：5 个工具调用参数齐全，被整份丢弃，
    // 然后灌了一条假 critique "dimension/findings/summary Required"
    const { invoked } = await runDialect(
      JSON.stringify({ thinking: "t", action: "parallel_tool_call", calls }),
      TOOLS,
    );
    expect(invoked.sort()).toEqual(TOOLS.sort());
  });

  // 反向验证实测：摘掉「action=kind 字符串」容错后本格**仍然绿** —— 它是被
  // 已有的顶层 `actions` 简写分支接住的，不是新容错的功劳。留着作为交叉覆盖
  // 证据：两条路径对同一形态给出同一结果，容错之间不打架。
  it("B6 flat + actions: 压平 × 键名混用同时发生（由顶层 actions 简写覆盖）", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: "parallel_tool_call",
        actions: calls,
      }),
      TOOLS,
    );
    expect(invoked.sort()).toEqual(TOOLS.sort());
  });
});

// ============================================================================
// 轴 C：finalize 载荷的位置
// ============================================================================

describe("信封方言矩阵 — finalize 载荷位置", () => {
  const payload = { dimension: "AI", findings: [{ a: 1 }], summary: "s" };

  it("C1 canonical: action.output", async () => {
    const { outputs } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: { kind: "finalize", output: payload },
      }),
    );
    expect(outputs.at(-1)).toEqual(payload);
  });

  it("C2 产物塞进顶层 actions[]（5e860b47b 已容错）", async () => {
    const { outputs } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: { kind: "finalize" },
        actions: [{ output: payload }],
      }),
    );
    expect(outputs.at(-1)).toEqual(payload);
  });

  it("C3 bare: {kind:finalize, output}", async () => {
    const { outputs } = await runDialect(
      JSON.stringify({ kind: "finalize", output: payload }),
    );
    expect(outputs.at(-1)).toEqual(payload);
  });

  it("C4 完全无信封：整个对象就是产物", async () => {
    const { outputs } = await runDialect(JSON.stringify(payload));
    expect(outputs.at(-1)).toEqual(payload);
  });

  it("★ C5 flat: {action:'finalize', output}", async () => {
    const { outputs } = await runDialect(
      JSON.stringify({ thinking: "t", action: "finalize", output: payload }),
    );
    expect(outputs.at(-1)).toEqual(payload);
  });

  it("C6 产物被**二次序列化**成 JSON 字符串（b2a25a37f 已容错）", async () => {
    const { outputs } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: { kind: "finalize", output: JSON.stringify(payload) },
      }),
    );
    expect(outputs.at(-1)).toEqual(payload);
  });
});

// ============================================================================
// 负向：容错**不得**吞掉真错误
// ============================================================================

describe("负向 — 容错边界", () => {
  it("action 是任意字符串（非协议 kind）→ 不猜，不路由任何工具", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: "please_search_the_web",
        toolId: "web-search",
        input: { q: "x" },
      }),
    );
    expect(invoked).toEqual([]);
  });

  it("action 是协议保留内部 kind 字符串 → 同样不放行", async () => {
    for (const reserved of ["skill_invoke", "subagent_spawn", "llm_generate"]) {
      const { invoked } = await runDialect(
        JSON.stringify({
          thinking: "t",
          action: reserved,
          toolId: "web-search",
          input: { q: "x" },
        }),
      );
      expect(invoked).toEqual([]);
    }
  });

  it("finalize.output 是非 JSON 的普通字符串 → 原样保留，不强解", async () => {
    const { outputs } = await runDialect(
      JSON.stringify({
        thinking: "t",
        action: { kind: "finalize", output: "just a sentence, not json" },
      }),
    );
    expect(outputs.at(-1)).toBe("just a sentence, not json");
  });
});

// ============================================================================
// ① 兜底 critique 必须说真话（不得把"信封畸形"说成"产物缺字段"）
// ============================================================================

describe("信封畸形时的 critique 语义", () => {
  // 构造一个**无法被任何容错救回**的信封畸形：action 是对象、kind 合法，
  // 但 parallel_tool_call 的数组里全是无效条目 → InvalidActionError。
  const MALFORMED = JSON.stringify({
    thinking: "I want to search",
    action: { kind: "parallel_tool_call", calls: [{ nope: 1 }, { nada: 2 }] },
  });

  async function runWithSchema() {
    const chat = mkChat([MALFORMED, FINAL]);
    const reg = mkToolRegistry(["web-search"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, new HookRegistry());
    // drain 只为把 loop 跑完；断言看的是注入下一轮的 critique（见下方 chat.mock.calls）
    await drain(
      loop.run(makeEnvelope(["web-search"]), criteria, {
        agentId: "critique-test",
        // 要求结构化产物 → raw 字符串必然被 schema 驳回，触发 critique 分支
        // 生产同款严格 schema：必须有 dimension/findings/summary。
        // 兜底塞进来的 raw 是一段合法 JSON 文本（{thinking,action}），会被
        // unwrapDoubleEncodedJson 解回对象 —— 所以校验器不能只判"是不是对象"。
        outputSchemaValidator: (o: unknown) => {
          const r = o as Record<string, unknown> | null;
          return r && typeof r === "object" && "findings" in r
            ? { ok: true as const }
            : {
                ok: false as const,
                issues: "dimension: Required; findings: Required",
              };
        },
      } as never),
    );
    // critique 以 reminder 形式注入**紧接着的下一轮**。必须取第 2 次调用：
    // 再往后模型（mock）会交一个 schema 真不合格的 finalize，那轮的通用
    // critique 是**正确**的，取最后一次会把两轮混在一起误判。
    const calls = chat.chat.mock.calls;
    return JSON.stringify(calls[1] ?? {});
  }

  it("★ 必须告诉模型「信封形状不对、工具没跑」，而不是「产物缺字段」", async () => {
    const secondPrompt = await runWithSchema();
    // 恢复旧行为（删掉 finalizeIsMalformedEnvelope 分支）时，注入的是
    // "[FINALIZE REJECTED] Your finalize.output failed validation: dimension: Required"
    expect(secondPrompt).toContain("ENVELOPE REJECTED");
    expect(secondPrompt).toContain("NOT executed");
    expect(secondPrompt).not.toContain("finalize.output failed validation");
  });
});

// ============================================================================
// ② 协议文本自身不得再渲染「错误形状的合法 JSON」
// ============================================================================

describe("Decision Protocol 文本卫生", () => {
  function protocolText(): string {
    const chat = mkChat([FINAL]);
    const reg = mkToolRegistry([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoker = new ToolInvoker(reg as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loop = new ReActLoop(chat as any, invoker, new HookRegistry());
    return drain(
      loop.run(makeEnvelope([]), criteria, { agentId: "proto" }),
    ).then(() => JSON.stringify(chat.chat.mock.calls[0] ?? {})) as never;
  }

  it("不得出现 5e860b47b 那个反例形状（把错误答案印在题面上）", async () => {
    const text = await (protocolText() as unknown as Promise<string>);
    // 反例：{"action":{"kind":"finalize"},"actions":[{"output":{...}}]}
    expect(text).not.toMatch(/finalize"\}\s*,\s*\?"actions\?"/);
  });

  it("不再教顶层 actions 简写（每个意图只留一种写法）", async () => {
    const text = await (protocolText() as unknown as Promise<string>);
    expect(text).not.toContain("Shorthand: you may also send");
  });

  it("但 parser 侧对 actions 简写的容错必须仍在（存量方言安全网不撤）", async () => {
    const { invoked } = await runDialect(
      JSON.stringify({
        thinking: "t",
        actions: [TC("web-search"), TC("job-search")],
      }),
      ["web-search", "job-search"],
    );
    expect(invoked.sort()).toEqual(["job-search", "web-search"]);
  });
});
