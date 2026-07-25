/**
 * Agent Activity Service
 *
 * 增强的 Agent 活动持久化服务 (Phase 1.2)
 *
 * 核心职责：
 * 1. 记录完整的 Agent 思考链
 * 2. 追踪各阶段的详细信息（搜索结果、写作进度等）
 * 3. 支持时间追踪（阶段开始/结束时间、持续时间）
 * 4. 提供按维度分组的活动查询
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AgentActivityType } from "@prisma/client";
import type { Prisma, ResearchAgentActivity } from "@prisma/client";
import { EventArchiveReaderService } from "@/modules/platform/facade";
import { getModelDisplayNameMap } from "../../utils/model-display-name";
import type {
  SearchResultsRecord,
  WritingProgressRecord,
  DimensionActivities,
  AgentActivityWithTiming,
} from "../../types/monitoring.types";

/**
 * 思考阶段类型
 */
export type ThinkingPhase =
  | "understanding" // 理解需求
  | "searching" // 搜索资料
  | "writing" // 撰写内容
  | "reviewing" // 审核内容
  | "integrating"; // 整合结果

/**
 * 创建 Agent 活动的输入参数
 */
export interface CreateAgentActivityInput {
  topicId: string;
  missionId: string;
  dimensionId?: string;
  dimensionName?: string;
  agentId: string;
  agentName: string;
  agentRole: "leader" | "researcher" | "reviewer" | "synthesizer";
  activityType: AgentActivityType;
  phase?: string;
  content: string;
  progress?: number;
  modelId?: string; // ★ 模型 ID，用于在 agentName 后显示 [model]

  // 思考链增强字段
  thinkingPhase?: ThinkingPhase;
  thinkingContent?: string;
  searchResults?: SearchResultsRecord;
  writingProgress?: WritingProgressRecord;
  actionTaken?: string;
  actionResult?: Record<string, unknown>;
}

@Injectable()
export class AgentActivityService {
  private readonly logger = new Logger(AgentActivityService.name);

