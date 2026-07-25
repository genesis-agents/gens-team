/**
 * ReportCitationImportListener 单测 —— 引用→公共信源库导入桥
 *
 * 覆盖：分级闸门（阈值 70 + sourceType 白名单）/ 类型映射（含 academic→PAPER
 * 的论文 URL 校验降级）/ 单 mission 30 条截断 / 逐条失败不中断 / 溯源字段。
 */

import { ReportCitationImportListener } from "../report-citation-import.listener";
import type { PlaygroundReportCompletedPayload } from "../../../playground/integrations/playground-events";

type ImportManagerMock = {
  importWithMetadata: jest.Mock;
};
type TaggingMock = {
  tagResource: jest.Mock;
};

function makeListener(): {
  listener: ReportCitationImportListener;
  importManager: ImportManagerMock;
  tagging: TaggingMock;
} {
  const importManager: ImportManagerMock = {
    importWithMetadata: jest
      .fn()
      .mockResolvedValue({ id: "res-1", resourceId: "res-1" }),
  };
  const tagging: TaggingMock = {
    tagResource: jest.fn().mockResolvedValue(true),
  };
  const listener = new ReportCitationImportListener(
    importManager as never,
    tagging as never,
  );
  return { listener, importManager, tagging };
}

function makePayload(
  citations: PlaygroundReportCompletedPayload["citations"],
): PlaygroundReportCompletedPayload {
  return {
    missionId: "mission-001",
    userId: "user-001",
    topic: "GPU 供应链",
    // ★ 未显式给 title 的 citation 注入默认真实标题，让"真实标题"闸门放行
    //   （裸域名标题的挡门单独用例覆盖）
    citations: citations.map((c) => ({
      title: c.title ?? "A Real Article Title",
      ...c,
    })),
  };
}

