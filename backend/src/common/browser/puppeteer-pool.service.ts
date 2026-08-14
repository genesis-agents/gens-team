/**
 * Puppeteer Browser Pool Service
 * 集中管理 Puppeteer 浏览器实例，支持本地启动和远程 Browserless 连接
 *
 * 环境变量：
 * - BROWSERLESS_URL: 远程 Browserless WebSocket 地址（如 wss://chrome.browserless.io?token=xxx）
 *   设置后使用远程浏览器，不设置则使用本地 Chromium
 * - PUPPETEER_IDLE_TIMEOUT_MS: 浏览器空闲多久后自动关闭（默认 5 分钟，设为 0 关闭该机制）
 *
 * ★ 2026-08-14 内存成本治理：此前 closeBrowser() 只在 onModuleDestroy 调用，
 *   浏览器一旦拉起就常驻到进程退出。生产实证（Railway deployment
 *   319ab4e6 日志）：08-13 00:28 一次「阅读模式」抓取拉起 Chromium，3 秒
 *   完成后浏览器持续驻留 26+ 小时，容器 RSS 阶跃 +335MB 且再未回落
 *   （整个部署周期只有 1 条 launch 日志、0 条 cleaned up 日志）。
 *   现增加空闲扫描：无活跃页面且超过 idleTimeout 即关闭释放内存，
 *   下次 getBrowser() 会自动重新拉起（冷启动约 1-2s）。
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import puppeteer, { Browser } from "puppeteer";

const DEFAULT_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
  // Anti-detection: prevent websites from detecting headless automation
  "--disable-blink-features=AutomationControlled",
  // Memory optimization for constrained environments (Railway ~1GB)
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--no-first-run",
  "--js-flags=--max-old-space-size=256",
  // ★ 2026-05-25 PDF 导出：渲染页用 file:// 导航以加载抽到临时文件的图片子资源，
  //   默认 file:// 之间互相不可读，此参数放行 file://→file://（只影响 file 源页面，
  //   http(s) / about:blank 页面不受影响，社交浏览等用例无安全面变化）。
  "--allow-file-access-from-files",
];

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;

@Injectable()
export class PuppeteerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerPoolService.name);
  private browserPromise: Promise<Browser> | null = null;
  private lastUsedAt = 0;
  private idleSweeper: NodeJS.Timeout | null = null;
  private sweeping = false;

  private get browserlessUrl(): string | undefined {
    return process.env.BROWSERLESS_URL;
  }

  private get isRemote(): boolean {
    return !!this.browserlessUrl;
  }

  /** 空闲超时（ms）。设为 0 / 负数 / 非法值时禁用自动关闭。 */
  private get idleTimeoutMs(): number {
    const raw = process.env.PUPPETEER_IDLE_TIMEOUT_MS;
    if (raw === undefined || raw === "") {
      return DEFAULT_IDLE_TIMEOUT_MS;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeBrowser();
  }

  /**
   * 获取共享浏览器实例（Promise 缓存模式避免并发启动）
   * - BROWSERLESS_URL 存在时通过 WebSocket 连接远程浏览器
   * - 否则本地启动 Chromium
   */
  async getBrowser(): Promise<Browser> {
    // 先打点再 await —— 空闲扫描以 lastUsedAt 为准，必须在任何 await 之前
    // 更新，否则慢启动期间可能被扫描判定为空闲。
    this.touch();

    if (!this.browserPromise) {
      this.browserPromise = this.createBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }

    const browser = await this.browserPromise;
    if (!browser.connected) {
      this.logger.warn("Browser disconnected, reconnecting...");
      this.browserPromise = this.createBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
      const reconnected = await this.browserPromise;
      this.touch();
      return reconnected;
    }
    this.touch();
    return browser;
  }

  /**
   * 关闭当前浏览器实例
   */
  async closeBrowser(): Promise<void> {
    this.stopIdleSweeper();
    if (this.browserPromise) {
      try {
        const browser = await this.browserPromise;
        await browser.close();
      } catch {
        // Ignore close errors
      }
      this.browserPromise = null;
      this.logger.log("Browser pool cleaned up");
    }
  }

  /**
   * 空闲扫描：无活跃页面且超过 idleTimeout 时关闭浏览器释放内存。
   * 暴露为 public 便于测试直接驱动，无需依赖定时器。
   */
  async sweepIdle(): Promise<void> {
    if (this.sweeping || !this.browserPromise) {
      return;
    }
    const timeout = this.idleTimeoutMs;
    if (timeout <= 0) {
      return;
    }
    if (Date.now() - this.lastUsedAt < timeout) {
      return;
    }

    this.sweeping = true;
    try {
      const browser = await this.browserPromise;

      // 有活跃页面说明仍在被使用（about:blank 是 launch 自带的占位页）
      if (browser.connected) {
        const pages = await browser.pages();
        const active = pages.filter((p) => {
          const url = p.url();
          return url !== "" && url !== "about:blank";
        });
        if (active.length > 0) {
          this.touch();
          return;
        }
      }

      // 二次确认：await 期间可能有调用方刚拿走浏览器
      if (Date.now() - this.lastUsedAt < timeout) {
        return;
      }

      await this.closeBrowser();
      this.logger.log(
        `Browser idle for >= ${timeout}ms with no active pages, closed to release memory`,
      );
    } catch (error) {
      this.logger.warn(`Idle sweep failed: ${error}`);
    } finally {
      this.sweeping = false;
    }
  }

  private touch(): void {
    this.lastUsedAt = Date.now();
    this.startIdleSweeper();
  }

  private startIdleSweeper(): void {
    if (this.idleSweeper || this.idleTimeoutMs <= 0) {
      return;
    }
    this.idleSweeper = setInterval(() => {
      void this.sweepIdle();
    }, IDLE_SWEEP_INTERVAL_MS);
    // 不阻止进程退出
    this.idleSweeper.unref?.();
  }

  private stopIdleSweeper(): void {
    if (this.idleSweeper) {
      clearInterval(this.idleSweeper);
      this.idleSweeper = null;
    }
  }

  private async createBrowser(): Promise<Browser> {
    if (this.isRemote) {
      return this.connectRemote();
    }
    return this.launchLocal();
  }

  private async connectRemote(): Promise<Browser> {
    const url = this.browserlessUrl!;
    this.logger.log(
      `Connecting to remote browser: ${url.replace(/token=[^&]+/, "token=***")}`,
    );

    const browser = await puppeteer.connect({
      browserWSEndpoint: url,
    });

    this.logger.log("Remote browser connected successfully");
    return browser;
  }

  private async launchLocal(): Promise<Browser> {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

    this.logger.log(
      `Launching local Chromium${executablePath ? ` from: ${executablePath}` : " (bundled)"}`,
    );

    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: DEFAULT_LAUNCH_ARGS,
    });

    this.logger.log("Local Chromium launched successfully");
    return browser;
  }
}
