/**
 * ResourceTaggingService 单测 —— classify-only 打标写 UI 展示字段
 *
 * 覆盖：categories 映射（主类+子类去重截断）/ autoTags 映射 / 幂等 skip /
 * force 覆盖 / classify 返回 null 跳过 / 资源不存在 / 无内容跳过 / 失败非致命。
 */

import { ResourceTaggingService } from "../resource-tagging.service";

type PrismaMock = {
  resource: { findUnique: jest.Mock; update: jest.Mock };
};
type EnrichMock = { classifyContent: jest.Mock };

function make(
  resource: Record<string, unknown> | null,
  classification: Record<string, unknown> | null,
) {
  const prisma: PrismaMock = {
    resource: {
      findUnique: jest.fn().mockResolvedValue(resource),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const enrich: EnrichMock = {
    classifyContent: jest.fn().mockResolvedValue(classification),
  };
  const svc = new ResourceTaggingService(prisma as never, enrich as never);
  return { svc, prisma, enrich };
}

const RES = {
  id: "r1",
  title: "GPU Shortage 2026",
  abstract: "Foundry analysis",
  categories: [],
};
const CLASS = {
  category: "Semiconductors",
  subcategories: ["AI Infrastructure", "Supply Chain", "Semiconductors"],
  tags: ["gpu", "hbm", "tsmc"],
  difficultyLevel: "advanced",
};

describe("ResourceTaggingService", () => {
  it("写 categories(主类+子类去重截断) + autoTags + primaryCategory", async () => {
    const { svc, prisma } = make(RES, CLASS);
    const ok = await svc.tagResource("r1");
    expect(ok).toBe(true);
    const data = prisma.resource.update.mock.calls[0][0].data;
    // 去重（Semiconductors 出现两次只留一个）+ 截断 4
    expect(data.categories).toEqual([
      "Semiconductors",
      "AI Infrastructure",
      "Supply Chain",
    ]);
    expect(data.autoTags).toEqual(["gpu", "hbm", "tsmc"]);
    expect(data.primaryCategory).toBe("Semiconductors");
  });

  it("幂等：已有 categories 则跳过（不调 classify）", async () => {
    const { svc, prisma, enrich } = make(
      { ...RES, categories: ["Existing"] },
      CLASS,
    );
    const ok = await svc.tagResource("r1");
    expect(ok).toBe(false);
    expect(enrich.classifyContent).not.toHaveBeenCalled();
    expect(prisma.resource.update).not.toHaveBeenCalled();
  });

  it("force=true：即便已有 categories 也重打", async () => {
    const { svc, enrich } = make({ ...RES, categories: ["Old"] }, CLASS);
    const ok = await svc.tagResource("r1", { force: true });
    expect(ok).toBe(true);
    expect(enrich.classifyContent).toHaveBeenCalledTimes(1);
  });

  it("classify 返回 null → 跳过不写库", async () => {
    const { svc, prisma } = make(RES, null);
    const ok = await svc.tagResource("r1");
    expect(ok).toBe(false);
    expect(prisma.resource.update).not.toHaveBeenCalled();
  });

  it("资源不存在 → false", async () => {
    const { svc, enrich } = make(null, CLASS);
    const ok = await svc.tagResource("nope");
    expect(ok).toBe(false);
    expect(enrich.classifyContent).not.toHaveBeenCalled();
  });

  it("无 title/abstract 内容 → 跳过", async () => {
    const { svc, enrich } = make(
      { id: "r1", title: "", abstract: null, categories: [] },
      CLASS,
    );
    const ok = await svc.tagResource("r1");
    expect(ok).toBe(false);
    expect(enrich.classifyContent).not.toHaveBeenCalled();
  });

  it("classify/update 抛错 → 非致命返回 false", async () => {
    const { svc, enrich } = make(RES, CLASS);
    enrich.classifyContent.mockRejectedValue(new Error("ai-service down"));
    await expect(svc.tagResource("r1")).resolves.toBe(false);
  });

  it("category 与 tags 都空 → 不写库", async () => {
    const { svc, prisma } = make(RES, {
      category: "",
      subcategories: [],
      tags: [],
      difficultyLevel: "beginner",
    });
    const ok = await svc.tagResource("r1");
    expect(ok).toBe(false);
    expect(prisma.resource.update).not.toHaveBeenCalled();
  });
});
