/**
 * IndustryReportSearchTool Unit Tests
 *
 * 隔离 PrismaService + ToolRegistry（源加载走真实 IndustrySourceRegistryService
 * + PrismaService mock），验证 BaseTool 全 lifecycle：
 *   - 输入校验 / metadata
 *   - 成功路径：源命中 → site: query 拼装 → web-search 委托 → 元数据回填
 *   - 失败路径：DB 0 源 / web-search 缺席 / web-search 失败
 *   - topicType 过滤 / 8 源截断（按信誉降序）/ domain 匹配 credibility
 *   - 5 分钟内存缓存
 */

import { Test, TestingModule } from "@nestjs/testing";
import { IndustryReportSearchTool } from "../industry-report-search.tool";
import { IndustrySourceRegistryService } from "../industry-source-registry.service";
import { ToolRegistry } from "../../../../registry/tool.registry";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ToolContext } from "../../../../abstractions/tool.interface";

function makeContext(): ToolContext {
  return {
    executionId: "exec-ir-001",
    toolId: "industry-report-search",
    createdAt: new Date(),
  };
}

function makeWebSearchTool(
  results: Array<{
    title: string;
    url: string;
    content?: string;
    publishedDate?: string;
  }> = [],
  overrides: { success?: boolean; throwError?: Error } = {},
) {
  return {
    execute: jest.fn(async () => {
      if (overrides.throwError) throw overrides.throwError;
      return overrides.success === false
        ? { success: false, error: { message: "web-search down" }, data: null }
        : {
            success: true,
            data: { results, success: true, totalResults: results.length },
          };
    }),
  };
}

const SOURCES = [
  {
    id: "semianalysis",
    name: "SemiAnalysis",
    domain: "semianalysis.com",
    category: "semiconductor",
    enabled: true,
    credibilityScore: 0.9,
    topicTypes: ["TECHNOLOGY", "MACRO"],
  },
  {
    id: "stratechery",
    name: "Stratechery",
    domain: "stratechery.com",
    category: "tech-strategy",
    enabled: true,
    credibilityScore: 0.88,
    topicTypes: ["TECHNOLOGY", "COMPANY"],
  },
  {
    id: "ark-invest",
    name: "ARK Invest",
    domain: "ark-invest.com",
    category: "investment",
    enabled: true,
    credibilityScore: 0.82,
    topicTypes: ["MACRO"],
  },
  {
    id: "disabled-source",
    name: "Disabled",
    domain: "disabled.example.com",
    category: "noop",
    enabled: false, // 不应入选
    credibilityScore: 0.5,
    topicTypes: ["TECHNOLOGY"],
  },
  {
    id: "src-4",
    name: "Source4",
    domain: "src4.example.com",
    category: "x",
    enabled: true,
    credibilityScore: 0.7,
    topicTypes: ["TECHNOLOGY"],
  },
  {
    id: "src-5",
    name: "Source5",
    domain: "src5.example.com",
    category: "x",
    enabled: true,
    credibilityScore: 0.7,
    topicTypes: ["TECHNOLOGY"],
  },
  {
    id: "src-6",
    name: "Source6",
    domain: "src6.example.com",
    category: "x",
    enabled: true,
    credibilityScore: 0.7,
    topicTypes: ["TECHNOLOGY"],
  },
];

