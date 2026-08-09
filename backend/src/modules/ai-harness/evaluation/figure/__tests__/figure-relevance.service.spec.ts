/**
 * figure-relevance.service.spec.ts
 *
 * Tests for FigureRelevanceService v18（双闸：主题相关 + 信息量）。
 *
 * ★ 2026-08-09 契约变更（用户实证 RSI 报告配图全是人物头像后的根因修复）：
 *   - 新增 Stage A 硬闸（无有效 caption / 人物照 URL 特征）
 *   - 新增 Stage C 信息量闸：结构化强信号直通，其余走一次 Vision batch 真看图
 *   - 全链路 fail-closed：embedding / Vision 不可用一律拒绝，不再 fail-open 放行
 *   - 返回值按信息量降序（调用方 slice(0,N) 拿到的是最好的 N 张，不是最靠前的 N 张）
 */

import { FigureRelevanceService } from "../figure-relevance.service";
import type { ExtractedFigure } from "@/modules/ai-engine/facade";

function makeFigure(overrides: Partial<ExtractedFigure>): ExtractedFigure {
  return {
    imageUrl: "https://example.com/image.jpg",
    type: "photo",
    caption: "A chart showing data",
    alt: "",
    width: 800,
    height: 600,
    sourceUrl: "https://example.com",
    ...overrides,
  } as ExtractedFigure;
}

type VisionDecision = number[] | "fail";

/**
 * Mock AIFacade。
 *
 * chatStructured 被两处调用：
 *   - Stage B（主题相关性，schema 含 acceptedIndices）
 *   - Stage C（Vision 判图，schema 含 keepIndices）
 * 按 schema 分流，让用例能分别控制两道闸的行为。
 */
function makeEngineFacade(opts?: {
  embedding?: number[] | null;
  /** Stage B caption 相关性：默认全放行（让用例聚焦 Stage C） */
  topicRelevant?: "all" | "fail";
  /** Stage C Vision：保留的编号，或 "fail" 模拟调用失败 */
  vision?: VisionDecision;
  /**
   * 是否存在一个 supportsVision=true 的 MULTIMODAL 模型（默认 true）。
   * 生产核查发现多数账号其实没有 —— 用 false 复现该场景。
   */
  visionModelAvailable?: boolean;
}) {
  const embedding =
    opts?.embedding === undefined ? [0.5, 0.5, 0.5] : opts.embedding;
  const visionAvailable = opts?.visionModelAvailable !== false;
  const chatStructured = jest.fn(async (req: unknown) => {
    const schema = (
      req as { schema?: { properties?: Record<string, unknown> } }
    ).schema;
    const isVision = !!schema?.properties?.keepIndices;
    if (isVision) {
      if (opts?.vision === "fail" || opts?.vision === undefined) {
        throw new Error("vision call failed");
      }
      return { data: { keepIndices: opts.vision } };
    }
    if (opts?.topicRelevant === "fail") throw new Error("stage B down");
    // 默认：caption 相关性全放行
    const messages = (req as { messages: { content: string }[] }).messages;
    const count = (messages[0].content.match(/^\s*\d+\.\s/gm) ?? []).length;
    return {
      data: { acceptedIndices: Array.from({ length: count }, (_, i) => i) },
    };
  });
  return {
    embeddingGenerate: jest.fn(async () => (embedding ? { embedding } : null)),
    chatStructured,
    getDefaultModelByType: jest.fn(async () =>
      visionAvailable ? { modelId: "gpt-4o", displayName: "GPT-4o" } : null,
    ),
    getFullModelConfig: jest.fn(async () => ({
      supportsVision: visionAvailable,
    })),
  };
}

