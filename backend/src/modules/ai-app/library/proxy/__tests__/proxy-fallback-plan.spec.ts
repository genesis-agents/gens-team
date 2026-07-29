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

/**
 * 内容级拦截识别 —— looksBlockedPage
 *
 * 状态码靠不住：MDPI 走 Akamai，对数据中心 IP 返回 **HTTP 200 + Access Denied**
 * （2.2KB / 空 title / 零 meta）。所有基于状态码的分支都被骗过，只能看内容。
 */
describe("ProxyController.looksBlockedPage", () => {
  let controller: ProxyController;
  const blocked = (html: string | undefined): boolean =>
    (
      controller as unknown as {
        looksBlockedPage: (h: string | undefined) => boolean;
      }
    ).looksBlockedPage(html);

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

  it("识别 MDPI/Akamai 的 200 拦截页（线上实际响应）", () => {
    const real =
      "<HTML><HEAD>\n<TITLE>Access Denied</TITLE>\n</HEAD><BODY>\n<H1>Access Denied</H1>\n" +
      'You don\'t have permission to access "http://www.mdpi.com/2071-1050/17/2/648" on this server.<P>\n' +
      "Reference #18.ea182117.1785299777.2f0981\n" +
      "<P>https://errors.edgesuite.net/18.ea182117.1785299777.2f0981</P>\n</BODY>\n</HTML>";
    expect(blocked(real)).toBe(true);
  });

  it.each([
    [
      "Cloudflare",
      "<html><title>Just a moment...</title><div class='cf-browser-verification'></div></html>",
    ],
    ["PerimeterX", "<html><body>px-captcha blocked</body></html>"],
    ["DataDome", "<html><body>datadome protection</body></html>"],
    [
      "需开 JS",
      "<html><body>Please enable JavaScript to continue</body></html>",
    ],
  ])("识别 %s 拦截页", (_name, html) => {
    expect(blocked(html)).toBe(true);
  });

  it("正常文章不误判：即便正文里出现 access denied 字样，只要篇幅正常就放行", () => {
    const article =
      "<html><body><article>" +
      "The system returned access denied when the operator lacked permission. ".repeat(
        400,
      ) +
      "</article></body></html>";
    expect(article.length).toBeGreaterThan(15000);
    expect(blocked(article)).toBe(false);
  });

  it("空/undefined 不算拦截", () => {
    expect(blocked(undefined)).toBe(false);
    expect(blocked("")).toBe(false);
  });
});
