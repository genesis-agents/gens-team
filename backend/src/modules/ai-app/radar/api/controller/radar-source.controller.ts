import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../../common/guards/jwt-auth.guard";
import {
  RateLimit,
  RateLimitGuard,
} from "../../../../../common/guards/rate-limit.guard";
import type { RequestWithUser } from "../../../../../common/types/express-request.types";
import {
  AcceptRecommendedSourcesDto,
  BulkCreateRadarSourcesDto,
  CreateRadarSourceDto,
  RecommendSourcesDto,
  UpdateRadarSourceDto,
} from "../dto";
import { RadarSourceService } from "../../mission/services/source/radar-source.service";
import { RadarTopicService } from "../../mission/services/topic/radar-topic.service";
import { RadarPipelineDispatcher } from "../../mission/pipeline/radar-pipeline-dispatcher.service";

/**
 * RadarSourceController（彻底重构后）
 *
 * Topic-scoped 数据源 CRUD + AI 推荐入口走 mission pipeline 框架：
 *   - recommend: 走 RadarPipelineDispatcher.runDiscoveryMission，从 stage 输出
 *     拿 candidates；不入库
 *   - accept: 走 RadarSourceService.bulkCreate（用户勾选后入库，isAiRecommended=true）
 *   - bulk: 手工批量导入，同一个 bulkCreate，isAiRecommended=false
 */
@Controller("radar")
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class RadarSourceController {
  constructor(
    private readonly sources: RadarSourceService,
    private readonly topics: RadarTopicService,
    private readonly dispatcher: RadarPipelineDispatcher,
  ) {}

  @Post("topics/:topicId/sources")
  async create(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() dto: CreateRadarSourceDto,
  ) {
    return this.sources.create(req.user.id, topicId, dto);
  }

  /**
   * 手工批量导入数据源（人工逐条核对过的高质量源）。
   *
   * 与 /recommend/accept 共用 RadarSourceService.bulkCreate，仅 isAiRecommended 不同。
   * 与单条 POST 的差别：逐条 preflight，不可达源进 skipped 而非整批 400。
   */
  @Post("topics/:topicId/sources/bulk")
  @RateLimit({ maxRequests: 20, windowSeconds: 60 })
  async bulkCreate(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() dto: BulkCreateRadarSourcesDto,
  ) {
    return this.sources.bulkCreate(req.user.id, topicId, dto.sources, {
      isAiRecommended: false,
    });
  }

  @Get("topics/:topicId/sources")
  async list(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
  ) {
    return this.sources.listByTopic(req.user.id, topicId);
  }

  @Patch("sources/:sourceId")
  async update(
    @Request() req: RequestWithUser,
    @Param("sourceId") sourceId: string,
    @Body() dto: UpdateRadarSourceDto,
  ) {
    return this.sources.update(req.user.id, sourceId, dto);
  }

  @Delete("sources/:sourceId")
  async delete(
    @Request() req: RequestWithUser,
    @Param("sourceId") sourceId: string,
  ) {
    await this.sources.delete(req.user.id, sourceId);
    return { deleted: true };
  }

  /**
   * AI 推荐数据源候选（走 RadarPipelineDispatcher.runDiscoveryMission：
   * 单 stage source-curator agent 输出候选列表）。
   *
   * 返回不入库；前端勾选后通过 /recommend/accept 批量入库。
   */
  @Post("topics/:topicId/sources/recommend")
  @RateLimit({
    maxRequests: 5,
    windowSeconds: 60,
    message: "AI 推荐过于频繁，请稍候再试",
  })
  async recommend(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() _dto: RecommendSourcesDto,
  ) {
    const topic = await this.topics.getOwnedById(req.user.id, topicId);
    const existing = await this.sources.listByTopic(req.user.id, topicId);
    const summary = await this.dispatcher.runDiscoveryMission(
      {
        topicId,
        topicName: topic.name,
        keywords: parseKeywords(topic.keywords),
        description: topic.description,
        entityType: topic.entityType,
        existingSources: existing.map((s) => ({
          type: s.type,
          identifier: s.identifier,
        })),
      },
      req.user.id,
    );
    // R7 2026-05-19：discovery stage 现在在 LLM 输出后立即 preflight，所以
    // candidates 已是过滤后的可达源。skipped 列表给前端展示"AI 推荐 X 个，
    // 已过滤 Y 个不可达"+ 原因，让用户理解为什么数量变少。
    const live = summary.discoveryCandidates ?? [];
    const skipped = summary.discoverySkipped ?? [];
    return {
      candidates: live,
      skipped,
      totalGenerated: live.length + skipped.length,
    };
  }

  /**
   * 接受 AI 推荐源 → 批量入库（isAiRecommended=true 标记）。
   *
   * 走 RadarSourceService.bulkCreate（DTO nested 校验已经在
   * AcceptRecommendedSourcesDto 完成，identifier shape 在 service 内再校验）。
   */
  @Post("topics/:topicId/sources/recommend/accept")
  @RateLimit({ maxRequests: 20, windowSeconds: 60 })
  async acceptRecommended(
    @Request() req: RequestWithUser,
    @Param("topicId") topicId: string,
    @Body() dto: AcceptRecommendedSourcesDto,
  ) {
    return this.sources.bulkCreate(req.user.id, topicId, dto.candidates, {
      isAiRecommended: true,
    });
  }
}

function parseKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
