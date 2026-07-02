/**
 * AI Teams Module
 * AI 团队协作模块
 *
 * 职责：
 * - Topic（话题）CRUD 和成员管理
 * - 消息发送和处理
 * - AI 辩论和任务编排
 * - WebSocket 实时通信
 * - 自定义团队管理（通过 AI Engine）
 *
 * 依赖 AI Engine 提供：
 * - TeamsService: 团队配置管理
 * - VotingManager: 共识投票
 * - HandoffCoordinator: 任务交接
 * - LLMFactory: LLM 调用
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import {
  AiTeamsController,
  UsersController,
  BookmarksController,
  CustomTeamsController,
  PublicReportsController,
  TeamsController,
  AITeamsAdminController,
  AITeamsTemplatesController,
} from "./controllers";
import { AiTeamsService } from "./ai-teams.service";
import { AITeamsAdminService } from "./ai-teams-admin.service";
import { TeamsRepository } from "./teams.repository";
import { AiTeamsGateway } from "./ai-teams.gateway";
import { PrismaModule } from "../../../common/prisma/prisma.module";
// 直接从文件导入，避免 barrel export 循环依赖
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../platform/credits/credits.module";
import { NotificationDispatcherModule } from "../../platform/notifications/dispatcher/notification-dispatcher.module";
import { LongContentModule } from "../writing/content-engine/long-content.module";
import {
  // AI 服务
  ContextRouterService,
  AiResponseService,
  TopicContextRetrievalService,
  TeamsLongContentService,
  LeaderModelService,
  // 协作服务
  DebateService,
  TeamMissionService,
  MissionExecutionService,
  MissionReviewService,
  // L3 W1 策略数据化：审核模式表 dual-read
  TeamsReviewPolicyService,
  // TaskBreakdownService 已删 (2026-04-30)
  TeamCollaborationService,
  MissionPromptService,
  MissionQueryService,
  MissionLifecycleService,
  MissionRetryService,
  MissionHealthCheckService,
  MissionAICallerService,
  TeamMessageService,
  TeamMemberService,
  // 长内容处理增强服务
  ConstraintEnforcementService,
  TokenBudgetCalculatorService,
  // Topic 领域服务
  TopicMembershipService,
  TopicPublicService,
  TopicForwardBookmarkService,
  // 事件服务
  TopicEventEmitterService,
  // 整合服务
  AiTeamsIntegrationService,
} from "./services";
// 注意：UrlParserService 和 WebContentExtractionService 由 @Global() ContentProcessingModule 提供
import { TeamMemberAgent, TeamCollaborationAgent } from "./agents";
import {
  TeamRegistry,
  AgentRegistry,
  MissionLivenessGuard,
} from "@/modules/ai-harness/facade";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MissionStatus, AgentTaskStatus } from "@prisma/client";
import { DEBATE_TEAM_CONFIG } from "./teams";

@Module({
  imports: [
    PrismaModule,
    AiEngineModule,
    CreditsModule,
    NotificationDispatcherModule,
    LongContentModule,
    // BLK-7：gateway 握手 JWT 校验（不再信任客户端传的 userId）
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AiTeamsController,
    UsersController,
    BookmarksController,
    CustomTeamsController,
    PublicReportsController,
    // T3 sink: mission HTTP (route ai/teams) + admin team templates (route admin/ai-teams)
    TeamsController,
    AITeamsAdminController,
    AITeamsTemplatesController,
  ],
  providers: [
    // Repository
    TeamsRepository,

    // 核心业务服务
    AiTeamsService,
    AiTeamsGateway,
    AITeamsAdminService, // backs AITeamsAdminController (T3 sink)

    // AI 服务
    ContextRouterService,
    AiResponseService,
    TopicContextRetrievalService,
    TeamsLongContentService,
    LeaderModelService,
    TeamMemberAgent,
    TeamCollaborationAgent,

    // 协作服务
    DebateService,
    TeamMissionService,
    MissionExecutionService,
    MissionReviewService,
    // L3 W1 策略数据化：审核模式表 dual-read
    TeamsReviewPolicyService,
    // TaskBreakdownService 已删 (2026-04-30)
    TeamCollaborationService,
    MissionPromptService,
    MissionQueryService,
    MissionLifecycleService,
    MissionRetryService,
    MissionHealthCheckService,
    MissionAICallerService,
    TeamMessageService,
    TeamMemberService,

    // 长内容处理增强服务
    ConstraintEnforcementService,
    TokenBudgetCalculatorService,

    // Topic 领域服务
    TopicMembershipService,
    TopicPublicService,
    TopicForwardBookmarkService,
    TopicEventEmitterService,

    // AI Engine 整合服务
    AiTeamsIntegrationService,
    // 注意：UrlParserService 和 WebContentExtractionService 由 @Global() ContentProcessingModule 提供
  ],
  exports: [
    // Repository
    TeamsRepository,

    // 核心业务服务
    AiTeamsService,

    // AI 服务
    ContextRouterService,
    AiResponseService,
    TopicContextRetrievalService,
    TeamsLongContentService,

    // 协作服务
    DebateService,
    TeamMissionService,
    TeamCollaborationService,

    // 长内容处理增强服务
    ConstraintEnforcementService,
    TokenBudgetCalculatorService,

    // Topic 领域服务
    TopicMembershipService,
    TopicPublicService,
    TopicForwardBookmarkService,

    // AI Engine 整合服务
    AiTeamsIntegrationService,
    // 注意：UrlParserService 和 WebContentExtractionService 由 @Global() ContentProcessingModule 提供
  ],
})
export class AiTeamsModule implements OnModuleInit {
  private readonly logger = new Logger(AiTeamsModule.name);

  constructor(
    private readonly teamRegistry: TeamRegistry,
    private readonly agentRegistry: AgentRegistry,
    private readonly teamCollaborationAgent: TeamCollaborationAgent,
    private readonly livenessGuard: MissionLivenessGuard,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.teamRegistry.registerConfig(DEBATE_TEAM_CONFIG);
    this.agentRegistry.register(this.teamCollaborationAgent);
    this.logger.log("Registered DEBATE team config and TeamCollaborationAgent");

    // ★ 2026-06-21 runaway 止血：注册 team_missions 的 liveness 适配器。
    //   此前 Teams 无任何 wall-time cap / kill 路径，thrashing/卡死 mission 可无界运行。
    //   team_missions 无 heartbeat 列 → 双 stale 路径依赖 mission_logs 事件信号；
    //   thrashing 持续写 log 时只靠 wall-time(2h) 兜底。
    this.livenessGuard.registerAdapter(
      "ai-teams",
      {
        fetchRunningMissions: async () => {
          try {
            const rows = await this.prisma.teamMission.findMany({
              where: {
                status: {
                  in: [
                    MissionStatus.PLANNING,
                    MissionStatus.IN_PROGRESS,
                    MissionStatus.REVIEW,
                  ],
                },
              },
              select: {
                id: true,
                createdById: true,
                startedAt: true,
                createdAt: true,
              },
              take: 200,
            });
            return rows.map((r) => ({
              id: r.id,
              userId: r.createdById,
              // team_missions 无 heartbeat 列；effective start = startedAt ?? createdAt
              startedAt: r.startedAt ?? r.createdAt,
              heartbeatAt: null,
            }));
          } catch (err: unknown) {
            this.logger.warn(
              `[liveness] teams fetchRunningMissions failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            return [];
          }
        },
        getMostRecentEventTs: async (missionIds, sinceMs) => {
          const out = new Map<string, number>();
          try {
            const grouped = await this.prisma.missionLog.groupBy({
              by: ["missionId"],
              where: {
                missionId: { in: missionIds as string[] },
                createdAt: { gte: new Date(sinceMs) },
              },
              _max: { createdAt: true },
            });
            for (const g of grouped) {
              const ts = g._max.createdAt;
              if (ts) out.set(g.missionId, ts.getTime());
            }
          } catch (err: unknown) {
            this.logger.warn(
              `[liveness] teams getMostRecentEventTs failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          return out;
        },
        markFailed: async (missionId, reason, errorMessage) => {
          try {
            // 条件写（WHERE status IN running-set）→ 幂等首写赢，不覆盖他写已终态。
            const res = await this.prisma.teamMission.updateMany({
              where: {
                id: missionId,
                status: {
                  in: [
                    MissionStatus.PLANNING,
                    MissionStatus.IN_PROGRESS,
                    MissionStatus.REVIEW,
                  ],
                },
              },
              data: {
                status: MissionStatus.FAILED,
                completedAt: new Date(),
                summary: errorMessage.slice(0, 4000),
              },
            });
            if (res.count > 0) {
              // AgentTaskStatus 无 FAILED 值 → 级联 CANCELLED（与 cancelMission 一致）。
              await this.prisma.agentTask.updateMany({
                where: {
                  missionId,
                  status: {
                    in: [AgentTaskStatus.PENDING, AgentTaskStatus.IN_PROGRESS],
                  },
                },
                data: { status: AgentTaskStatus.CANCELLED },
              });
            }
            this.logger.warn(
              `[liveness] teams mission ${missionId} reclaimed (${reason}, won=${res.count > 0})`,
            );
          } catch (err: unknown) {
            this.logger.warn(
              `[liveness] teams markFailed ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      },
      {
        wallTimeCapMs: 2 * 60 * 60 * 1000,
        staleThresholdMs: 15 * 60 * 1000,
        softWarnThresholdMs: 30 * 60 * 1000,
        startupGraceMs: 5 * 60 * 1000,
      },
    );
    this.logger.log("Registered MissionLivenessGuard adapter (ai-teams)");
  }
}
