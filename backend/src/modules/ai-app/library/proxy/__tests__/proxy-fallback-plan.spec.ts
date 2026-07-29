/**
 * 抓取失败的回退分级 —— fallbackPlanFor
 *
 * 背景（2026-07-29）：三处回退链原本写死 `status === 403`，而用 403 拦爬虫只是
 * 其中一种做法。实测 MDPI 经 doi.org 跳转后对我们的服务器返回 404（同一 URL
 * 本机直连 200），于是 FlareSolverr / Jina / Puppeteer 三层能力全被跳过，
 * 用户只看到"预览不可用"。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ProxyController } from "../proxy.controller";
import { AdvancedExtractorService } from "../../../../../common/content-processing/advanced-extractor.service";
import { NewsExtractorService } from "../news-extractor.service";
import { PuppeteerFetcherService } from "../puppeteer-fetcher.service";
import { FlareSolverrService } from "../flaresolverr.service";

describe("ProxyController.fallbackPlanFor", () => {
  let controller: ProxyController;
  // private 方法：测试里按契约访问
  const plan = (status: number | undefined): string =>
    (
      controller as unknown as {
        fallbackPlanFor: (s: number | undefined) => string;
      }
    ).fallbackPlanFor(status);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        { provide: AdvancedExtractorService, useValue: {} },
        { provide: NewsExtractorService, useValue: {} },
        { provide: PuppeteerFetcherService, useValue: {} },
        { provide: FlareSolverrService, useValue: {} },
      ],
    }).compile();
    controller = module.get<ProxyController>(ProxyController);
  });

  it.each([403, 429, 451, 503, 401, 405, 406, 409, 418])(
    "%i 是典型反爬响应 → 走完整回退链",
    (status) => {
      expect(plan(status)).toBe("full");
    },
  );

  it("404 → 只走廉价回退（Jina），不为可能的真死链付 FlareSolverr+Puppeteer 的时间", () => {
    expect(plan(404)).toBe("cheap");
  });

  it.each([400, 402, 410, 500, 502, 504])(
    "%i 不触发回退（语义错误或偶发故障，重试无意义）",
    (status) => {
      expect(plan(status)).toBe("none");
    },
  );

  it("无状态码（网络层失败）不触发回退", () => {
    expect(plan(undefined)).toBe("none");
  });

  it("403 与 404 的处理必须不同——这正是原实现漏掉的分支", () => {
    expect(plan(403)).not.toBe(plan(404));
    expect(plan(404)).not.toBe("none");
  });
});
