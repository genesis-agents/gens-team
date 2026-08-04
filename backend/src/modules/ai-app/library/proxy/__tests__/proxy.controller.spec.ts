/**
 * ProxyController supplemental tests
 * Covers: proxyPdf, proxyHtml, proxyImage, isBlockedAddress, markdownToHtml, extractTitleFromUrl
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpException, HttpStatus } from "@nestjs/common";
import { ProxyController } from "../proxy.controller";
import { AdvancedExtractorService } from "../../../../../common/content-processing/advanced-extractor.service";
import { NewsExtractorService } from "../news-extractor.service";
import { PuppeteerFetcherService } from "../puppeteer-fetcher.service";
import { FlareSolverrService } from "../flaresolverr.service";
import axios from "axios";

jest.mock("axios");

// SSRF guard does real DNS; mock it so proxy fetch/fallback flows are driven by
// the mocked axios (real SSRF logic is covered by ssrf-guard.spec + safe-proxy-fetch.spec).
jest.mock("../../../../ai-engine/safety/security/ssrf/ssrf-guard", () => ({
  assertUrlSafe: jest.fn(async (u) => new URL(u)),
  safeFetch: jest.fn(),
  isBlockedIp: jest.fn(() => false),
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock APP_CONFIG
jest.mock("../../../../../common/config/app.config", () => ({
  APP_CONFIG: {
    brand: {
      userAgent: "TestBot/1.0",
    },
  },
}));

// PR-X29: removed dead jest.mock for src/config/domain-whitelist.config —
// that file had no production import sites; the whitelist responsibility now
// lives in ai-app/explore/ingestion/config/services/source-whitelist.service.

describe("ProxyController - PDF Proxy", () => {
  let controller: ProxyController;

  const mockRes = () => ({
    setHeader: jest.fn(),
    removeHeader: jest.fn(),
    send: jest.fn(),
  });

  beforeEach(async () => {
    // Clear previous test's mock state before setting up fresh mocks
    jest.clearAllMocks();

    const mockAdvancedExtractor = {
      extract: jest.fn().mockResolvedValue({
        success: true,
        title: "Test",
        content: "<p>content</p>",
        textContent: "content",
        excerpt: "excerpt",
        siteName: "example",
        length: 100,
        plan: "readability",
        confidence: 85,
      }),
    };

    const mockNewsExtractor = {
      extractNews: jest.fn().mockResolvedValue({
        title: "Test",
        excerpt: "excerpt",
        author: null,
        publishedAt: null,
        siteName: "Example",
        imageUrl: null,
        source: "opengraph",
        confidence: 75,
      }),
      detectMetaRefreshRedirect: jest
        .fn()
        .mockReturnValue({ isRedirect: false, redirectUrl: null }),
    };

    const mockPuppeteerFetcher = {
      fetchPage: jest.fn().mockResolvedValue({
        success: false,
        html: null,
      }),
    };

    const mockFlareSolverr = {
      getIsAvailable: jest.fn().mockReturnValue(false),
      fetchPage: jest.fn().mockResolvedValue({ success: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        { provide: AdvancedExtractorService, useValue: mockAdvancedExtractor },
        { provide: NewsExtractorService, useValue: mockNewsExtractor },
        { provide: PuppeteerFetcherService, useValue: mockPuppeteerFetcher },
        { provide: FlareSolverrService, useValue: mockFlareSolverr },
      ],
    }).compile();

    controller = module.get<ProxyController>(ProxyController);

    (axios as unknown as Record<string, unknown>).isAxiosError = (
      payload: unknown,
    ): boolean => !!(payload as Record<string, unknown>)?.isAxiosError;
  });

  describe("proxyPdf", () => {
    it("should throw BAD_REQUEST when url is missing", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf(undefined as unknown as string, res as never),
      ).rejects.toThrow(HttpException);

      try {
        await controller.proxyPdf(undefined as unknown as string, res as never);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it("should throw FORBIDDEN for localhost address", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://localhost/file.pdf", res as never),
      ).rejects.toThrow(HttpException);

      try {
        await controller.proxyPdf("http://localhost/file.pdf", res as never);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it("should throw FORBIDDEN for internal IPv4 (10.x.x.x)", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://10.0.0.1/file.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should throw FORBIDDEN for 192.168.x.x", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://192.168.1.1/file.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should throw FORBIDDEN for 172.16.x.x", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://172.16.0.1/file.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should throw FORBIDDEN for 169.254.x.x link-local", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://169.254.1.1/file.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should throw FORBIDDEN for IPv6 loopback [::1]", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://[::1]/file.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should proxy PDF successfully for public URL", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: pdfBuffer,
        headers: {},
      });
      const res = mockRes();

      await controller.proxyPdf("https://arxiv.org/pdf/1234.pdf", res as never);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "inline",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Origin",
        "*",
      );
      expect(res.send).toHaveBeenCalled();
    });

    it("should throw BAD_GATEWAY when axios request fails", async () => {
      const axiosError = {
        isAxiosError: true,
        message: "Request failed",
        response: { status: 503 },
      };
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      (axios as unknown as Record<string, unknown>).isAxiosError = () => true;

      const res = mockRes();
      await expect(
        controller.proxyPdf("https://arxiv.org/pdf/1234.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should throw INTERNAL_SERVER_ERROR for non-axios errors", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Unknown error"));

      const res = mockRes();
      await expect(
        controller.proxyPdf("https://arxiv.org/pdf/1234.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should block 127.0.0.x addresses", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://127.0.0.1/file.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should block 0.0.0.0 addresses", async () => {
      const res = mockRes();
      await expect(
        controller.proxyPdf("http://0.0.0.0/file.pdf", res as never),
      ).rejects.toThrow(HttpException);
    });
  });

  describe("proxyHtml", () => {
    it("should throw BAD_REQUEST when url is missing", async () => {
      const res = mockRes();
      await expect(controller.proxyHtml("", res as never)).rejects.toThrow(
        HttpException,
      );
    });

    it("should proxy HTML successfully for any public domain", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: "<html><head><title>Test</title></head><body><p>Content</p></body></html>",
        headers: {},
      });
      const res = mockRes();

      await controller.proxyHtml("https://arxiv.org/abs/1234", res as never);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/html; charset=utf-8",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Origin",
        "*",
      );
      expect(res.removeHeader).toHaveBeenCalledWith("Content-Security-Policy");
      expect(res.removeHeader).toHaveBeenCalledWith("X-Frame-Options");
      expect(res.send).toHaveBeenCalled();
    });

    it("should inject base tag when <head> is present", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: "<html><head><title>Test</title></head><body></body></html>",
        headers: {},
      });
      const res = mockRes();

      await controller.proxyHtml("https://arxiv.org/abs/1234", res as never);

      const sentHtml = res.send.mock.calls[0][0] as string;
      expect(sentHtml).toContain('<base href="https://arxiv.org/abs/1234/"');
    });

    it("should handle uppercase HEAD tag", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: "<HTML><HEAD><TITLE>Test</TITLE></HEAD><BODY></BODY></HTML>",
        headers: {},
      });
      const res = mockRes();

      await controller.proxyHtml("https://arxiv.org/page", res as never);

      const sentHtml = res.send.mock.calls[0][0] as string;
      expect(sentHtml).toContain("<base href=");
    });

    it("should remove CSP meta tags from HTML", async () => {
      // Note: The regex in proxyHtml uses [^"']* which cannot match values
      // containing single quotes (e.g. "default-src 'self'"). Use a CSP value
      // without single quotes to test the regex correctly.
      const htmlWithCSP = `<html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src https://example.com">
        <title>Test</title>
      </head><body></body></html>`;
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: htmlWithCSP,
        headers: {},
      });
      const res = mockRes();

      await controller.proxyHtml("https://arxiv.org/page", res as never);

      const sentHtml = res.send.mock.calls[0][0] as string;
      expect(sentHtml).not.toContain("Content-Security-Policy");
    });

    it("should throw BAD_GATEWAY for axios error", async () => {
      const axiosError = {
        isAxiosError: true,
        message: "Connection error",
        response: { status: 502 },
      };
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      (axios as unknown as Record<string, unknown>).isAxiosError = () => true;

      const res = mockRes();
      await expect(
        controller.proxyHtml("https://arxiv.org/page", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should throw INTERNAL_SERVER_ERROR for non-axios errors", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Generic error"));

      const res = mockRes();
      await expect(
        controller.proxyHtml("https://arxiv.org/page", res as never),
      ).rejects.toThrow(HttpException);
    });
  });

  describe("proxyImage", () => {
    const mockResponse = () => {
      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
        end: jest.fn(),
        status: jest.fn(),
        headersSent: false,
      };
      res.status.mockReturnValue(res); // chainable: res.status(200).send(...)
      return res;
    };

    it("should throw BAD_REQUEST when url is missing", async () => {
      const res = mockResponse();
      await expect(controller.proxyImage("", res as never)).rejects.toThrow(
        HttpException,
      );
    });

    it("should throw BAD_REQUEST for invalid protocol (ftp://)", async () => {
      const res = mockResponse();
      await expect(
        controller.proxyImage("ftp://example.com/image.png", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should throw FORBIDDEN for internal IP in image URL", async () => {
      const res = mockResponse();
      await expect(
        controller.proxyImage("http://10.0.0.1/image.png", res as never),
      ).rejects.toThrow(HttpException);
    });

    it("should proxy image successfully", async () => {
      const imageData = Buffer.from("fake-image-bytes");
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: imageData,
        headers: { "content-type": "image/png" },
      });
      const res = mockResponse();

      await controller.proxyImage(
        "https://example.com/image.png",
        res as never,
      );

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cache-Control",
        "public, max-age=86400",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Access-Control-Allow-Origin",
        "*",
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cross-Origin-Resource-Policy",
        "cross-origin",
      );
      expect(res.send).toHaveBeenCalled();
    });

    it("should use default content-type when header is missing", async () => {
      const imageData = Buffer.from("fake-image-bytes");
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: imageData,
        headers: {},
      });
      const res = mockResponse();

      await controller.proxyImage(
        "https://example.com/image.jpg",
        res as never,
      );

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    });

    // ★ 2026-05-25: 外部图拉取失败改为返回透明占位图(200)，不再抛 5xx(避免误报告警)。
    // ★ 2026-08-04（生产实证 mission 4dfaa4b3：报告 21 张配图全是空框）：
    //   原行为是"拉不到图 → 200 + 1×1 透明 PNG"。躲开了 5xx 的 Critical 告警，
    //   代价是**把失败伪装成成功**：浏览器判定加载成功 → <img onError> 永不触发
    //   → FigureRenderer 两道"隐藏无效图"的防线全废 → 预留出一大片空白。
    //   现在默认 404（同样不是 5xx、同样不触发 Critical 告警，但对 <img> 是明确
    //   失败信号）。想要旧行为必须显式传 onFail=pixel。
    it("★ 直接抓取 403 且 FlareSolverr 不可用 → 404，绝不伪装成 200 图片", async () => {
      const fetchError = {
        isAxiosError: true,
        response: { status: 403 },
        message: "403 Forbidden",
      };
      mockedAxios.get.mockRejectedValueOnce(fetchError);
      (axios as unknown as Record<string, unknown>).isAxiosError = () => true;

      const res = mockResponse();
      await controller.proxyImage(
        "https://example.com/protected-image.png",
        res as never,
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.setHeader).toHaveBeenCalledWith(
        "X-Image-Proxy-Failure",
        "upstream-fetch-failed",
      );
      // 关键：不得再发出任何"看起来是图片"的响应体
      expect(res.setHeader).not.toHaveBeenCalledWith(
        "Content-Type",
        "image/png",
      );
      expect(res.send).not.toHaveBeenCalled();
    });

    // ★ 2026-08-04 容器内实测：我们伪装成 Chrome 的 header 正是被 Akamai bot
    //   检测拒绝的原因（403 server=AkamaiGHost），而**裸请求**被当普通客户端放行
    //   （200 server=Apache）。21 张图逐个跑：伪装成功 20/21、裸请求成功 20/21、
    //   两者都失败 0 张，裸请求独家救回 1 张。故 403 后先试裸请求。
    it("★ 403 后用裸请求（不带伪装浏览器头）重试成功 → 正常返回图片", async () => {
      const fetchError = {
        isAxiosError: true,
        response: { status: 403 },
        message: "403 Forbidden",
      };
      (axios as unknown as Record<string, unknown>).isAxiosError = () => true;
      mockedAxios.get.mockRejectedValueOnce(fetchError);
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("real-image-bytes"),
        headers: { "content-type": "image/webp" },
      });

      const res = mockResponse();
      await controller.proxyImage(
        "https://web-assets.bcg.com/blocked-by-bot-detection.webp",
        res as never,
      );

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/webp");
      expect(res.send).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(404);

      // 裸请求必须**不带**伪装的浏览器 header —— 带上就是被拒的原因
      const bareCall = mockedAxios.get.mock.calls[1];
      const bareHeaders = (bareCall[1] as { headers?: Record<string, string> })
        ?.headers;
      expect(bareHeaders?.["User-Agent"]).toBeUndefined();
      expect(bareHeaders?.Referer).toBeUndefined();
    });

    it("裸请求拿到的不是图片（如拦截页 HTML）→ 不当成功，继续走失败路径", async () => {
      const fetchError = {
        isAxiosError: true,
        response: { status: 403 },
        message: "403 Forbidden",
      };
      (axios as unknown as Record<string, unknown>).isAxiosError = () => true;
      mockedAxios.get.mockRejectedValueOnce(fetchError);
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("<html>Access Denied</html>"),
        headers: { "content-type": "text/html" },
      });

      const res = mockResponse();
      await controller.proxyImage(
        "https://example.com/blocked.png",
        res as never,
      );

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).not.toHaveBeenCalled();
    });

    it("★ 非 axios 异常 → 同样 404（且仍不是 5xx，不触发 Critical 告警）", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Generic network error"));

      const res = mockResponse();
      await controller.proxyImage(
        "https://example.com/image.png",
        res as never,
      );
      expect(res.status).toHaveBeenCalledWith(404);
      const statuses = res.status.mock.calls.map((c: unknown[]) => c[0]);
      expect(statuses.every((st: number) => st < 500)).toBe(true);
    });

    it("onFail=pixel 时才回到旧的占位图行为（调用方显式选择）", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("boom"));

      const res = mockResponse();
      await controller.proxyImage(
        "https://example.com/image.png",
        res as never,
        "pixel",
      );
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalled();
      // 即便是占位图也要带上失败原因头，便于排障。
      // 这条路径走的是内层 catch（抓取失败），reason=upstream-fetch-failed；
      // proxy-error 是外层 catch（URL 解析/SSRF 之外的异常）才用的。
      expect(res.setHeader).toHaveBeenCalledWith(
        "X-Image-Proxy-Failure",
        "upstream-fetch-failed",
      );
    });
  });

  describe("proxyHtmlReader", () => {
    it("should throw BAD_REQUEST when url is missing", async () => {
      await expect(controller.proxyHtmlReader("")).rejects.toThrow(
        HttpException,
      );
    });

    it("should return content on success", async () => {
      const html = `<html><head><title>Article Title</title></head>
        <body><article><p>Main content that is long enough.</p></article></body></html>`;
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: html,
        headers: {},
      });

      const result = await controller.proxyHtmlReader(
        "https://arxiv.org/abs/1234",
      );

      expect(result.title).toBeDefined();
    });

    it("should return graceful degradation when all fallbacks fail after 403", async () => {
      const fetchError = {
        isAxiosError: true,
        response: { status: 403 },
        message: "Forbidden",
      };
      mockedAxios.get.mockRejectedValueOnce(fetchError);
      mockedAxios.get.mockRejectedValueOnce(new Error("Jina failed")); // fetchViaJinaReader
      (axios as unknown as Record<string, unknown>).isAxiosError = () => true;

      const result = await controller.proxyHtmlReader("https://arxiv.org/page");

      expect(result.success).toBe(false);
      expect(result.requiresCaptcha).toBe(true);
    });

    it("should throw UNPROCESSABLE_ENTITY when extraction fails", async () => {
      const html = "<html><head></head><body></body></html>";
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: html,
        headers: {},
      });

      // Override extract to return empty
      const module: TestingModule = await Test.createTestingModule({
        controllers: [ProxyController],
        providers: [
          {
            provide: AdvancedExtractorService,
            useValue: {
              extract: jest.fn().mockResolvedValue({
                success: false,
                length: 0,
                title: "",
                content: "",
                textContent: "",
                excerpt: "",
                plan: "d",
                confidence: 0,
              }),
            },
          },
          {
            provide: NewsExtractorService,
            useValue: {
              extractNews: jest.fn(),
              detectMetaRefreshRedirect: jest
                .fn()
                .mockReturnValue({ isRedirect: false }),
            },
          },
          {
            provide: PuppeteerFetcherService,
            useValue: { fetchPage: jest.fn() },
          },
          {
            provide: FlareSolverrService,
            useValue: {
              getIsAvailable: jest.fn().mockReturnValue(false),
              fetchPage: jest.fn(),
            },
          },
        ],
      }).compile();

      const ctrl = module.get<ProxyController>(ProxyController);
      await expect(
        ctrl.proxyHtmlReader("https://arxiv.org/abs/1234"),
      ).rejects.toThrow(HttpException);
    });
  });

  describe("proxyHtmlReaderNews - PDF detection", () => {
    it("should return isPdf:true for .pdf URL", async () => {
      const result = await controller.proxyHtmlReaderNews(
        "https://arxiv.org/papers/test.pdf",
      );

      expect(result.isPdf).toBe(true);
      expect(result.pdfUrl).toContain(".pdf");
    });

    it("should throw BAD_REQUEST when url is empty", async () => {
      await expect(controller.proxyHtmlReaderNews("")).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe("SSRF protection - isBlockedAddress (via proxyPdf)", () => {
    const res = () => ({
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
      send: jest.fn(),
    });

    it("should block IPv4 172.31.x.x (private range)", async () => {
      await expect(
        controller.proxyPdf("http://172.31.0.1/file.pdf", res() as never),
      ).rejects.toThrow(HttpException);
    });

    it("should allow public IPv4 address", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: Buffer.from("PDF"),
        headers: {},
      });
      const response = res();
      // Should not throw for a public IP
      await expect(
        controller.proxyPdf("http://8.8.8.8/file.pdf", response as never),
      ).resolves.toBeUndefined();
    });
  });
});
