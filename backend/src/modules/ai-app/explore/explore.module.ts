import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { YoutubeController } from "./youtube.controller";
import { YoutubeService, ToolRegistry } from "@/modules/ai-harness/facade";
import { PdfGeneratorService } from "./pdf-generator.service";
import { YoutubeVideosController } from "./youtube-videos.controller";
import { YoutubeVideosService } from "./youtube-videos.service";
import { YoutubeAiChatController } from "./youtube-ai-chat/youtube-ai-chat.controller";
import { YoutubeAiChatService } from "./youtube-ai-chat/youtube-ai-chat.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { BrowserModule } from "../../../common/browser/browser.module";
import { SystemSettingModule } from "../../../common/settings/system-setting.module";
import { ToolKeyResolverModule } from "../../platform/credentials/resolution/tool-key-resolver/tool-key-resolver.module";
import { ExploreContentSourceProvider } from "./integrations/explore-content-source.provider";
import { ExploreSearchTool } from "./integrations/explore-search.tool";
// ★ 2026-07-21: 引用→公共信源库导入桥（监听 playground.report.completed）
import { ReportCitationImportListener } from "./integrations/report-citation-import.listener";
import { IngestionConfigModule } from "./ingestion/config/config.module";

/**
 * Explore Module
 * 整合 YouTube 相关功能：字幕获取、PDF导出、视频管理、AI 聊天历史
 */
@Module({
  imports: [
    PrismaModule,
    BrowserModule,
    SystemSettingModule,
    ToolKeyResolverModule,
    // ★ 2026-07-21: ReportCitationImportListener 需要 ImportManagerService
    IngestionConfigModule,
  ],
  controllers: [
    YoutubeController,
    YoutubeVideosController,
    YoutubeAiChatController,
  ],
  providers: [
    YoutubeService,
    PdfGeneratorService,
    YoutubeVideosService,
    YoutubeAiChatService,
    // Generic ContentSource — auto-discovered by engine ContentSourceRegistry
    ExploreContentSourceProvider,
    // 前沿库检索工具 → 注册进全局 ToolRegistry（DEFAULT_RETRIEVAL_TOOL_IDS 成员）
    ExploreSearchTool,
    // ★ 2026-07-21: Insight 报告引用 → 公共信源库分级导入（事件消费端）
    ReportCitationImportListener,
  ],
  exports: [
    YoutubeService,
    PdfGeneratorService,
    YoutubeVideosService,
    YoutubeAiChatService,
    ExploreContentSourceProvider,
  ],
})
export class ExploreModule implements OnModuleInit {
  private readonly logger = new Logger(ExploreModule.name);

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly exploreSearchTool: ExploreSearchTool,
  ) {}

  onModuleInit(): void {
    // 注册 explore-search 到全局 ToolRegistry（information 类目，register 幂等）——
    // 各研究型 agent 经 DEFAULT_RETRIEVAL_TOOL_IDS 即可把前沿库纳入默认检索能力。
    this.toolRegistry.register(this.exploreSearchTool);
    this.logger.log("ExploreModule: registered explore-search tool");
  }
}