describe("ReportCitationImportListener", () => {
  it("合格引用（industry ≥70）导入为 REPORT，且带 sourceMissionId 溯源", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://semianalysis.com/p/gpu",
          title: "GPU Shortage",
          domain: "semianalysis.com",
          snippet: "Foundry capacity...",
          publishedAt: "2026-07-01",
          sourceType: "industry",
          credibilityScore: 90,
        },
      ]),
    );
    expect(importManager.importWithMetadata).toHaveBeenCalledTimes(1);
    const [url, resourceType, metadata, skipDup] =
      importManager.importWithMetadata.mock.calls[0];
    expect(url).toBe("https://semianalysis.com/p/gpu");
    expect(resourceType).toBe("REPORT");
    expect(metadata).toMatchObject({
      title: "GPU Shortage",
      domain: "semianalysis.com",
      description: "Foundry capacity...",
      sourceMissionId: "mission-001",
    });
    expect(metadata.publishedDate).toBeInstanceOf(Date);
    expect(skipDup).toBe(true);
  });

  it("导入成功后按 resourceId 调 classify 打标", async () => {
    const { listener, tagging } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://semianalysis.com/p/gpu",
          sourceType: "industry",
          credibilityScore: 90,
        },
      ]),
    );
    expect(tagging.tagResource).toHaveBeenCalledTimes(1);
    expect(tagging.tagResource).toHaveBeenCalledWith("res-1");
  });

  it("打标失败不污染导入计数（.catch 兜底，导入仍算成功）", async () => {
    const { listener, importManager, tagging } = makeListener();
    tagging.tagResource.mockRejectedValueOnce(new Error("classify down"));
    await expect(
      listener.handleReportCompleted(
        makePayload([
          {
            url: "https://reuters.com/a",
            sourceType: "news",
            credibilityScore: 85,
          },
        ]),
      ),
    ).resolves.toBeUndefined();
    expect(importManager.importWithMetadata).toHaveBeenCalledTimes(1);
    expect(tagging.tagResource).toHaveBeenCalledTimes(1);
  });

  it("分级闸门：低分（<70）与 blog/community/other 一律跳过", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://a.com/1",
          sourceType: "industry",
          credibilityScore: 65, // 低分
        },
        {
          url: "https://medium.com/post",
          sourceType: "blog",
          credibilityScore: 80, // blog 类型不入库
        },
        {
          url: "https://reddit.com/r/x",
          sourceType: "community",
          credibilityScore: 90,
        },
        {
          url: "https://b.com/2",
          sourceType: "other",
          credibilityScore: 90,
        },
        {
          url: "https://c.com/3",
          credibilityScore: 95, // 无 sourceType
        },
      ]),
    );
    expect(importManager.importWithMetadata).not.toHaveBeenCalled();
  });

  it("类型映射：gov→POLICY、news→NEWS、academic 论文源→PAPER", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://www.whitehouse.gov/ai-eo",
          sourceType: "gov",
          credibilityScore: 95,
        },
        {
          url: "https://reuters.com/tech/ai",
          sourceType: "news",
          credibilityScore: 85,
        },
        {
          url: "https://arxiv.org/abs/2401.12345",
          sourceType: "academic",
          credibilityScore: 92,
        },
      ]),
    );
    const types = importManager.importWithMetadata.mock.calls.map(
      (c: unknown[]) => c[1],
    );
    expect(types).toEqual(expect.arrayContaining(["POLICY", "NEWS", "PAPER"]));
  });

  it("academic 但非已知论文 URL → 降级 REPORT（绕开 PAPER 严格校验）", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://hai.stanford.edu/ai-index-2026",
          sourceType: "academic",
          credibilityScore: 90,
        },
      ]),
    );
    expect(importManager.importWithMetadata.mock.calls[0][1]).toBe("REPORT");
  });

  it("单 mission 截断 30 条：保留信誉分最高的", async () => {
    const { listener, importManager } = makeListener();
    const citations = Array.from({ length: 40 }, (_, i) => ({
      url: `https://site${i}.com/post`,
      sourceType: "industry" as const,
      credibilityScore: 70 + (i % 25), // 70-94
    }));
    await listener.handleReportCompleted(makePayload(citations));
    expect(importManager.importWithMetadata).toHaveBeenCalledTimes(30);
    // 被丢弃的应是低分段：所有导入项分数 >= 未导入项的最高分下界
    const importedUrls = new Set(
      importManager.importWithMetadata.mock.calls.map(
        (c: unknown[]) => c[0] as string,
      ),
    );
    const sorted = [...citations].sort(
      (a, b) => (b.credibilityScore ?? 0) - (a.credibilityScore ?? 0),
    );
    for (const top of sorted.slice(0, 30)) {
      expect(importedUrls.has(top.url)).toBe(true);
    }
  });

  it("逐条导入失败不中断批次、监听器不抛错", async () => {
    const { listener, importManager } = makeListener();
    importManager.importWithMetadata
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ id: "res-2" });
    await expect(
      listener.handleReportCompleted(
        makePayload([
          {
            url: "https://fail.com/1",
            sourceType: "industry",
            credibilityScore: 90,
          },
          {
            url: "https://ok.com/2",
            sourceType: "industry",
            credibilityScore: 85,
          },
        ]),
      ),
    ).resolves.toBeUndefined();
    expect(importManager.importWithMetadata).toHaveBeenCalledTimes(2);
  });

  it("空 citations / 全部被闸门挡下 → 不调导入", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(makePayload([]));
    expect(importManager.importWithMetadata).not.toHaveBeenCalled();
  });

  it("真实标题闸门：裸域名/域名标题/空标题一律挡下（不入库）", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted({
      missionId: "m",
      userId: "u",
      citations: [
        {
          url: "https://www.mckinsey.com/industries/semiconductors/x",
          title: "mckinsey.com", // 裸域名标题
          domain: "mckinsey.com",
          sourceType: "industry",
          credibilityScore: 90,
        },
        {
          url: "https://hai.stanford.edu/ai-index/2026",
          title: "hai.stanford.edu", // 裸域名标题
          domain: "hai.stanford.edu",
          sourceType: "academic",
          credibilityScore: 92,
        },
        {
          url: "https://www.whitehouse.gov/x",
          title: "www.whitehouse.gov", // 等于 domain（带 www）
          domain: "whitehouse.gov",
          sourceType: "gov",
          credibilityScore: 95,
        },
        {
          url: "https://reuters.com/x",
          title: "   ", // 空白标题
          domain: "reuters.com",
          sourceType: "news",
          credibilityScore: 85,
        },
      ],
    });
    expect(importManager.importWithMetadata).not.toHaveBeenCalled();
  });

  it("真实标题闸门：有真实标题的引用正常放行", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted({
      missionId: "m",
      userId: "u",
      citations: [
        {
          url: "https://www.mckinsey.com/industries/semiconductors/x",
          title: "The State of AI in Semiconductors", // 真实标题
          domain: "mckinsey.com",
          sourceType: "industry",
          credibilityScore: 90,
        },
      ],
    });
    expect(importManager.importWithMetadata).toHaveBeenCalledTimes(1);
  });

  it("文档/产品页闸门：docs 子域与手册/About/Pricing 路径一律挡下（不入库）", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://docs.anthropic.com/en/docs/claude-code/security",
          title: "Zero data retention - Claude Code Docs",
          domain: "docs.anthropic.com",
          sourceType: "industry",
          credibilityScore: 90, // 白名单加成后的高分也挡
        },
        {
          url: "https://help.openai.com/en/articles/data-controls",
          title: "Data controls in the OpenAI platform",
          domain: "help.openai.com",
          sourceType: "industry",
          credibilityScore: 88,
        },
        {
          url: "https://anthropic.com/about",
          title: "About Anthropic",
          domain: "anthropic.com",
          sourceType: "industry",
          credibilityScore: 90,
        },
        {
          url: "https://example.com/pricing",
          title: "Example Product Pricing",
          domain: "example.com",
          sourceType: "news",
          credibilityScore: 85,
        },
      ]),
    );
    expect(importManager.importWithMetadata).not.toHaveBeenCalled();
  });

  it("首页闸门：机构/产品根路径 URL 一律挡下（真标题也不放行）", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://bair.berkeley.edu/",
          title: "Berkeley Artificial Intelligence Research Lab",
          domain: "bair.berkeley.edu",
          sourceType: "academic",
          credibilityScore: 92,
        },
        {
          url: "https://www.lanl.gov",
          title: "Los Alamos National Laboratory",
          domain: "lanl.gov",
          sourceType: "gov",
          credibilityScore: 95,
        },
      ]),
    );
    expect(importManager.importWithMetadata).not.toHaveBeenCalled();
  });

  it("文档/产品页闸门：正文路径含 report/blog 字样的正常内容不误伤", async () => {
    const { listener, importManager } = makeListener();
    await listener.handleReportCompleted(
      makePayload([
        {
          url: "https://www.mckinsey.com/reports/state-of-ai-2026",
          title: "The State of AI 2026",
          domain: "mckinsey.com",
          sourceType: "industry",
          credibilityScore: 90,
        },
        {
          url: "https://www.cnbc.com/2026/07/23/apec-open-source-ai.html",
          title: "U.S., other nations back open-source AI",
          domain: "cnbc.com",
          sourceType: "news",
          credibilityScore: 85,
        },
        {
          // /docs/ 路径下的报告 PDF 是文档文件不是文档站页面，放行
          url: "https://reports.weforum.org/docs/WEF_AI_Energy_Paradox_2025.pdf",
          title: "Artificial Intelligence's Energy Paradox",
          domain: "reports.weforum.org",
          sourceType: "industry",
          credibilityScore: 88,
        },
        {
          // docs. 子域下的出版物 PDF 同理放行
          url: "https://docs.nlr.gov/docs/fy26osti/97716.pdf",
          title: "Modeling Framework for Data Center Loads",
          domain: "docs.nlr.gov",
          sourceType: "gov",
          credibilityScore: 95,
        },
      ]),
    );
    expect(importManager.importWithMetadata).toHaveBeenCalledTimes(4);
  });
});
