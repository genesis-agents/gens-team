import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { YoutubeController } from "../youtube.controller";
import { YoutubeService } from "@/modules/ai-harness/facade";
import { PdfGeneratorService } from "../pdf-generator.service";
import { Response } from "express";

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_TRANSCRIPT = {
  videoId: "dQw4w9WgXcQ",
  title: "Rick Astley - Never Gonna Give You Up",
  transcript: [
    { text: "We're no strangers to love", start: 0, duration: 3 },
    { text: "You know the rules and so do I", start: 3, duration: 3 },
  ],
  language: "en",
  hasTranslation: false,
};

// 翻译数据走 translatedTranscript 侧通道（可能稀疏），transcript 始终是原始字幕
const MOCK_TRANSCRIPT_WITH_TRANSLATION = {
  ...MOCK_TRANSCRIPT,
  hasTranslation: true,
  translatedTranscript: [
    {
      text: "We're no strangers to love",
      start: 0,
      duration: 3,
      translatedText: "我们对爱并不陌生",
    },
    {
      text: "You know the rules and so do I",
      start: 3,
      duration: 3,
      translatedText: "你知道规则，我也是",
    },
  ],
};

const MOCK_ALIGNED = {
  english: [{ text: "We're no strangers to love", start: 0, duration: 3 }],
  chinese: [{ text: "我们对爱并不陌生", start: 0, duration: 3 }],
};