describe("IndustryReportSearchTool", () => {
  let tool: IndustryReportSearchTool;
  let prismaMock: { toolConfig: { findUnique: jest.Mock } };
  let registryMock: { tryGet: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      toolConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ config: { sources: SOURCES } }),
      },
    };
    registryMock = { tryGet: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IndustryReportSearchTool,
        IndustrySourceRegistryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ToolRegistry, useValue: registryMock },
      ],
    }).compile();

    tool = moduleRef.get(IndustryReportSearchTool);
  });

  describe("metadata", () => {
    it("has id 'industry-report-search'", () => {
      expect(tool.id).toBe("industry-report-search");
    });
    it("has category 'information' and industry tags", () => {
      expect(tool.category).toBe("information");
      expect(tool.tags).toContain("industry");
      expect(tool.tags).toContain("report");
    });
    it("requires 'query' input", () => {
      expect(tool.inputSchema.required).toContain("query");
    });
    it("declares no side effect", () => {
      expect(tool.sideEffect).toBe("none");
    });
  });

  describe("success path", () => {
    it("calls web-search with site:domain prefix from enabled sources (top 8 by credibility)", async () => {
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      await tool.execute({ query: "AI infrastructure" }, makeContext());

      expect(webSearch.execute).toHaveBeenCalledTimes(1);
      const callArg = webSearch.execute.mock.calls[0][0];
      expect(callArg.query).toContain("site:semianalysis.com");
      expect(callArg.query).toContain("site:stratechery.com");
      expect(callArg.query).toContain("site:ark-invest.com");
      expect(callArg.query).toContain("site:src4.example.com");
      expect(callArg.query).toContain("site:src5.example.com");
      // ★ 2026-07-21: 上限提到 8 —— 6 个 enabled 全部入选
      expect(callArg.query).toContain("site:src6.example.com");
      // 不应包含 disabled
      expect(callArg.query).not.toContain("disabled.example.com");
      expect(callArg.query).toContain("AI infrastructure");
      // ★ 按 credibilityScore 降序：semianalysis(0.9) 排第一
      expect(callArg.query.indexOf("site:semianalysis.com")).toBeLessThan(
        callArg.query.indexOf("site:stratechery.com"),
      );
    });

    // ★ 2026-07-26: 上限 8 → 14。线上白名单已 18 个源，8 名之后的 10 个从未
    //   参与过检索；不放开到全量是因为 Serper(Google) 路径是字面 site: OR 串。
    it("caps site: filter at 14 domains sorted by credibility desc", async () => {
      const manySources = Array.from({ length: 20 }, (_, i) => ({
        id: `bulk-${i}`,
        name: `Bulk${i}`,
        domain: `bulk${i}.example.com`,
        category: "x",
        enabled: true,
        credibilityScore: 0.5 + i * 0.02, // bulk19 最高
        topicTypes: ["TECHNOLOGY"],
      }));
      prismaMock.toolConfig.findUnique.mockResolvedValue({
        config: { sources: manySources },
      });
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      await tool.execute({ query: "AI" }, makeContext());

      const callArg = webSearch.execute.mock.calls[0][0];
      const matched = callArg.query.match(/site:/g) ?? [];
      expect(matched).toHaveLength(14);
      // 信誉最高的 bulk19 必在，最低的 bulk0 必不在
      expect(callArg.query).toContain("site:bulk19.example.com");
      expect(callArg.query).not.toContain("site:bulk0.example.com");
    });

    it("白名单 18 个源时全部进检索（线上规模不再被截断）", async () => {
      const eighteen = Array.from({ length: 18 }, (_, i) => ({
        id: `s-${i}`,
        name: `S${i}`,
        domain: `s${i}.example.com`,
        category: "x",
        enabled: true,
        credibilityScore: 0.8,
        topicTypes: ["TECHNOLOGY"],
      }));
      prismaMock.toolConfig.findUnique.mockResolvedValue({
        config: { sources: eighteen },
      });
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      const r = await tool.execute({ query: "AI" }, makeContext());

      // 18 > 14：仍按上限截断，但覆盖面从 44% 提到 78%
      expect((r.data as { sourcesQueried: number }).sourcesQueried).toBe(14);
    });

    it("populates source name + credibilityScore from matching domain", async () => {
      const webSearch = makeWebSearchTool([
        {
          title: "GPU Shortage",
          url: "https://semianalysis.com/p/gpu-shortage-2026",
          content: "Foundry capacity analysis",
          publishedDate: "2026-04-10",
        },
        {
          title: "Tech Strategy",
          url: "https://stratechery.com/2026/tech-strategy",
          content: "Strategy take",
        },
      ]);
      registryMock.tryGet.mockReturnValue(webSearch);

      const r = await tool.execute({ query: "AI" }, makeContext());
      expect(r.success).toBe(true);
      const items = (r.data as { items: Array<Record<string, unknown>> }).items;
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        source: "SemiAnalysis",
        credibilityScore: 0.9,
        domain: "semianalysis.com",
      });
      expect(items[1]).toMatchObject({
        source: "Stratechery",
        credibilityScore: 0.88,
      });
    });

    it("falls back to default credibility when domain doesn't match any source", async () => {
      const webSearch = makeWebSearchTool([
        {
          title: "Random",
          url: "https://random.example.com/post",
          content: "",
        },
      ]);
      registryMock.tryGet.mockReturnValue(webSearch);

      const r = await tool.execute({ query: "AI" }, makeContext());
      const items = (r.data as { items: Array<Record<string, unknown>> }).items;
      expect(items[0].source).toBe("Industry Report");
      expect(items[0].credibilityScore).toBe(0.7);
    });

    it("filters sources by topicType when provided", async () => {
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      await tool.execute(
        { query: "Crypto outlook", topicType: "MACRO" },
        makeContext(),
      );

      const callArg = webSearch.execute.mock.calls[0][0];
      // Only sources with topicTypes containing MACRO: semianalysis, ark-invest
      expect(callArg.query).toContain("site:semianalysis.com");
      expect(callArg.query).toContain("site:ark-invest.com");
      expect(callArg.query).not.toContain("site:src5.example.com"); // not MACRO
    });

    // ★ 2026-07-26: 配置里是 ResearchTopicType 大写字面量，模型按 schema 传的是
    //   小写；严格相等时恒不命中 → 过滤形同虚设（每次都 fallback 全量 + 刷 WARN）
    it("matches topicType case-insensitively (lowercase from LLM hits uppercase config)", async () => {
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      await tool.execute(
        { query: "Crypto outlook", topicType: "macro" },
        makeContext(),
      );

      const callArg = webSearch.execute.mock.calls[0][0];
      expect(callArg.query).toContain("site:semianalysis.com");
      expect(callArg.query).toContain("site:ark-invest.com");
      expect(callArg.query).not.toContain("site:src5.example.com");
    });

    it("unknown topicType still falls back to all enabled sources (fail-soft)", async () => {
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      const r = await tool.execute(
        { query: "AI", topicType: "energy" },
        makeContext(),
      );

      const data = r.data as { sourcesQueried: number };
      expect(data.sourcesQueried).toBe(6);
    });
  });

  describe("error path", () => {
    it("falls back to registry tool config when provider alias row is missing", async () => {
      prismaMock.toolConfig.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          config: { sources: SOURCES },
        });
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      const r = await tool.execute({ query: "AI" }, makeContext());
      const data = r.data as { success: boolean; sourcesQueried: number };

      expect(data.success).toBe(true);
      // ★ 2026-07-21: 上限 8 —— 6 个 enabled 全部入选
      expect(data.sourcesQueried).toBe(6);
      expect(prismaMock.toolConfig.findUnique).toHaveBeenNthCalledWith(1, {
        where: { toolId: "industry-report-search" },
      });
      expect(prismaMock.toolConfig.findUnique).toHaveBeenNthCalledWith(2, {
        where: { toolId: "industry-report" },
      });
    });

    it("returns success:false with explicit error when DB has 0 enabled sources", async () => {
      prismaMock.toolConfig.findUnique.mockResolvedValue({
        config: { sources: [] },
      });
      registryMock.tryGet.mockReturnValue(makeWebSearchTool());

      const r = await tool.execute({ query: "AI" }, makeContext());
      expect(r.success).toBe(true); // BaseTool wraps domain failure as success:true with data.success:false
      const data = r.data as {
        success: boolean;
        error: string;
        sourcesQueried: number;
      };
      expect(data.success).toBe(false);
      expect(data.sourcesQueried).toBe(0);
      expect(data.error).toContain("No enabled industry report sources");
    });

    it("returns success:false when web-search tool not registered", async () => {
      registryMock.tryGet.mockReturnValue(undefined);

      const r = await tool.execute({ query: "AI" }, makeContext());
      const data = r.data as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toContain("web-search tool not registered");
    });

    it("returns success:false when web-search fails", async () => {
      const webSearch = makeWebSearchTool([], { success: false });
      registryMock.tryGet.mockReturnValue(webSearch);

      const r = await tool.execute({ query: "AI" }, makeContext());
      const data = r.data as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toContain("web-search down");
    });

    it("handles DB load exception gracefully (cached empty sources)", async () => {
      prismaMock.toolConfig.findUnique.mockRejectedValue(new Error("DB down"));
      registryMock.tryGet.mockReturnValue(makeWebSearchTool());

      const r = await tool.execute({ query: "AI" }, makeContext());
      const data = r.data as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toContain("No enabled industry report sources");
    });
  });

  describe("caching", () => {
    it("caches sources for 5 minutes (subsequent calls hit DB once)", async () => {
      const webSearch = makeWebSearchTool([]);
      registryMock.tryGet.mockReturnValue(webSearch);

      await tool.execute({ query: "q1" }, makeContext());
      await tool.execute({ query: "q2" }, makeContext());
      await tool.execute({ query: "q3" }, makeContext());

      expect(prismaMock.toolConfig.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe("nested web-search timeout (graceful degrade)", () => {
    it("嵌套 web-search 卡死超过子预算 → 优雅降级为空，不抛硬超时", async () => {
      jest.useFakeTimers();
      try {
        // web-search 永不 resolve（模拟底层 provider HTTP 跑飞）
        const hang = { execute: jest.fn(() => new Promise(() => {})) };
        registryMock.tryGet.mockReturnValue(hang);

        const p = tool.execute({ query: "AI infrastructure" }, makeContext());
        // 推进到子预算（26s）后，race 由超时分支胜出
        await jest.advanceTimersByTimeAsync(26000);
        const r = await p;
        const data = r.data as {
          success: boolean;
          items: unknown[];
          error?: string;
        };
        expect(data.success).toBe(false);
        expect(data.items).toEqual([]);
        expect(data.error).toContain("超时");
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
