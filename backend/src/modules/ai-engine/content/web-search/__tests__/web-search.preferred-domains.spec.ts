/**
 * ★ 2026-07-21 (citation 管道修复) —— preferred domains 排序/多样性语义
 *
 * 背景：industry-report-search 等白名单工具用 site: 定向查询，但结果被
 * 通用搜索管道两道过滤器稀释：
 *   1) calculateQualityScore 的静态 highAuthorityDomains 不含
 *      semianalysis / stratechery → 排序不加分，top-N 截断吃亏
 *   2) applyDiversityFilter 同域上限 2 条 → 定向域名单次最多 2 条
 * 修复语义：site: 点名（或显式传入）的 preferred 域名按高权威加分 + 豁免同域上限。
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { SearchService } from "../web-search.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/platform/credentials/storage/secrets/secrets.service";
import { ToolKeyResolverService } from "@/modules/platform/credentials/resolution/tool-key-resolver/tool-key-resolver.service";

jest.mock("duck-duck-scrape", () => ({
  search: jest.fn(),
  SafeSearchType: { MODERATE: 1 },
  SearchTimeType: { DAY: "d", WEEK: "w", MONTH: "m", YEAR: "y" },
}));

interface TestResult {
  title: string;
  url: string;
  content: string;
  domain: string;
  score?: number;
  publishedDate?: string;
}

/** 私有方法访问器（避免 any） */
interface SearchServicePrivate {
  extractSiteDomains(query: string): string[];
  rankSearchResults(
    results: TestResult[],
    query: string,
    maxResults: number,
    preferredDomains?: string[],
  ): TestResult[];
  applyDiversityFilter(
    results: TestResult[],
    maxResults: number,
    preferred?: ReadonlySet<string>,
  ): TestResult[];
  calculateQualityScore(
    result: TestResult,
    preferred?: ReadonlySet<string>,
  ): number;
}

function makeResult(domain: string, i: number): TestResult {
  return {
    title: `AI infrastructure report ${i}`,
    url: `https://${domain}/post-${i}`,
    content: `AI infrastructure analysis piece number ${i} with enough content to score depth points and pass ranking heuristics comfortably in tests.`,
    domain,
  };
}

describe("SearchService preferred domains (site: 定向源不再被通用降噪稀释)", () => {
  let service: SearchService;
  let svc: SearchServicePrivate;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: HttpService, useValue: { post: jest.fn(), get: jest.fn() } },
        {
          provide: PrismaService,
          useValue: { systemSetting: { findFirst: jest.fn() } },
        },
        {
          provide: SecretsService,
          useValue: {
            getValueInternal: jest.fn(),
            getValueInternalAllKeys: jest.fn().mockResolvedValue([]),
            markSecretFailure: jest.fn(),
            markSecretSuccess: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: ToolKeyResolverService,
          useValue: { resolveToolKey: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get(SearchService);
    svc = service as unknown as SearchServicePrivate;
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
  });

  describe("extractSiteDomains", () => {
    it("解析多 site: OR 串且不吸入右括号（原 [^\\s]+ 会把 'b.com)' 当域名）", () => {
      const domains = svc.extractSiteDomains(
        "(site:semianalysis.com OR site:stratechery.com) GPU shortage",
      );
      expect(domains).toEqual(["semianalysis.com", "stratechery.com"]);
    });

    it("无 site: 时返回空数组", () => {
      expect(svc.extractSiteDomains("GPU shortage")).toEqual([]);
    });
  });

  describe("applyDiversityFilter", () => {
    it("非 preferred 域名仍受 2 条/域上限", () => {
      const results = Array.from({ length: 5 }, (_, i) =>
        makeResult("random.example.com", i),
      );
      const filtered = svc.applyDiversityFilter(results, 10);
      // 上限 2 条后不足 maxResults，backfill 会补回 —— 但补回前的首轮只留 2 条；
      // 用 maxResults=2 观察硬截断语义
      const hardCapped = svc.applyDiversityFilter(results, 2);
      expect(hardCapped).toHaveLength(2);
      expect(filtered.length).toBeGreaterThanOrEqual(2);
    });

    it("preferred 域名豁免同域上限（site: 定向结果不再被砍到 2 条）", () => {
      const preferred = new Set(["semianalysis.com"]);
      const results = [
        ...Array.from({ length: 6 }, (_, i) =>
          makeResult("semianalysis.com", i),
        ),
        ...Array.from({ length: 6 }, (_, i) => makeResult("other.com", i)),
      ];
      const filtered = svc.applyDiversityFilter(results, 8, preferred);
      const fromPreferred = filtered.filter(
        (r) => r.domain === "semianalysis.com",
      );
      const fromOther = filtered.filter((r) => r.domain === "other.com");
      expect(fromPreferred).toHaveLength(6); // 全保留
      expect(fromOther).toHaveLength(2); // 非 preferred 仍限 2
    });

    it("preferred 匹配子域名", () => {
      const preferred = new Set(["semianalysis.com"]);
      const results = Array.from({ length: 4 }, (_, i) =>
        makeResult("newsletter.semianalysis.com", i),
      );
      const filtered = svc.applyDiversityFilter(results, 10, preferred);
      expect(filtered).toHaveLength(4);
    });
  });

  describe("calculateQualityScore", () => {
    it("preferred 域名获得高权威加分（+40）", () => {
      const result = makeResult("semianalysis.com", 1);
      const without = svc.calculateQualityScore(result);
      const withPreferred = svc.calculateQualityScore(
        result,
        new Set(["semianalysis.com"]),
      );
      expect(withPreferred - without).toBe(40);
    });
  });

  describe("rankSearchResults 端到端语义", () => {
    it("Serper/DDG 路径：query 含 site: 时自动识别 preferred 并豁免多样性", () => {
      const results = Array.from({ length: 6 }, (_, i) =>
        makeResult("semianalysis.com", i),
      );
      const ranked = svc.rankSearchResults(
        results,
        "(site:semianalysis.com) AI infrastructure",
        6,
      );
      expect(ranked).toHaveLength(6);
      expect(ranked.every((r) => r.domain === "semianalysis.com")).toBe(true);
    });

    it("Tavily 路径：query 已剥 site:，preferredDomains 显式传入同样生效", () => {
      const results = Array.from({ length: 5 }, (_, i) =>
        makeResult("stratechery.com", i),
      );
      const ranked = svc.rankSearchResults(results, "AI infrastructure", 5, [
        "stratechery.com",
      ]);
      expect(ranked).toHaveLength(5);
    });
  });
});
