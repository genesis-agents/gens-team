/**
 * RuntimeEnvironmentService 公共类型契约
 *
 * 设计文档：docs/architecture/ai-harness/redesign/11-capability-discovery.md
 *
 * 注意：这是 L2 AI Engine runtime 层通用契约——**不含任何 AI App 特定概念**
 * （无 "{app}"、"harness"、"research-depth" 等）。
 * 各 L3 App 在自己的 CapabilityReconciler 里把本层输出映射到 App 语义。
 */

/**
 * 能力视图的模型分类 —— 与 DB 的 `AIModelType`（用途分层：CHAT / CHAT_FAST /
 * CODE / MULTIMODAL / EVALUATOR / EMBEDDING / RERANK / IMAGE_*）是**两套词表**，
 * 必须显式映射，不能互相 as 断言。
 *
 * ★ 2026-08-02：此前 discoverModels 直接 `row.modelType as RuntimeModelType` 分主桶，
 *   只有 CHAT / EMBEDDING 两个偶然同名的能进桶，CHAT_FAST / CODE / MULTIMODAL /
 *   EVALUATOR 这些同样是文本聊天的枚举值被 `if (bucket)` 静默吞掉。
 *   （REASONING / VISION 不受影响——它们由 isReasoning / supportsVision 走
 *   additive 填充，不依赖 DB 枚举同名。）
 */
export type RuntimeModelType = "CHAT" | "REASONING" | "EMBEDDING" | "VISION";

/**
 * Health 三态语义（核心：unknown ≠ healthy）
 *   - "healthy"：已探测且健康
 *   - "unhealthy"：已探测且不健康（错误率超阈 / probe 失败）
 *   - "unknown"：未探测 / 数据不足。**caller 必须显式处理这种状态**，
 *     不得当成 healthy 用——这是把"假绿灯"全部清除的关键。
 */
export type RuntimeHealth = "healthy" | "unhealthy" | "unknown";

/**
 * costTier 由 DB AIModel.costTier 显式声明（管理员后台填）。
 * 不再用模型名 startsWith 启发式推断。
 *   - "basic" = 便宜（mini / nano / haiku 类）
 *   - "standard" = 主力对话
 *   - "strong" = 旗舰推理（opus / o1 / gpt-5）
 *   - "unknown" = DB 未配置 costTier（caller 应提示管理员去配）
 */
export type RuntimeCostTier = "basic" | "standard" | "strong" | "unknown";

export interface RuntimeModelCapability {
  readonly modelId: string;
  readonly provider: string;
  readonly modelType: RuntimeModelType;
  readonly contextWindow: number;
  readonly costTier: RuntimeCostTier;
  readonly healthy: RuntimeHealth;
  readonly recentErrorRate?: number;
  /**
   * 是否支持图像输入。**不用 VISION 桶承载**——本 schema 里具备视觉的都同时是
   * 文本聊天模型，塞进 VISION 会把它们从 election 候选池（CHAT ∪ REASONING，
   * 见 agent-factory.buildElectionCandidates）里摘掉。视觉是**附加能力**而非
   * 互斥分类，故用字段表达。
   */
  readonly supportsVision?: boolean;
  /** DB 原始 AIModelType，保留给诊断（能力桶是有损映射，排障时要看得见原值）。 */
  readonly sourceModelType?: string;
}

export interface RuntimeToolCapability {
  readonly toolId: string;
  readonly name: string;
  readonly category?: string;
  readonly enabled: boolean;
  readonly healthy: RuntimeHealth;
  readonly note?: string;
}

export interface RuntimeDepHealth {
  readonly healthy: RuntimeHealth;
  readonly checkedAt: string;
  readonly note?: string;
}

export interface RuntimeUserKeyState {
  readonly hasByok: boolean;
  readonly byokProviders: ReadonlyArray<string>;
  readonly sharedKeyAvailable: boolean;
}

/**
 * L2 Environment Snapshot — 客观环境事实，与任何 AI App 无关。
 */
export interface EnvironmentSnapshot {
  readonly generatedAt: string;
  readonly userId: string;
  readonly models: Readonly<
    Record<RuntimeModelType, ReadonlyArray<RuntimeModelCapability>>
  >;
  readonly agents: ReadonlyArray<string>; // L2 AgentRegistry 全量 id
  readonly tools: ReadonlyArray<RuntimeToolCapability>; // L2 ToolRegistry
  readonly skills: ReadonlyArray<string>; // L2 SkillRegistry 全量 id
  readonly userKeys: RuntimeUserKeyState;
  readonly externalDeps: Readonly<Record<string, RuntimeDepHealth>>;
}

export interface EnvironmentSnapshotParams {
  readonly userId: string;
  /** 强制刷新缓存（默认使用 30 秒缓存） */
  readonly force?: boolean;
}
