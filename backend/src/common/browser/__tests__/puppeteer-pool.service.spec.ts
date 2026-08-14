/**
 * PuppeteerPoolService unit tests
 *
 * 重点覆盖 2026-08-14 新增的空闲自动关闭机制（内存成本治理）：
 * - 空闲超时且无活跃页面 → 关闭浏览器释放内存
 * - 未到超时 → 不关闭
 * - 有活跃页面（非 about:blank）→ 不关闭，并刷新 lastUsedAt
 * - PUPPETEER_IDLE_TIMEOUT_MS=0 → 禁用该机制（回到旧行为）
 * - 关闭后再次 getBrowser() → 重新拉起
 */

import puppeteer from "puppeteer";
import { PuppeteerPoolService } from "../puppeteer-pool.service";

jest.mock("puppeteer", () => ({
  __esModule: true,
  default: {
    launch: jest.fn(),
    connect: jest.fn(),
  },
}));

const mockedLaunch = puppeteer.launch as jest.Mock;

type MockPage = { url: () => string };

/**
 * 只推进系统时钟、不触发定时器。
 * 用 advanceTimersByTime 会同步触发 60s 的空闲扫描定时器，其异步 sweepIdle()
 * 仍在飞行中（sweeping=true）就走到断言，导致显式调用被短路、close 尚未记录。
 * 这里直接驱动 sweepIdle()，定时器只负责"何时调"，不属于本用例的断言对象。
 */
function advanceClock(ms: number) {
  jest.setSystemTime(Date.now() + ms);
}

function makeBrowser(pages: MockPage[] = [{ url: () => "about:blank" }]) {
  return {
    connected: true,
    pages: jest.fn().mockResolvedValue(pages),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe("PuppeteerPoolService — 空闲自动关闭", () => {
  let service: PuppeteerPoolService;
  const originalEnv = process.env.PUPPETEER_IDLE_TIMEOUT_MS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    delete process.env.BROWSERLESS_URL;
    process.env.PUPPETEER_IDLE_TIMEOUT_MS = "300000"; // 5 min
    service = new PuppeteerPoolService();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalEnv === undefined) {
      delete process.env.PUPPETEER_IDLE_TIMEOUT_MS;
    } else {
      process.env.PUPPETEER_IDLE_TIMEOUT_MS = originalEnv;
    }
  });

  it("空闲超过超时且只剩 about:blank 时关闭浏览器", async () => {
    const browser = makeBrowser();
    mockedLaunch.mockResolvedValue(browser);

    await service.getBrowser();
    expect(browser.close).not.toHaveBeenCalled();

    advanceClock(300_001);
    await service.sweepIdle();

    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it("未到超时不关闭", async () => {
    const browser = makeBrowser();
    mockedLaunch.mockResolvedValue(browser);

    await service.getBrowser();
    advanceClock(120_000); // 2 min < 5 min
    await service.sweepIdle();

    expect(browser.close).not.toHaveBeenCalled();
  });

  it("存在活跃页面时不关闭，并刷新空闲计时", async () => {
    const browser = makeBrowser([
      { url: () => "about:blank" },
      { url: () => "https://example.com/article" },
    ]);
    mockedLaunch.mockResolvedValue(browser);

    await service.getBrowser();
    advanceClock(300_001);
    await service.sweepIdle();

    expect(browser.close).not.toHaveBeenCalled();

    // lastUsedAt 已被刷新：再次立即扫描仍不关闭
    await service.sweepIdle();
    expect(browser.close).not.toHaveBeenCalled();
  });

  it("PUPPETEER_IDLE_TIMEOUT_MS=0 时禁用自动关闭", async () => {
    process.env.PUPPETEER_IDLE_TIMEOUT_MS = "0";
    const browser = makeBrowser();
    mockedLaunch.mockResolvedValue(browser);

    await service.getBrowser();
    advanceClock(24 * 60 * 60 * 1000); // 24h
    await service.sweepIdle();

    expect(browser.close).not.toHaveBeenCalled();
  });

  it("空闲关闭后再次获取会重新拉起浏览器", async () => {
    const first = makeBrowser();
    const second = makeBrowser();
    mockedLaunch.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await service.getBrowser();
    advanceClock(300_001);
    await service.sweepIdle();
    expect(first.close).toHaveBeenCalledTimes(1);

    const revived = await service.getBrowser();
    expect(mockedLaunch).toHaveBeenCalledTimes(2);
    expect(revived).toBe(second);
  });

  it("没有浏览器实例时扫描是安全的空操作", async () => {
    await expect(service.sweepIdle()).resolves.toBeUndefined();
    expect(mockedLaunch).not.toHaveBeenCalled();
  });

  it("onModuleDestroy 仍然关闭浏览器", async () => {
    const browser = makeBrowser();
    mockedLaunch.mockResolvedValue(browser);

    await service.getBrowser();
    await service.onModuleDestroy();

    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