  // 用于追踪正在进行的阶段（topicId:agentId:thinkingPhase -> activityId）
  private readonly activePhases = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    // @Optional：StorageModule 未 import 时归档回读退化为空（只返回 Postgres 命中）。
    @Optional() private readonly archiveReader?: EventArchiveReaderService,
  ) {}

  private static readonly DAY_MS = 24 * 3600 * 1000;

  /**
   * ★ 2026-07-25：按 (where + topic/mission) 查活动，Postgres 空时回读 R2 归档
   * （EventArchiveService 已把 >保留期 的 research_agent_activities 归档删除）。
   * jsPredicate 需与 where 的非 topicId/missionId 条件等价（用于过滤归档行）。
   */
  private async findActivitiesWithArchiveFallback(
    where: Prisma.ResearchAgentActivityWhereInput,
    anchor: { topicId: string; missionId?: string },
    jsPredicate: (row: Record<string, unknown>) => boolean,
  ): Promise<ResearchAgentActivity[]> {
    const rows = await this.prisma.researchAgentActivity.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    if (rows.length > 0 || !this.archiveReader) return rows;

    const window = await this.archiveDayWindow(
      anchor.topicId,
      anchor.missionId,
    );
    if (!window) return rows;

    const archived = await this.archiveReader.readArchivedRows({
      table: "research_agent_activities",
      dayFrom: window.from,
      dayTo: window.to,
      rowFilter: (r) =>
        r.topicId === anchor.topicId &&
        (anchor.missionId == null || r.missionId === anchor.missionId) &&
        jsPredicate(r),
      limit: 5000,
    });
    return archived
      .map((r) => this.reviveActivity(r))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /** 归档回读的日期窗口：优先按 mission 起止，否则按该 topic 下所有 mission 聚合。 */
  private async archiveDayWindow(
    topicId: string,
    missionId?: string,
  ): Promise<{ from: Date; to: Date } | null> {
    const D = AgentActivityService.DAY_MS;
    if (missionId) {
      const m = await this.prisma.researchMission.findUnique({
        where: { id: missionId },
        select: { startedAt: true, completedAt: true, createdAt: true },
      });
      if (!m) return null;
      const start = m.startedAt ?? m.createdAt;
      const end = m.completedAt ?? start;
      return {
        from: new Date(start.getTime() - D),
        to: new Date(end.getTime() + D),
      };
    }
    const agg = await this.prisma.researchMission.aggregate({
      where: { topicId },
      _min: { createdAt: true },
      _max: { completedAt: true, createdAt: true },
    });
    const start = agg._min.createdAt;
    if (!start) return null;
    const end = agg._max.completedAt ?? agg._max.createdAt ?? start;
    return {
      from: new Date(start.getTime() - D),
      to: new Date(end.getTime() + D),
    };
  }

  /** 归档 JSON 行 → ResearchAgentActivity（复活 Date 列）。 */
  private reviveActivity(r: Record<string, unknown>): ResearchAgentActivity {
    const toDate = (v: unknown): Date | null =>
      v == null ? null : new Date(v as string);
    return {
      ...r,
      createdAt: toDate(r.createdAt) ?? new Date(0),
      phaseStartedAt: toDate(r.phaseStartedAt),
      phaseEndedAt: toDate(r.phaseEndedAt),
    } as unknown as ResearchAgentActivity;
  }

  /**
   * 根据 modelId 解析带模型标签的 agentName
   */
  private async resolveAgentDisplayName(
    agentName: string,
    modelId?: string,
  ): Promise<string> {
    if (!modelId) return agentName;
    try {
      const nameMap = await getModelDisplayNameMap(this.prisma, [modelId]);
      const modelLabel = nameMap.get(modelId) || modelId;
      if (modelLabel && !agentName.includes(`[${modelLabel}]`)) {
        return `${agentName} [${modelLabel}]`;
      }
    } catch (err) {
      this.logger.warn(
        `[enrichAgentName] Model label lookup failed (non-fatal): ${(err as Error).message}`,
      );
    }
    return agentName;
  }

  /**
   * 记录 Agent 活动
   */
  async recordActivity(input: CreateAgentActivityInput): Promise<string> {
    try {
      const agentDisplayName = await this.resolveAgentDisplayName(
        input.agentName,
        input.modelId,
      );
      const activity = await this.prisma.researchAgentActivity.create({
        data: {
          topicId: input.topicId,
          missionId: input.missionId,
          dimensionId: input.dimensionId,
          dimensionName: input.dimensionName,
          agentId: input.agentId,
          agentName: agentDisplayName,
          agentRole: input.agentRole,
          activityType: input.activityType,
          phase: input.phase,
          content: input.content,
          progress: input.progress || 0,
          thinkingPhase: input.thinkingPhase,
          thinkingContent: input.thinkingContent,
          searchResults: input.searchResults
            ? JSON.parse(JSON.stringify(input.searchResults))
            : undefined,
          writingProgress: input.writingProgress
            ? JSON.parse(JSON.stringify(input.writingProgress))
            : undefined,
          actionTaken: input.actionTaken,
          actionResult: input.actionResult
            ? JSON.parse(JSON.stringify(input.actionResult))
            : undefined,
        },
      });

      return activity.id;
    } catch (error) {
      this.logger.error(`Failed to record agent activity: ${error}`);
      throw error;
    }
  }

  /**
   * 开始一个思考阶段（记录开始时间）
   */
  async startThinkingPhase(
    input: CreateAgentActivityInput & { thinkingPhase: ThinkingPhase },
  ): Promise<string> {
    const phaseKey = `${input.topicId}:${input.agentId}:${input.thinkingPhase}`;

    try {
      const agentDisplayName = await this.resolveAgentDisplayName(
        input.agentName,
        input.modelId,
      );
      const activity = await this.prisma.researchAgentActivity.create({
        data: {
          topicId: input.topicId,
          missionId: input.missionId,
          dimensionId: input.dimensionId,
          dimensionName: input.dimensionName,
          agentId: input.agentId,
          agentName: agentDisplayName,
          agentRole: input.agentRole,
          activityType: input.activityType,
          phase: input.phase,
          content: input.content,
          progress: input.progress || 0,
          thinkingPhase: input.thinkingPhase,
          thinkingContent: input.thinkingContent,
          phaseStartedAt: new Date(),
        },
      });

      // 记录活动ID以便后续更新
      this.activePhases.set(phaseKey, activity.id);

      return activity.id;
    } catch (error) {
      this.logger.error(`Failed to start thinking phase: ${error}`);
      throw error;
    }
  }

  /**
   * 结束一个思考阶段（记录结束时间和结果）
   */
  async endThinkingPhase(
    topicId: string,
    agentId: string,
    thinkingPhase: ThinkingPhase,
    result?: {
      searchResults?: SearchResultsRecord;
      writingProgress?: WritingProgressRecord;
      actionResult?: Record<string, unknown>;
      finalContent?: string;
    },
  ): Promise<void> {
    const phaseKey = `${topicId}:${agentId}:${thinkingPhase}`;
    const activityId = this.activePhases.get(phaseKey);

    if (!activityId) {
      this.logger.warn(`No active phase found for key: ${phaseKey}`);
      return;
    }

    try {
      const activity = await this.prisma.researchAgentActivity.findUnique({
        where: { id: activityId },
        select: { phaseStartedAt: true },
      });

      const now = new Date();
      const durationMs = activity?.phaseStartedAt
        ? now.getTime() - activity.phaseStartedAt.getTime()
        : undefined;

      await this.prisma.researchAgentActivity.update({
        where: { id: activityId },
        data: {
          phaseEndedAt: now,
          durationMs,
          searchResults: result?.searchResults
            ? JSON.parse(JSON.stringify(result.searchResults))
            : undefined,
          writingProgress: result?.writingProgress
            ? JSON.parse(JSON.stringify(result.writingProgress))
            : undefined,
          actionResult: result?.actionResult
            ? JSON.parse(JSON.stringify(result.actionResult))
            : undefined,
          thinkingContent: result?.finalContent,
          progress: 100,
        },
      });

      this.activePhases.delete(phaseKey);
    } catch (error) {
      this.logger.error(`Failed to end thinking phase: ${error}`);
    }
  }

  /**
   * 更新思考阶段的进度
   */
  async updateThinkingProgress(
    topicId: string,
    agentId: string,
    thinkingPhase: ThinkingPhase,
    progress: number,
    update?: {
      searchResults?: SearchResultsRecord;
      writingProgress?: WritingProgressRecord;
      thinkingContent?: string;
    },
  ): Promise<void> {
    const phaseKey = `${topicId}:${agentId}:${thinkingPhase}`;
    const activityId = this.activePhases.get(phaseKey);

    if (!activityId) {
      this.logger.warn(`No active phase found for update: ${phaseKey}`);
      return;
    }

    try {
      const updateData: Record<string, unknown> = { progress };

      if (update?.searchResults) {
        updateData.searchResults = JSON.parse(
          JSON.stringify(update.searchResults),
        );
      }
      if (update?.writingProgress) {
        updateData.writingProgress = JSON.parse(
          JSON.stringify(update.writingProgress),
        );
      }
      if (update?.thinkingContent) {
        updateData.thinkingContent = update.thinkingContent;
      }

      await this.prisma.researchAgentActivity.update({
        where: { id: activityId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Failed to update thinking progress: ${error}`);
    }
  }

  /**
   * 获取专题的所有活动（按维度分组）
   */
  async getActivitiesByDimension(
    topicId: string,
    missionId?: string,
  ): Promise<DimensionActivities[]> {
    const activities = await this.findActivitiesWithArchiveFallback(
      { topicId, ...(missionId ? { missionId } : {}) },
      { topicId, missionId },
      () => true,
    );

    // 按维度分组
    const dimensionMap = new Map<string, AgentActivityWithTiming[]>();

    for (const activity of activities) {
      const key = activity.dimensionId || "general";
      if (!dimensionMap.has(key)) {
        dimensionMap.set(key, []);
      }

      dimensionMap.get(key)!.push({
        id: activity.id,
        agentId: activity.agentId,
        agentName: activity.agentName,
        agentRole: activity.agentRole,
        activityType: activity.activityType,
        phase: activity.phase || undefined,
        content: activity.content,
        progress: activity.progress,
        thinkingPhase: activity.thinkingPhase || undefined,
        thinkingContent: activity.thinkingContent || undefined,
        searchResults: activity.searchResults as unknown as
          | SearchResultsRecord
          | undefined,
        writingProgress: activity.writingProgress as unknown as
          | WritingProgressRecord
          | undefined,
        actionTaken: activity.actionTaken || undefined,
        actionResult: activity.actionResult as unknown as
          | Record<string, unknown>
          | undefined,
        phaseStartedAt: activity.phaseStartedAt || undefined,
        phaseEndedAt: activity.phaseEndedAt || undefined,
        durationMs: activity.durationMs || undefined,
        createdAt: activity.createdAt,
      });
    }

    // 转换为数组格式
    const result: DimensionActivities[] = [];
    for (const [dimensionId, dimensionActivities] of dimensionMap) {
      // 获取维度名称
      const dimensionName =
        activities.find((a) => a.dimensionId === dimensionId)?.dimensionName ||
        (dimensionId === "general" ? "通用活动" : "未知维度");

      // 计算总耗时
      const totalDuration = dimensionActivities.reduce(
        (sum, a) => sum + (a.durationMs || 0),
        0,
      );

      result.push({
        dimensionId,
        dimensionName,
        activities: dimensionActivities,
        totalDuration,
      });
    }

    return result;
  }

  /**
   * 获取特定维度的活动时间线
   */
  async getDimensionTimeline(
    topicId: string,
    dimensionId: string,
  ): Promise<AgentActivityWithTiming[]> {
    const activities = await this.prisma.researchAgentActivity.findMany({
      where: {
        topicId,
        dimensionId,
      },
      orderBy: { createdAt: "asc" },
    });

    return activities.map((activity) => ({
      id: activity.id,
      agentId: activity.agentId,
      agentName: activity.agentName,
      agentRole: activity.agentRole,
      activityType: activity.activityType,
      phase: activity.phase || undefined,
      content: activity.content,
      progress: activity.progress,
      thinkingPhase: activity.thinkingPhase || undefined,
      thinkingContent: activity.thinkingContent || undefined,
      searchResults: activity.searchResults as unknown as
        | SearchResultsRecord
        | undefined,
      writingProgress: activity.writingProgress as unknown as
        | WritingProgressRecord
        | undefined,
      actionTaken: activity.actionTaken || undefined,
      actionResult: activity.actionResult as unknown as
        | Record<string, unknown>
        | undefined,
      phaseStartedAt: activity.phaseStartedAt || undefined,
      phaseEndedAt: activity.phaseEndedAt || undefined,
      durationMs: activity.durationMs || undefined,
      createdAt: activity.createdAt,
    }));
  }

  /**
   * 获取 Leader 的思考过程记录
   */
  async getLeaderThinkingHistory(
    topicId: string,
    missionId?: string,
  ): Promise<AgentActivityWithTiming[]> {
    const activities = await this.findActivitiesWithArchiveFallback(
      { topicId, agentRole: "leader", ...(missionId ? { missionId } : {}) },
      { topicId, missionId },
      (r) => r.agentRole === "leader",
    );

    return activities.map((activity) => ({
      id: activity.id,
      agentId: activity.agentId,
      agentName: activity.agentName,
      agentRole: activity.agentRole,
      activityType: activity.activityType,
      phase: activity.phase || undefined,
      content: activity.content,
      progress: activity.progress,
      thinkingPhase: activity.thinkingPhase || undefined,
      thinkingContent: activity.thinkingContent || undefined,
      searchResults: activity.searchResults as unknown as
        | SearchResultsRecord
        | undefined,
      writingProgress: activity.writingProgress as unknown as
        | WritingProgressRecord
        | undefined,
      actionTaken: activity.actionTaken || undefined,
      actionResult: activity.actionResult as unknown as
        | Record<string, unknown>
        | undefined,
      phaseStartedAt: activity.phaseStartedAt || undefined,
      phaseEndedAt: activity.phaseEndedAt || undefined,
      durationMs: activity.durationMs || undefined,
      createdAt: activity.createdAt,
    }));
  }

  /**
   * 获取活动统计信息
   */
  async getActivityStats(
    topicId: string,
    missionId?: string,
  ): Promise<{
    totalActivities: number;
    byAgentRole: Record<string, number>;
    byThinkingPhase: Record<string, number>;
    totalDuration: number;
    averageDuration: number;
  }> {
    const activities = await this.prisma.researchAgentActivity.findMany({
      where: {
        topicId,
        ...(missionId ? { missionId } : {}),
      },
      select: {
        agentRole: true,
        thinkingPhase: true,
        durationMs: true,
      },
    });

    const byAgentRole: Record<string, number> = {};
    const byThinkingPhase: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    for (const activity of activities) {
      // 按 Agent 角色统计
      byAgentRole[activity.agentRole] =
        (byAgentRole[activity.agentRole] || 0) + 1;

      // 按思考阶段统计
      if (activity.thinkingPhase) {
        byThinkingPhase[activity.thinkingPhase] =
          (byThinkingPhase[activity.thinkingPhase] || 0) + 1;
      }

      // 统计时间
      if (activity.durationMs) {
        totalDuration += activity.durationMs;
        durationCount++;
      }
    }

    return {
      totalActivities: activities.length,
      byAgentRole,
      byThinkingPhase,
      totalDuration,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    };
  }

  /**
   * ★ 记录 Leader 审核结果到 Activity
   *
   * @param topicId 研究专题 ID
   * @param missionId 任务 ID
   * @param dimensionId 维度 ID
   * @param dimensionName 维度名称
   * @param content 审核内容描述
   * @param approved 是否通过
   */
  async recordReviewActivity(
    topicId: string,
    missionId: string,
    dimensionId: string,
    dimensionName: string,
    content: string,
    approved: boolean,
  ): Promise<void> {
    try {
      await this.prisma.researchAgentActivity.create({
        data: {
          topicId,
          missionId,
          dimensionId,
          dimensionName,
          agentId: "leader",
          agentName: "研究组长",
          agentRole: "leader",
          activityType: AgentActivityType.REVIEWING,
          phase: "reviewing",
          content,
          progress: approved ? 100 : 50,
          thinkingPhase: "reviewing",
          thinkingContent: approved ? "审核通过" : "需要修订",
        },
      });
    } catch (error) {
      // 忽略外键约束错误（topic 可能已被删除）
      const errorStr = String(error);
      if (!errorStr.includes("Foreign key constraint")) {
        this.logger.error(`Failed to record review activity: ${error}`);
      }
    }
  }

  /**
   * 记录单维度审核结果
   * 将审核详情存储到 actionResult 字段中，供前端展示
   */
  async recordDimensionReview(
    topicId: string,
    missionId: string,
    dimensionId: string,
    dimensionName: string,
    reviewResult: {
      qualityLevel: string;
      overallScore: number;
      scores: {
        breadth: number;
        depth: number;
        evidence: number;
        coherence: number;
        currency: number;
      };
      issues: Array<{
        type: string;
        severity: string;
        description: string;
        affectedSection?: string;
      }>;
      suggestions: string[];
      needsReresearch: boolean;
      reresearchFocus?: string[];
    },
  ): Promise<string> {
    try {
      const activity = await this.prisma.researchAgentActivity.create({
        data: {
          topicId,
          missionId,
          dimensionId,
          dimensionName,
          agentId: "quality_reviewer",
          agentName: "质量审核员",
          agentRole: "reviewer",
          activityType: AgentActivityType.REVIEWING,
          phase: "dimension_review_completed",
          content: `维度「${dimensionName}」审核完成：${reviewResult.qualityLevel} (${reviewResult.overallScore}/100)`,
          progress: 100,
          thinkingPhase: "reviewing",
          thinkingContent: `审核结果：${reviewResult.qualityLevel}`,
          actionTaken: "dimension_review",
          actionResult: {
            qualityLevel: reviewResult.qualityLevel,
            overallScore: reviewResult.overallScore,
            scores: reviewResult.scores,
            issues: reviewResult.issues,
            suggestions: reviewResult.suggestions,
            needsReresearch: reviewResult.needsReresearch,
            reresearchFocus: reviewResult.reresearchFocus,
          },
        },
      });
      this.logger.log(
        `Recorded dimension review for ${dimensionName}: ${reviewResult.qualityLevel} (${reviewResult.overallScore}/100)`,
      );
      return activity.id;
    } catch (error) {
      const errorStr = String(error);
      if (!errorStr.includes("Foreign key constraint")) {
        this.logger.error(`Failed to record dimension review: ${error}`);
      }
      return "";
    }
  }

  /**
   * 记录整体审核结果
   * 将全局审核详情存储到 actionResult 字段中
   */
  async recordOverallReview(
    topicId: string,
    missionId: string,
    overallReview: {
      qualityLevel: string;
      overallScore: number;
      dimensionReviews: Array<{
        dimensionId: string;
        dimensionName: string;
        qualityLevel: string;
        overallScore: number;
      }>;
      crossDimensionIssues: Array<{
        type: string;
        severity: string;
        description: string;
      }>;
      coverageAnalysis: {
        coveredAspects: string[];
        missingAspects: string[];
        coverageScore: number;
      };
      recommendations: string[];
      needsReresearch: boolean;
      dimensionsToReresearch: string[];
    },
  ): Promise<string> {
    try {
      const activity = await this.prisma.researchAgentActivity.create({
        data: {
          topicId,
          missionId,
          agentId: "quality_reviewer",
          agentName: "质量审核员",
          agentRole: "reviewer",
          activityType: AgentActivityType.REVIEWING,
          phase: "overall_review_completed",
          content: `整体审核完成：${overallReview.qualityLevel} (${overallReview.overallScore.toFixed(1)}/100)，${overallReview.dimensionsToReresearch.length} 个维度需要重研`,
          progress: 100,
          thinkingPhase: "reviewing",
          thinkingContent: `整体质量：${overallReview.qualityLevel}`,
          actionTaken: "overall_review",
          actionResult: {
            qualityLevel: overallReview.qualityLevel,
            overallScore: overallReview.overallScore,
            dimensionReviews: overallReview.dimensionReviews.map((d) => ({
              dimensionId: d.dimensionId,
              dimensionName: d.dimensionName,
              qualityLevel: d.qualityLevel,
              overallScore: d.overallScore,
            })),
            crossDimensionIssues: overallReview.crossDimensionIssues,
            coverageAnalysis: overallReview.coverageAnalysis,
            recommendations: overallReview.recommendations,
            needsReresearch: overallReview.needsReresearch,
            dimensionsToReresearch: overallReview.dimensionsToReresearch,
          },
        },
      });
      this.logger.log(
        `Recorded overall review: ${overallReview.qualityLevel} (${overallReview.overallScore.toFixed(1)}/100)`,
      );
      return activity.id;
    } catch (error) {
      const errorStr = String(error);
      if (!errorStr.includes("Foreign key constraint")) {
        this.logger.error(`Failed to record overall review: ${error}`);
      }
      return "";
    }
  }
}