function _buildMockResponse(): jest.Mocked<Partial<Response>> {
  const _pipeTarget: { on: jest.Mock; pipe: jest.Mock } = {
    on: jest.fn().mockReturnThis(),
    pipe: jest.fn(),
  };

  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    headersSent: false,
  } as jest.Mocked<Partial<Response>>;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("YoutubeController", () => {
  let controller: YoutubeController;
  let youtubeService: jest.Mocked<YoutubeService>;
  let pdfGeneratorService: jest.Mocked<PdfGeneratorService>;

  beforeEach(async () => {
    const mockYoutubeService = {
      getTranscript: jest.fn(),
      getTranslationStatus: jest.fn(),
      cacheTranscript: jest.fn(),
      saveTranslation: jest.fn(),
    };

    const mockPdfGeneratorService = {
      alignTranscripts: jest.fn(),
      generatePdf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [YoutubeController],
      providers: [
        { provide: YoutubeService, useValue: mockYoutubeService },
        { provide: PdfGeneratorService, useValue: mockPdfGeneratorService },
      ],
    }).compile();

    controller = module.get<YoutubeController>(YoutubeController);
    youtubeService = module.get(YoutubeService);
    pdfGeneratorService = module.get(PdfGeneratorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── getTranscript ────────────────────────────────────────────────────────────

  describe("GET /youtube/transcript/:videoId", () => {
    it("should delegate to youtubeService.getTranscript", async () => {
      youtubeService.getTranscript.mockResolvedValue(MOCK_TRANSCRIPT);

      const result = await controller.getTranscript("dQw4w9WgXcQ");

      expect(youtubeService.getTranscript).toHaveBeenCalledWith("dQw4w9WgXcQ");
      expect(result).toEqual(MOCK_TRANSCRIPT);
    });

    it("should throw BadRequestException for empty videoId", async () => {
      await expect(controller.getTranscript("")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException for whitespace-only videoId", async () => {
      await expect(controller.getTranscript("   ")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should trim whitespace from videoId before delegating", async () => {
      youtubeService.getTranscript.mockResolvedValue(MOCK_TRANSCRIPT);

      await controller.getTranscript("  dQw4w9WgXcQ  ");

      expect(youtubeService.getTranscript).toHaveBeenCalledWith("dQw4w9WgXcQ");
    });
  });

  // ── getSubtitles ─────────────────────────────────────────────────────────────

  describe("POST /youtube/subtitles", () => {
    it("should use cached transcript as native Chinese when cache language is zh", async () => {
      const zhTranscript = {
        videoId: "dQw4w9WgXcQ",
        title: "Rick Astley",
        transcript: [{ text: "我们对爱并不陌生", start: 0, duration: 3 }],
        language: "zh-Hans",
        hasTranslation: false,
      };

      youtubeService.getTranscript.mockResolvedValue(zhTranscript);
      pdfGeneratorService.alignTranscripts.mockReturnValue(MOCK_ALIGNED);

      const result = await controller.getSubtitles({
        videoId: "dQw4w9WgXcQ",
      });

      // 只允许一次 getTranscript 调用——不得再用 lang="zh" 二次探测
      expect(youtubeService.getTranscript).toHaveBeenCalledTimes(1);
      expect(pdfGeneratorService.alignTranscripts).toHaveBeenCalledWith(
        zhTranscript.transcript,
        zhTranscript.transcript,
      );
      expect(result.videoId).toBe("dQw4w9WgXcQ");
      expect(result.english).toEqual(MOCK_ALIGNED.english);
      expect(result.chinese).toEqual(MOCK_ALIGNED.chinese);
      expect(result.hasTranslation).toBe(true);
    });

    it("must NOT present cached English transcript as Chinese (regression 2026-07)", async () => {
      // 历史 bug：缓存查询不区分语言，getTranscript(videoId, "zh") 命中英文缓存后
      // 被当"原生中文"返回，前端把英文当译文预加载，按需 AI 翻译被跳过。
      youtubeService.getTranscript.mockResolvedValue(MOCK_TRANSCRIPT); // language: "en"
      youtubeService.getTranslationStatus.mockResolvedValue({
        hasTranslation: false,
      });
      pdfGeneratorService.alignTranscripts.mockReturnValue({
        english: MOCK_ALIGNED.english,
        chinese: [],
      });

      const result = await controller.getSubtitles({ videoId: "dQw4w9WgXcQ" });

      expect(pdfGeneratorService.alignTranscripts).toHaveBeenCalledWith(
        MOCK_TRANSCRIPT.transcript,
        [], // 中文侧必须为空，不得回填英文
      );
      expect(result.chinese).toEqual([]);
      expect(result.hasTranslation).toBe(false);
    });

    it("must NOT trust a zh language label when content is not Chinese (poisoned cache row)", async () => {
      // 旧版 zh 探测竞态下 saveToCache 会把英文字幕以 language="zh" 落库，
      // 此时应忽略标签、走 translatedTranscript 兜底
      youtubeService.getTranscript.mockResolvedValue({
        ...MOCK_TRANSCRIPT_WITH_TRANSLATION,
        language: "zh",
      });
      pdfGeneratorService.alignTranscripts.mockReturnValue(MOCK_ALIGNED);

      const result = await controller.getSubtitles({ videoId: "dQw4w9WgXcQ" });

      expect(pdfGeneratorService.alignTranscripts).toHaveBeenCalledWith(
        MOCK_TRANSCRIPT_WITH_TRANSLATION.transcript,
        [
          { text: "我们对爱并不陌生", start: 0, duration: 3 },
          { text: "你知道规则，我也是", start: 3, duration: 3 },
        ],
      );
      expect(result.hasTranslation).toBe(true);
    });

    it("should fall back to saved AI translations when cache is not Chinese", async () => {
      youtubeService.getTranscript.mockResolvedValue(
        MOCK_TRANSCRIPT_WITH_TRANSLATION,
      );
      pdfGeneratorService.alignTranscripts.mockReturnValue(MOCK_ALIGNED);

      const result = await controller.getSubtitles({ videoId: "dQw4w9WgXcQ" });

      // 中文侧来自 translatedTranscript 的 translatedText 字段
      expect(youtubeService.getTranscript).toHaveBeenCalledTimes(1);
      expect(pdfGeneratorService.alignTranscripts).toHaveBeenCalledWith(
        MOCK_TRANSCRIPT_WITH_TRANSLATION.transcript,
        [
          { text: "我们对爱并不陌生", start: 0, duration: 3 },
          { text: "你知道规则，我也是", start: 3, duration: 3 },
        ],
      );
      expect(result.chinese).toEqual(MOCK_ALIGNED.chinese);
      expect(result.hasTranslation).toBe(true);
    });

    it("should throw BadRequestException for empty videoId", async () => {
      await expect(controller.getSubtitles({ videoId: "" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException when English transcript fetch fails", async () => {
      youtubeService.getTranscript.mockRejectedValue(
        new Error("Video not found"),
      );

      await expect(
        controller.getSubtitles({ videoId: "invalid" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── clientFetch ──────────────────────────────────────────────────────────────

  describe("POST /youtube/client-fetch/:videoId", () => {
    it("should delegate to youtubeService.getTranscript and return result", async () => {
      youtubeService.getTranscript.mockResolvedValue(MOCK_TRANSCRIPT);

      const result = await controller.clientFetch("dQw4w9WgXcQ", "en");

      expect(youtubeService.getTranscript).toHaveBeenCalledWith(
        "dQw4w9WgXcQ",
        "en",
      );
      expect(result.videoId).toBe("dQw4w9WgXcQ");
      expect(result.source).toBe("server");
      expect(result.language).toBe("en");
    });

    it("should return failed result (not throw) when transcript fetch fails", async () => {
      youtubeService.getTranscript.mockRejectedValue(
        new Error("Transcript unavailable"),
      );

      const result = await controller.clientFetch("dQw4w9WgXcQ", "zh");

      expect(result.source).toBe("failed");
      expect(result.transcript).toEqual([]);
      expect(result.error).toBe("Transcript unavailable");
    });

    it("should throw BadRequestException for empty videoId", async () => {
      await expect(controller.clientFetch("", "en")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should default language to 'en' when not provided", async () => {
      youtubeService.getTranscript.mockResolvedValue(MOCK_TRANSCRIPT);

      const result = await controller.clientFetch("dQw4w9WgXcQ");

      expect(result.language).toBe("en");
    });
  });

  // ── cacheTranscript ──────────────────────────────────────────────────────────

  describe("POST /youtube/cache-transcript", () => {
    it("should delegate to youtubeService.cacheTranscript", async () => {
      youtubeService.cacheTranscript.mockResolvedValue(undefined);

      const body = {
        videoId: "dQw4w9WgXcQ",
        title: "Rick Astley",
        transcript: [{ text: "Hello", start: 0, duration: 2 }],
        language: "en",
      };

      const result = await controller.cacheTranscript(body);

      expect(youtubeService.cacheTranscript).toHaveBeenCalledWith(
        "dQw4w9WgXcQ",
        "Rick Astley",
        body.transcript,
        "en",
      );
      expect(result.videoId).toBe("dQw4w9WgXcQ");
      expect(result.segmentCount).toBe(1);
    });

    it("should throw BadRequestException for empty videoId", async () => {
      await expect(
        controller.cacheTranscript({
          videoId: "",
          title: "Title",
          transcript: [{ text: "x", start: 0, duration: 1 }],
          language: "en",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException for empty transcript array", async () => {
      await expect(
        controller.cacheTranscript({
          videoId: "dQw4w9WgXcQ",
          title: "Title",
          transcript: [],
          language: "en",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should default title to video ID when title is not provided", async () => {
      youtubeService.cacheTranscript.mockResolvedValue(undefined);

      await controller.cacheTranscript({
        videoId: "abc123",
        title: "",
        transcript: [{ text: "text", start: 0, duration: 1 }],
        language: "en",
      });

      expect(youtubeService.cacheTranscript).toHaveBeenCalledWith(
        "abc123",
        "YouTube Video abc123",
        expect.anything(),
        "en",
      );
    });
  });

  // ── saveTranslation ──────────────────────────────────────────────────────────

  describe("POST /youtube/save-translation", () => {
    it("should delegate to youtubeService.saveTranslation", async () => {
      youtubeService.saveTranslation.mockResolvedValue(undefined);

      const body = {
        videoId: "dQw4w9WgXcQ",
        translatedTranscript: [
          { text: "Hello", start: 0, duration: 2, translatedText: "你好" },
        ],
        targetLanguage: "zh",
      };

      const result = await controller.saveTranslation(body);

      expect(youtubeService.saveTranslation).toHaveBeenCalledWith(
        "dQw4w9WgXcQ",
        body.translatedTranscript,
        "zh",
      );
      expect(result.videoId).toBe("dQw4w9WgXcQ");
      expect(result.segmentCount).toBe(1);
      expect(result.targetLanguage).toBe("zh");
    });

    it("should throw BadRequestException for empty videoId", async () => {
      await expect(
        controller.saveTranslation({
          videoId: "",
          translatedTranscript: [
            { text: "x", start: 0, duration: 1, translatedText: "y" },
          ],
          targetLanguage: "zh",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when translatedTranscript is empty", async () => {
      await expect(
        controller.saveTranslation({
          videoId: "abc",
          translatedTranscript: [],
          targetLanguage: "zh",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when targetLanguage is missing", async () => {
      await expect(
        controller.saveTranslation({
          videoId: "abc",
          translatedTranscript: [
            { text: "x", start: 0, duration: 1, translatedText: "y" },
          ],
          targetLanguage: "",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getTranslationStatus ─────────────────────────────────────────────────────

  describe("GET /youtube/translation-status/:videoId", () => {
    it("should delegate to youtubeService.getTranslationStatus", async () => {
      youtubeService.getTranslationStatus.mockResolvedValue({
        hasTranslation: true,
      });

      const result = await controller.getTranslationStatus("dQw4w9WgXcQ");

      expect(youtubeService.getTranslationStatus).toHaveBeenCalledWith(
        "dQw4w9WgXcQ",
      );
      expect(result.hasTranslation).toBe(true);
    });

    it("should throw BadRequestException for empty videoId", async () => {
      await expect(controller.getTranslationStatus("")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should trim whitespace from videoId", async () => {
      youtubeService.getTranslationStatus.mockResolvedValue({
        hasTranslation: false,
      });

      await controller.getTranslationStatus("  dQw4w9WgXcQ  ");

      expect(youtubeService.getTranslationStatus).toHaveBeenCalledWith(
        "dQw4w9WgXcQ",
      );
    });
  });
});
