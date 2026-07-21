/**
 * Playground 应用级事件契约（@nestjs/event-emitter 总线）
 *
 * ★ 2026-07-21 (引用→信源库桥)：mission 成功终态（S11 writeCompleted 赢得
 * 仲裁）后 fire-and-forget emit。消费方：explore 的
 * ReportCitationImportListener —— 按分级闸门把合格 citations 导入公共信源库。
 *
 * 解耦约定：playground 与 explore 互不 import 运行时符号，只共享本文件的
 * 事件名常量与 payload 类型（type-only import 不构成模块依赖）。
 */

/** mission 报告完成（v2 artifact 已持久化、终态 completed 已提交） */
export const PLAYGROUND_REPORT_COMPLETED_EVENT = "playground.report.completed";

/** ArtifactCitation 的跨模块投影（只带导入信源库所需字段） */
export interface ReportCitationSnapshot {
  url: string;
  title?: string;
  domain?: string;
  snippet?: string;
  publishedAt?: string;
  sourceType?:
    | "gov"
    | "academic"
    | "industry"
    | "news"
    | "blog"
    | "community"
    | "other";
  /** 0-100 */
  credibilityScore?: number;
}

export interface PlaygroundReportCompletedPayload {
  missionId: string;
  userId: string;
  /** 报告主题（导入日志/溯源用） */
  topic?: string;
  citations: ReportCitationSnapshot[];
}