describe("FigureRelevanceService (v18 双闸)", () => {
  describe("Stage A — 硬闸", () => {
    it("returns empty array for empty input", async () => {
      const facade = makeEngineFacade();
      const svc = new FigureRelevanceService(facade as never);
      expect(await svc.filterRelevantFigures([], "AI Technology")).toEqual([]);
    });

    it("rejects figure with caption < 10 chars", async () => {
      const facade = makeEngineFacade({ vision: [0] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [makeFigure({ type: "photo", caption: "Short" })];
      expect(
        await svc.filterRelevantFigures(figures, "AI Research"),
      ).toHaveLength(0);
    });

    it("rejects figure with no caption and no alt", async () => {
      const facade = makeEngineFacade({ vision: [0] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [makeFigure({ type: "photo", caption: "", alt: "" })];
      expect(
        await svc.filterRelevantFigures(figures, "AI Research"),
      ).toHaveLength(0);
    });

    it.each([
      "https://cdn.example.com/people/tian-yuan-dong.jpg",
      "https://cdn.example.com/authors/jeff-dean.png",
      "https://cdn.example.com/img/jeff-dean-headshot.jpg",
      "https://cdn.example.com/team/founder-portrait-2026.webp",
    ])(
      "rejects person-photo URL pattern regardless of caption relevance: %s",
      async (imageUrl) => {
        // caption 对主题**确实相关**（人物是 RSI 主题里的关键人物），
        // 这正是 v17 只判 caption 时人头照必然过闸的原因。
        const facade = makeEngineFacade({ vision: [0] });
        const svc = new FigureRelevanceService(facade as never);
        const figures = [
          makeFigure({
            type: "photo",
            imageUrl,
            caption:
              "Tian Yuandong, founder of the recursive self-improvement lab",
          }),
        ];
        const result = await svc.filterRelevantFigures(
          figures,
          "北美 AI 递归自我改进（RSI）",
        );
        expect(result).toHaveLength(0);
      },
    );

    // ★ 生产 artifact 51b6b494 实测 URL：arXiv 页脚赞助方 logo 混进了配图。
    it.each([
      "https://arxiv.org/static/base/1.0.1/images/funders/simons-foundation.png",
      "https://arxiv.org/static/base/1.0.1/images/funders/simons-foundation-international.png",
      "https://arxiv.org/static/base/1.0.1/images/funders/schmidt-sciences.png",
    ])("rejects site-chrome sponsor logo: %s", async (imageUrl) => {
      const facade = makeEngineFacade({ vision: [0] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({ imageUrl, caption: "Simons Foundation International" }),
      ];
      expect(
        await svc.filterRelevantFigures(figures, "AI Research"),
      ).toHaveLength(0);
    });

    // 反向守护：不能因为路径里有 /images/ 或 /assets/ 就误杀真图表
    it("不误杀 /assets/images/ 下的真实图表（METR 生产 URL）", async () => {
      const facade = makeEngineFacade({ vision: [0] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          imageUrl:
            "https://metr.org/assets/images/time-horizon-1-1/task-distribution-comparison.png",
          caption:
            "任务分布对比柱状图：时间视野扩展由长周期多步骤任务域率先突破推动",
        }),
      ];
      expect(
        await svc.filterRelevantFigures(figures, "AI Research"),
      ).toHaveLength(1);
    });
  });

  describe("Stage B — 主题相关性", () => {
    it("rejects photo when cosine similarity < threshold", async () => {
      const facade = {
        embeddingGenerate: jest
          .fn()
          .mockResolvedValueOnce({ embedding: [1, 0, 0] }) // topic
          .mockResolvedValueOnce({ embedding: [0, 1, 0] }), // caption（正交 → cosine=0）
        chatStructured: jest.fn(async () => {
          throw new Error("stage B llm down");
        }),
      };
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          type: "photo",
          caption: "Completely unrelated content photo",
        }),
      ];
      expect(
        await svc.filterRelevantFigures(figures, "AI Technology"),
      ).toHaveLength(0);
    });

    it("fail-closed：embedding 拿不到向量时拒绝（v17 曾在此 fail-open 放行）", async () => {
      const facade = {
        embeddingGenerate: jest
          .fn()
          .mockResolvedValueOnce(null) // topic embedding null
          .mockResolvedValueOnce({ embedding: [0.5, 0.5] }),
        chatStructured: jest.fn(async () => {
          throw new Error("stage B llm down");
        }),
      };
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({ type: "photo", caption: "Valid caption here for test" }),
      ];
      expect(
        await svc.filterRelevantFigures(figures, "AI Technology"),
      ).toHaveLength(0);
    });

    it("uses cached topic embedding (only computed once per call)", async () => {
      const facade = {
        embeddingGenerate: jest.fn(async () => ({
          embedding: [0.5, 0.5, 0.5],
        })),
        chatStructured: jest.fn(async () => {
          throw new Error("stage B llm down");
        }),
      };
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          type: "photo",
          imageUrl: "https://example.com/charts/a.png",
          caption: "Market analysis chart for technology",
        }),
        makeFigure({
          type: "photo",
          imageUrl: "https://example.com/charts/b.png",
          caption: "Financial data and growth metrics information",
        }),
      ];
      await svc.filterRelevantFigures(figures, "AI Technology");
      expect(facade.embeddingGenerate.mock.calls.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Stage C — 信息量闸", () => {
    it("结构化强信号（URL 图表路径）直通，不调 Vision", async () => {
      const facade = makeEngineFacade({ vision: "fail" });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          type: "photo",
          imageUrl: "https://example.com/charts/compute-trend.png",
          caption: "Training compute trend across three eras",
        }),
      ];
      const result = await svc.filterRelevantFigures(figures, "AI Research");
      // Vision 被设成 fail，仍然通过 → 说明走的是直通路径
      expect(result).toHaveLength(1);
    });

    it("结构化强信号（caption 同时含数字与图表词汇）直通", async () => {
      const facade = makeEngineFacade({ vision: "fail" });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          type: "photo",
          caption: "前沿模型训练算力大致每 6 个月翻倍的趋势",
        }),
      ];
      expect(await svc.filterRelevantFigures(figures, "AI 算力")).toHaveLength(
        1,
      );
    });

    it("chart/table/diagram 不再免检 —— 无强信号时仍要过 Vision", async () => {
      // v17 的洞：type 是 classifyFigureType 靠 caption 关键词猜的，
      // caption 带"架构"的人物照会被猜成 diagram 然后免检入库。
      const facade = makeEngineFacade({ vision: [] }); // Vision 判定全不保留
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({ type: "chart", caption: "Some plain caption text" }),
        makeFigure({ type: "diagram", caption: "Another plain caption" }),
      ];
      const result = await svc.filterRelevantFigures(figures, "AI Research");
      expect(result).toHaveLength(0);
      expect(facade.chatStructured).toHaveBeenCalled();
    });

    it("Vision 只保留它点名的编号", async () => {
      const facade = makeEngineFacade({ vision: [1] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          imageUrl: "https://cdn.example.com/a.jpg",
          caption: "Caption number one for the photo",
        }),
        makeFigure({
          imageUrl: "https://cdn.example.com/b.jpg",
          caption: "Caption number two for the photo",
        }),
      ];
      const result = await svc.filterRelevantFigures(figures, "AI Research");
      expect(result).toHaveLength(1);
      expect(result[0].imageUrl).toBe("https://cdn.example.com/b.jpg");
    });

    it("Vision 返回越界编号时不 crash 且不放行", async () => {
      const facade = makeEngineFacade({ vision: [0, 99] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          imageUrl: "https://cdn.example.com/a.jpg",
          caption: "Caption number one for the photo",
        }),
      ];
      expect(
        await svc.filterRelevantFigures(figures, "AI Research"),
      ).toHaveLength(1);
    });

    // ★ 生产核查（2026-08-09）：本项目多数账号的 MULTIMODAL 配置是
    //   is_enabled=false / supports_vision=false（还有把视频生成模型挂在
    //   MULTIMODAL 下的）。ChatFacade.resolveModelId 找不到时返回空串并回落到
    //   普通 CHAT 模型 —— 调用会「成功」，但模型根本没看图，只按 caption 作答。
    //   必须在调用前校验能力，绝不能让日志谎称"Vision 判图"。
    it("没有 supportsVision 模型时不发起调用，直接 fail-closed", async () => {
      const facade = makeEngineFacade({
        vision: [0, 1],
        visionModelAvailable: false,
      });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          imageUrl: "https://cdn.example.com/a.jpg",
          caption: "Caption number one for the photo",
        }),
        makeFigure({
          imageUrl: "https://cdn.example.com/b.jpg",
          caption: "Caption number two for the photo",
        }),
      ];
      const result = await svc.filterRelevantFigures(figures, "AI Research");
      expect(result).toHaveLength(0);
      // Stage B 的 caption 调用可以发生，但绝不能发出带图的 Vision 调用
      const visionCalls = facade.chatStructured.mock.calls.filter(
        (c) =>
          !!(c[0] as { schema?: { properties?: Record<string, unknown> } })
            .schema?.properties?.keepIndices,
      );
      expect(visionCalls).toHaveLength(0);
    });

    it("Vision 调用发出的是多模态消息（真的带图，不是只发 caption）", async () => {
      const facade = makeEngineFacade({ vision: [0] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          imageUrl: "https://cdn.example.com/a.jpg",
          caption: "Caption number one for the photo",
        }),
      ];
      await svc.filterRelevantFigures(figures, "AI Research");
      const visionReq = facade.chatStructured.mock.calls
        .map(
          (c) =>
            c[0] as {
              schema?: { properties?: Record<string, unknown> };
              messages: { contentParts?: { type: string }[] }[];
            },
        )
        .find((r) => !!r.schema?.properties?.keepIndices);
      expect(visionReq).toBeDefined();
      const parts = visionReq!.messages[0].contentParts ?? [];
      expect(parts.some((p) => p.type === "image_url")).toBe(true);
    });

    it("fail-closed：Vision 调用失败时 borderline 全部丢弃", async () => {
      const facade = makeEngineFacade({ vision: "fail" });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        makeFigure({
          imageUrl: "https://cdn.example.com/a.jpg",
          caption: "Caption number one for the photo",
        }),
        makeFigure({
          imageUrl: "https://cdn.example.com/b.jpg",
          caption: "Caption number two for the photo",
        }),
      ];
      expect(
        await svc.filterRelevantFigures(figures, "AI Research"),
      ).toHaveLength(0);
    });
  });

  describe("Stage D — 排序", () => {
    it("强信号图排在 Vision 通过的图前面（调用方 slice(0,N) 拿到的是最好的）", async () => {
      const facade = makeEngineFacade({ vision: [0] });
      const svc = new FigureRelevanceService(facade as never);
      const figures = [
        // 页面最靠前的一张普通图（v17 下 slice(0,1) 会选中它）
        makeFigure({
          imageUrl: "https://cdn.example.com/lead-photo.jpg",
          caption: "Some ordinary caption for the lead image",
        }),
        // 真正的数据图，排在页面后面
        makeFigure({
          imageUrl: "https://example.com/figures/fig-3-benchmark.png",
          caption: "Benchmark results across model families",
        }),
      ];
      const result = await svc.filterRelevantFigures(figures, "AI Research");
      expect(result).toHaveLength(2);
      expect(result[0].imageUrl).toBe(
        "https://example.com/figures/fig-3-benchmark.png",
      );
    });
  });
});
