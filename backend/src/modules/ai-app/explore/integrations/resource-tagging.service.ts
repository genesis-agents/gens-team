/**
 * ResourceTaggingService —— 给资源补标签（classify-only，写 UI 展示字段）
 *
 * ★ 2026-07-21：导入桥 / 回填经 importWithMetadata 建的 Resource 只有
 * type/title/abstract，没有分类标签。而信源库卡片渲染的是 **resource.categories**
 * （爬虫入库时直接写，如 arxiv 论文分类 / hackernews 域名），enrichment 写的
 * primaryCategory + autoTags 卡片根本不读。本服务用 classify（单次 LLM，走
 * Python ai-service /ai/classify）补齐三处：
 *   - categories   → 卡片标签 chip 的展示字段（关键）
 *   - autoTags     → feed 标签 facet 过滤字段
 *   - primaryCategory / difficultyLevel → 推荐 / 排序辅助
 *
 * 幂等：categories 非空则跳过（除非 force），保证批量回填可重跑、成本可控。
 * 非致命：classify 失败只 log，不影响导入主流程。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEnrichmentService } from "../resources/ai-enrichment.service";

/** categories 展示数组最多取几项（对齐爬虫风格，卡片 slice(0,2) 展示） */
const MAX_CATEGORIES = 4;

@Injectable()
export class ResourceTaggingService {
  private readonly logger = new Logger(ResourceTaggingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEnrichment: AIEnrichmentService,
  ) {}

  /**
   * 给单个资源打标（classify-only）。
   * @returns true=已写入标签，false=跳过或失败（均非致命）
   */
  async tagResource(
    resourceId: string,
    opts: { force?: boolean } = {},
  ): Promise<boolean> {
    try {
      const resource = await this.prisma.resource.findUnique({
        where: { id: resourceId },
        select: {
          id: true,
          title: true,
          abstract: true,
          categories: true,
        },
      });
      if (!resource) return false;

      // 幂等：已有展示标签则跳过（除非 force）
      const existing = Array.isArray(resource.categories)
        ? (resource.categories as unknown[])
        : [];
      if (existing.length > 0 && !opts.force) return false;

      const content = [resource.title, resource.abstract]
        .filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        )
        .join("\n\n");
      if (!content.trim()) return false;

      const classification = await this.aiEnrichment.classifyContent(content);
      if (!classification) return false;

      // categories = 主类 + 子类去重（卡片展示字段）；autoTags = tags（facet 过滤）
      const categories = [
        ...new Set(
          [classification.category, ...(classification.subcategories ?? [])]
            .filter(
              (c): c is string => typeof c === "string" && c.trim().length > 0,
            )
            .map((c) => c.trim()),
        ),
      ].slice(0, MAX_CATEGORIES);
      const autoTags = (classification.tags ?? []).filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      );

      if (categories.length === 0 && autoTags.length === 0) return false;

      await this.prisma.resource.update({
        where: { id: resourceId },
        data: {
          categories: categories as unknown as Prisma.InputJsonValue,
          autoTags: autoTags as unknown as Prisma.InputJsonValue,
          primaryCategory: classification.category || null,
        },
      });
      this.logger.log(
        `[tag] ${resourceId} → categories=[${categories.join(", ")}] tags=${autoTags.length}`,
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `[tag] ${resourceId} failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
