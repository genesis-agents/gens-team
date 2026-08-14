import { Injectable, Logger } from "@nestjs/common";
import { getErrorMessage } from "../../../../common/utils/error.utils";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import axios from "axios";
// 使用 legacy 版本，兼容 Node.js 环境（无需 DOMMatrix）
import type * as pdfjsLibType from "pdfjs-dist/legacy/build/pdf.mjs";
// ★ 用 @napi-rs/canvas 而非 node-canvas：node-canvas 无法渲染 pdfjs v5 的字体
//   （浏览器靠 @font-face，node-canvas 没有 → 正文文字画不出来、含图 PDF 抛
//   "Image or Canvas expected"）。@napi-rs/canvas 是 pdfjs 官方 Node 示例所用，
//   自带预编译二进制（无需 cairo/pango 系统库），文字与图片均正常光栅化。
import type { createCanvas as createCanvasType } from "@napi-rs/canvas";
import { ObjectStorageService } from "../../../platform/facade";

/**
 * 懒加载 @napi-rs/canvas —— 实测 require 开销约 21MB（native 绑定），
 * 只有真正渲染 PDF 缩略图时才载入。
 * 用同步 require：下面的 NapiCanvasFactory.create() 是 pdfjs 回调的同步方法。
 * 见 2026-08-14 Railway 内存成本治理。
 *
 * 注意返回函数本身而不是包一层转发：createCanvas 是重载函数，
 * 用 `...args: Parameters<typeof createCanvasType>` 转发只会取到最后一个重载，
 * 把 2 参数用法和 Canvas 返回类型压塌。
 */
let createCanvasFn: typeof createCanvasType | null = null;
function createCanvas(): typeof createCanvasType {
  if (!createCanvasFn) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    createCanvasFn = (
      require("@napi-rs/canvas") as typeof import("@napi-rs/canvas")
    ).createCanvas;
  }
  return createCanvasFn;
}

/**
 * 懒加载 pdfjs-dist —— 实测它连同传递依赖约 31.6MB，且**它自己会 require
 * @napi-rs/canvas**。所以只把 createCanvas 改懒是不够的：顶层 import pdfjs
 * 依然会把 canvas 一起拉进来（已用 require.cache 实测确认）。两者都懒才有效。
 * 见 2026-08-14 Railway 内存成本治理。
 */
let pdfjsRuntime: typeof pdfjsLibType | null = null;
function loadPdfjs(): typeof pdfjsLibType {
  if (!pdfjsRuntime) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfjsRuntime =
      require("pdfjs-dist/legacy/build/pdf.mjs") as typeof pdfjsLibType;
  }
  return pdfjsRuntime;
}

/**
 * 懒加载 sharp —— 原来这行注释写着"动态导入"，但它是**顶层** require，
 * 实际每次进程启动都会加载 native 绑定（约 8MB）。改为真正按需载入。
 * 见 2026-08-14 Railway 内存成本治理。
 */
let sharpRuntime: typeof import("sharp") | null = null;
function loadSharp(): typeof import("sharp") {
  if (!sharpRuntime) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sharpRuntime = require("sharp") as typeof import("sharp");
  }
  return sharpRuntime;
}

/**
 * pdfjs 标准字体目录（base-14 等）。pdfjs v5 在 Node 下必须显式提供
 * standardFontDataUrl，否则正文文字无法渲染。路径需正斜杠 + 末尾 "/"。
 */
function resolveStandardFontDataUrl(): string {
  const pkg = require.resolve("pdfjs-dist/package.json");
  return (
    path.join(path.dirname(pkg), "standard_fonts").replace(/\\/g, "/") + "/"
  );
}

/**
 * pdfjs 在 Node 渲染含图片 PDF 时需要 CanvasFactory 创建中间 canvas。
 * 不提供则抛 "Image or Canvas expected"。
 */
class NapiCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas()(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(
    cc: { canvas: { width: number; height: number } },
    width: number,
    height: number,
  ) {
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  destroy(cc: { canvas: unknown; context: unknown }) {
    cc.canvas = null;
    cc.context = null;
  }
}

/**
 * PDF缩略图生成服务
 *
 * 渲染 PDF 第一页为图片。生产环境上传到对象存储（R2，持久化），
 * 本地未配置对象存储时回退到本地文件系统（仅开发用）。
 *
 * ── 为什么走 R2 而非本地文件 ──
 * 本地 `public/thumbnails/*.jpg` 全项目无人静态服务，且 Railway 文件系统是临时的
 * （重启即丢）；缓存进 DB 的 URL 会变 404 破图。对象存储返回的 URL 持久可达。
 */
@Injectable()
export class PdfThumbnailService {
  private readonly logger = new Logger(PdfThumbnailService.name);
  private thumbnailDir = path.join(process.cwd(), "public", "thumbnails");
  private readonly thumbnailWidth = 400; // 缩略图宽度
  private readonly thumbnailHeight = 566; // 缩略图高度 (A4比例)

  constructor(private readonly objectStorage: ObjectStorageService) {
    void this.ensureThumbnailDirExists();
  }

  /**
   * 确保缩略图目录存在，若主目录不可写则回退到 /tmp
   */
  private async ensureThumbnailDirExists() {
    try {
      await fs.mkdir(this.thumbnailDir, { recursive: true });
      this.logger.log(`Thumbnail directory ensured at: ${this.thumbnailDir}`);
    } catch (error) {
      this.logger.warn(
        `Failed to create thumbnail directory at ${this.thumbnailDir}: ${error}`,
      );
      // Fallback to /tmp for restricted filesystems (e.g., Railway)
      const fallbackDir = path.join(os.tmpdir(), "thumbnails");
      try {
        await fs.mkdir(fallbackDir, { recursive: true });
        this.thumbnailDir = fallbackDir;
        this.logger.log(
          `Using fallback thumbnail directory: ${this.thumbnailDir}`,
        );
      } catch (fallbackError) {
        this.logger.error(
          `Failed to create fallback thumbnail directory: ${fallbackError}`,
        );
      }
    }
  }

  /**
   * 从PDF URL生成缩略图
   * @param pdfUrl PDF文件URL
   * @param resourceId 资源ID (用于文件命名)
   * @returns 缩略图URL
   */
  async generateThumbnail(
    pdfUrl: string,
    resourceId: string,
  ): Promise<string | null> {
    try {
      this.logger.log(
        `Generating thumbnail for resource ${resourceId} from ${pdfUrl}`,
      );

      // 1. 下载PDF
      this.logger.debug(`Step 1: Downloading PDF from ${pdfUrl}`);
      const pdfData = await this.downloadPdf(pdfUrl);
      if (!pdfData) {
        this.logger.warn(`Failed to download PDF for resource ${resourceId}`);
        return null;
      }
      this.logger.debug(`Step 1: Downloaded ${pdfData.length} bytes`);

      // 2. 加载PDF文档（提供 standardFontDataUrl + canvasFactory，否则文字/图片画不出来）
      this.logger.debug(`Step 2: Loading PDF document`);
      // Convert Buffer to Uint8Array for pdfjs-dist
      const uint8Array = new Uint8Array(pdfData);
      // canvasFactory 在运行时受支持，但该版本 pdfjs 的类型未声明 → cast 绕过。
      const pdfjsLib = loadPdfjs();
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        standardFontDataUrl: resolveStandardFontDataUrl(),
        canvasFactory: new NapiCanvasFactory(),
      } as unknown as Parameters<typeof pdfjsLib.getDocument>[0]);
      const pdfDocument = await loadingTask.promise;
      this.logger.debug(
        `Step 2: PDF loaded with ${pdfDocument.numPages} pages`,
      );

      // 3. 获取第一页
      const page = await pdfDocument.getPage(1);

      // 4. 设置缩放比例以匹配目标尺寸
      const viewport = page.getViewport({ scale: 1.0 });
      const scale = Math.min(
        this.thumbnailWidth / viewport.width,
        this.thumbnailHeight / viewport.height,
      );
      const scaledViewport = page.getViewport({ scale });

      // 5. 创建canvas
      const canvas = createCanvas()(
        scaledViewport.width,
        scaledViewport.height,
      );
      const context = canvas.getContext("2d");

      // 6. 渲染PDF页面到canvas（canvasFactory 已在 getDocument 提供）
      const renderContext = {
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport: scaledViewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      };
      await page.render(renderContext).promise;

      // 7. 转换为buffer
      const buffer = canvas.toBuffer("image/png");

      // 8. 使用sharp优化图片（可选：压缩、调整大小）
      const optimizedBuffer = await loadSharp()(buffer)
        .resize(this.thumbnailWidth, this.thumbnailHeight, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      const filename = `${resourceId}.jpg`;

      // 9. 优先上传对象存储（持久、可达）。返回的预签名 URL 由读取层按需续签。
      if (this.objectStorage.isEnabled()) {
        const uploadResult = await this.objectStorage.uploadBuffer(
          optimizedBuffer,
          "thumbnails",
          filename,
          "image/jpeg",
        );
        if (uploadResult.success && uploadResult.url) {
          this.logger.log(
            `Thumbnail uploaded to object storage for resource ${resourceId}`,
          );
          return uploadResult.url;
        }
        this.logger.warn(
          `Object storage upload failed for ${resourceId} (${uploadResult.error}); falling back to local file`,
        );
      }

      // 10. 回退：写本地文件（仅开发环境 / 对象存储未配置时）
      const filepath = path.join(this.thumbnailDir, filename);
      await fs.writeFile(filepath, optimizedBuffer);

      this.logger.log(
        `Thumbnail generated (local fallback) for resource ${resourceId}`,
      );

      return `/thumbnails/${filename}`;
    } catch (error) {
      this.logger.error(
        `Failed to generate thumbnail for resource ${resourceId}:`,
        getErrorMessage(error),
      );
      return null;
    }
  }

  /**
   * 下载PDF文件
   * @param url PDF URL
   * @returns PDF数据buffer
   */
  private async downloadPdf(url: string): Promise<Buffer | null> {
    // arXiv 的 /abs/ 与 /html/ 链接不是 PDF（喂给 pdfjs 会 "Invalid PDF structure"）；
    // 统一规范化为 /pdf/{id} 直链。
    const pdfUrl = this.normalizeToPdfUrl(url);
    try {
      const response = await axios.get(pdfUrl, {
        responseType: "arraybuffer",
        timeout: 30000, // 30秒超时
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/pdf,*/*",
        },
      });

      // 校验确实是 PDF：内容类型或魔数 %PDF，避免把 HTML 错误页喂给 pdfjs。
      const contentType = String(
        response.headers?.["content-type"] ?? "",
      ).toLowerCase();
      const buf = Buffer.from(response.data);
      const looksPdf =
        contentType.includes("pdf") ||
        buf.subarray(0, 5).toString() === "%PDF-";
      if (!looksPdf) {
        this.logger.warn(
          `Downloaded content from ${pdfUrl} is not a PDF (content-type: ${contentType || "unknown"})`,
        );
        return null;
      }

      return buf;
    } catch (error) {
      this.logger.error(
        `Failed to download PDF from ${pdfUrl}:`,
        getErrorMessage(error),
      );
      return null;
    }
  }

  /**
   * 把 arXiv 的 abs/html 链接规范化为 PDF 直链；其它 URL 原样返回。
   * 例：arxiv.org/abs/2606.05389 | arxiv.org/html/2603.00356v1 → arxiv.org/pdf/<id>
   */
  private normalizeToPdfUrl(url: string): string {
    const m = url.match(/arxiv\.org\/(?:abs|html|pdf)\/(\d+\.\d+)(v\d+)?/i);
    if (m) {
      return `https://arxiv.org/pdf/${m[1]}${m[2] ?? ""}`;
    }
    return url;
  }

  /**
   * 检查缩略图是否存在
   * @param resourceId 资源ID
   * @returns 是否存在
   */
  async thumbnailExists(resourceId: string): Promise<boolean> {
    try {
      const filename = `${resourceId}.jpg`;
      const filepath = path.join(this.thumbnailDir, filename);
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除缩略图
   * @param resourceId 资源ID
   */
  async deleteThumbnail(resourceId: string): Promise<void> {
    try {
      const filename = `${resourceId}.jpg`;
      const filepath = path.join(this.thumbnailDir, filename);
      await fs.unlink(filepath);
      this.logger.log(`Deleted thumbnail for resource ${resourceId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to delete thumbnail for resource ${resourceId}:`,
        getErrorMessage(error),
      );
    }
  }

  /**
   * 批量生成缩略图
   * @param resources 包含pdfUrl和id的资源列表
   * @returns 生成结果统计
   */
  async generateBatchThumbnails(
    resources: Array<{ id: string; pdfUrl: string }>,
  ): Promise<{ success: number; failed: number; skipped: number }> {
    const stats = { success: 0, failed: 0, skipped: 0 };

    for (const resource of resources) {
      // 检查是否已有缩略图
      if (await this.thumbnailExists(resource.id)) {
        this.logger.log(
          `Thumbnail already exists for resource ${resource.id}, skipping`,
        );
        stats.skipped++;
        continue;
      }

      // 生成缩略图
      const thumbnailUrl = await this.generateThumbnail(
        resource.pdfUrl,
        resource.id,
      );
      if (thumbnailUrl) {
        stats.success++;
      } else {
        stats.failed++;
      }

      // 添加延迟避免过快请求
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.logger.log(
      `Batch thumbnail generation completed: ${stats.success} success, ${stats.failed} failed, ${stats.skipped} skipped`,
    );

    return stats;
  }
}
