import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  Prisma,
  SimulationRunStatus,
  SimulationTeam,
  AIModelType,
} from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ExternalDataService } from "./external-data.service";
import { ChatFacade } from "@/modules/ai-harness/facade";
import type { ChatMessage } from "@/modules/ai-harness/facade";
import { ProgressTrackerService } from "@/modules/ai-harness/facade";
import {
  MissionExecutorService,
  MissionContext,
  EventJournalService,
  ResourceManagerService,
  EventBusService,
} from "@/modules/ai-harness/facade";
import { WorkingMemoryManagerService } from "@/modules/ai-harness/facade";
import { LruMap } from "@/common/utils/lru-map";
import {
  AgentPromptPolicy,
  SimulationPolicyService,
} from "./config/simulation-policy.service";
import { renderSimulationTemplate } from "./config/simulation-policy.config";

interface EvidenceRef {
  provider: string;
  status?: string;
  [key: string]: unknown;
}

interface AdjudicationResult {
  ruling: string;
  notes?: string;
  evidenceRefs?: EvidenceRef[];
  worldDelta?: Record<string, unknown>;
  blackSwanEvent?: BlackSwanEvent;
}

// 黑天鹅事件类型 - 基于PRD事件库
interface BlackSwanEvent {
  type: string;
  name: string;
  description: string;
  impact: "high" | "medium" | "low";
  affectedTeams: string[];
  probability: number;
  triggered: boolean;
}

// 黑天鹅事件库：代码常量迁至 config/simulation-policy.config.ts，
// 运行时经 SimulationPolicyService dual-read（key: simulation.prompt.black-swan-events）

@Injectable()
export class AiSimulationEngineService {
  private readonly logger = new Logger(AiSimulationEngineService.name);
  private readonly kernelProcessIds = new LruMap<string, string>(500);

  constructor(
    private readonly prisma: PrismaService,
    private readonly externalData: ExternalDataService,
    private readonly chatFacade: ChatFacade,
    private readonly simulationPolicy: SimulationPolicyService,
    @Optional() private readonly missionExecutor?: MissionExecutorService,
    @Optional() private readonly progressTracker?: ProgressTrackerService,
    @Optional() private readonly kernelJournal?: EventJournalService,
    @Optional() private readonly kernelMemory?: WorkingMemoryManagerService,
    @Optional() private readonly resourceManager?: ResourceManagerService,
    @Optional() private readonly eventBus?: EventBusService,
  ) {
    // Forward-declared kernel service injections (used by future integrations):
    // progressTracker, kernelMemory, resourceManager are wired for upcoming
    // per-round progress events, intermediate state storage, and token budget enforcement.
    void (this.progressTracker, this.kernelMemory, this.resourceManager);
  }

  /**
   * 使用AI模型生成Agent的决策
   * 支持多模型fallback，如果主模型失败则尝试备用模型
   */
  private async generateAgentDecision(
    agent: {
      role: string;
      team: string;
      persona: Prisma.JsonValue;
      memoryPublic: Prisma.JsonValue;
      tools: Prisma.JsonValue;
      [key: string]: unknown;
    },
    worldState: Record<string, unknown>,
    roundNumber: number,
    scenario: { name: string; industry: string; [key: string]: unknown },
    irrationalBias: boolean,
  ): Promise<{ innerMonologue: string; publicAction: string }> {
    // 获取所有可用的AI模型（优先CHAT_FAST，回退CHAT）
    const fastModels = await this.chatFacade.getAvailableModelsExtended(
      AIModelType.CHAT_FAST,
    );
    const chatModels = await this.chatFacade.getAvailableModelsExtended(
      AIModelType.CHAT,
    );
    const models = [...fastModels, ...chatModels];

    if (models.length === 0) {
      this.logger.warn(
        `[Agent ${agent.role}] No AI model available, using template`,
      );
      return this.generateTemplateDecision(agent, worldState, irrationalBias);
    }

    // 构建角色上下文（prompt 模板经 PolicyConfig dual-read，DB 空时逐字节等同代码常量）
    const promptPolicy = await this.simulationPolicy.agentPromptPolicy();
    const systemPrompt = this.buildAgentSystemPrompt(
      agent,
      scenario,
      promptPolicy,
    );
    const userPrompt = this.buildAgentUserPrompt(
      agent,
      worldState,
      roundNumber,
      irrationalBias,
      promptPolicy,
    );

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    // 尝试每个模型，直到成功或全部失败
    for (const model of models) {
      // 跳过不可用的模型
      if (!model.isAvailable) {
        this.logger.debug(
          `[Agent ${agent.role}] Model ${model.name} not available, skipping`,
        );
        continue;
      }

      try {
        const result = await this.chatFacade.chat({
          messages,
          model: model.id,
          taskProfile: {
            creativity: irrationalBias ? "high" : "medium",
            outputLength: "medium",
          },
        });

        // 检查是否返回错误
        if (result.isError) {
          this.logger.warn(
            `[Agent ${agent.role}] Model ${model.name} returned error: ${result.content.slice(0, 100)}`,
          );
          continue; // 尝试下一个模型
        }

        // 成功：解析AI响应并返回
        this.logger.log(`[Agent ${agent.role}] Using model: ${model.name}`);
        return this.parseAgentResponse(result.content, agent);
      } catch (error: unknown) {
        const errorMsg = (error as Error)?.message || String(error);

        // 区分不同类型的错误
        // quota/rate limit errors - 配额或速率限制
        const isQuotaError =
          errorMsg.includes("quota") ||
          errorMsg.includes("rate_limit") ||
          errorMsg.includes("rate limit") ||
          errorMsg.includes("429");

        // max_tokens truncation errors - tokens不足导致截断
        const isTokenLimitError =
          errorMsg.includes("max_tokens") ||
          errorMsg.includes("MAX_TOKENS") ||
          errorMsg.includes("truncated") ||
          errorMsg.includes("finish_reason=length") ||
          errorMsg.includes("finishReason=MAX_TOKENS");

        // empty response errors - API返回空内容
        const isEmptyResponseError =
          errorMsg.includes("No response content") ||
          errorMsg.includes("Empty response");

        if (isQuotaError) {
          this.logger.warn(
            `[Agent ${agent.role}] Model ${model.name} quota/rate limit exceeded, trying next model`,
          );
        } else if (isTokenLimitError) {
          this.logger.warn(
            `[Agent ${agent.role}] Model ${model.name} response truncated (max_tokens too small), trying next model`,
          );
        } else if (isEmptyResponseError) {
          this.logger.warn(
            `[Agent ${agent.role}] Model ${model.name} returned empty response, trying next model`,
          );
        } else {
          this.logger.error(
            `[Agent ${agent.role}] Model ${model.name} failed: ${errorMsg}`,
          );
        }
        continue; // 尝试下一个模型
      }
    }

    // 所有模型都失败，使用模板
    this.logger.warn(
      `[Agent ${agent.role}] All AI models failed, using template`,
    );
    return this.generateTemplateDecision(agent, worldState, irrationalBias);
  }

  private buildAgentSystemPrompt(
    agent: { role: string; team: string; persona: Prisma.JsonValue },
    scenario: { name: string; industry: string },
    promptPolicy: AgentPromptPolicy,
  ): string {
    return renderSimulationTemplate(promptPolicy.systemTemplate, {
      scenarioName: scenario.name,
      industry: scenario.industry,
      teamRole: promptPolicy.teamRoles[agent.team] || "",
      role: agent.role,
      personaSection: agent.persona
        ? `人设：${JSON.stringify(agent.persona)}`
        : "",
    });
  }

  private buildAgentUserPrompt(
    agent: { role: string; team: string; memoryPublic: Prisma.JsonValue },
    worldState: Record<string, unknown>,
    roundNumber: number,
    irrationalBias: boolean,
    promptPolicy: AgentPromptPolicy,
  ): string {
    const marketInfo = worldState.market ? "市场数据已获取" : "市场数据缺失";
    const financeInfo = worldState.finance ? "财务数据已获取" : "财务数据缺失";
    const newsInfo = worldState.news ? "新闻舆情已获取" : "新闻舆情缺失";
    const regulationInfo = worldState.regulation
      ? "监管政策已获取"
      : "监管政策缺失";

    const round = promptPolicy.round;
    const blackSwan = worldState.blackSwan as BlackSwanEvent | undefined;

    return renderSimulationTemplate(round.template, {
      roundNumber: String(roundNumber),
      marketInfo,
      financeInfo,
      newsInfo,
      regulationInfo,
      blackSwanSection: blackSwan
        ? renderSimulationTemplate(round.blackSwanSection, {
            name: blackSwan.name,
            description: blackSwan.description,
          })
        : "",
      irrationalSection: irrationalBias ? round.irrationalSection : "",
      memorySection: agent.memoryPublic
        ? renderSimulationTemplate(round.memorySection, {
            memoryPublic: JSON.stringify(agent.memoryPublic),
          })
        : "",
    });
  }

  private parseAgentResponse(
    response: string,
    agent: { role: string },
  ): { innerMonologue: string; publicAction: string } {
    // 清理响应：移除markdown代码块标记
    const cleanResponse = response
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      // 尝试解析JSON格式
      const jsonMatch = cleanResponse.match(
        /\{[\s\S]*"innerMonologue"[\s\S]*"publicAction"[\s\S]*\}/,
      );
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          innerMonologue: parsed.innerMonologue || "思考中...",
          publicAction: parsed.publicAction || "行动已提交",
        };
      }

      // 尝试直接解析整个响应为JSON
      if (cleanResponse.startsWith("{")) {
        const parsed = JSON.parse(cleanResponse);
        if (parsed.innerMonologue || parsed.publicAction) {
          return {
            innerMonologue: parsed.innerMonologue || "思考中...",
            publicAction: parsed.publicAction || "行动已提交",
          };
        }
      }
    } catch (e) {
      // JSON解析失败，继续尝试其他方式
      this.logger.debug(`[Agent ${agent.role}] JSON parse failed: ${e}`);
    }

    // 检查是否包含JSON结构但解析失败（可能是不完整的JSON）
    if (
      cleanResponse.includes('"innerMonologue"') ||
      cleanResponse.includes('"publicAction"')
    ) {
      // 尝试提取字段值
      const innerMatch = cleanResponse.match(
        /"innerMonologue"\s*:\s*"([^"]+)"/,
      );
      const actionMatch = cleanResponse.match(/"publicAction"\s*:\s*"([^"]+)"/);

      if (innerMatch || actionMatch) {
        return {
          innerMonologue: innerMatch?.[1] || "思考中...",
          publicAction: actionMatch?.[1] || "行动已提交",
        };
      }
    }

    // 回退：如果响应看起来像是纯文本，用它作为决策内容
    // 避免显示JSON代码给用户
    if (!cleanResponse.includes("{") && !cleanResponse.includes("}")) {
      return {
        innerMonologue: cleanResponse.slice(0, 500),
        publicAction: cleanResponse.slice(0, 200),
      };
    }

    // 最后的回退：使用默认值，不显示原始JSON
    return {
      innerMonologue: `${agent.role}正在分析局势并制定策略...`,
      publicAction: `${agent.role}的行动已提交，等待裁判判定`,
    };
  }

  private generateTemplateDecision(
    agent: { role: string; team: string; persona: Prisma.JsonValue },
    worldState: Record<string, unknown>,
    irrationalBias: boolean,
  ): { innerMonologue: string; publicAction: string } {
    const parts = [
      `角色: ${agent.role} (${agent.team})`,
      agent.persona ? `Persona: ${JSON.stringify(agent.persona)}` : "",
      `外部态势: market=${!!worldState.market}, finance=${!!worldState.finance}, news=${!!worldState.news}, regulation=${!!worldState.regulation}`,
      irrationalBias ? "非理性波动：情绪化/短视/误判" : "",
    ].filter(Boolean);

    return {
      innerMonologue: parts.join(" | "),
      publicAction: "盲注：行动已提交，等待裁判判定",
    };
  }

  /**
   * Execute a full run synchronously for now (MVP).
   * Steps: initialize -> per-round submissions -> adjudication -> summary.
   */
  async executeRun(runId: string, options?: { resume?: boolean }) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: {
        scenario: {
          include: { companies: true, agents: true },
        },
        turns: true,
      },
    });
    if (!run) return;

    const rounds = run.rounds ?? 2;

    // Spawn AI Kernel process for tracking
    if (this.missionExecutor && run.startedById) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId: run.startedById,
          agentId: "simulation-engine",
          teamSessionId: runId,
          input: { runId, rounds, scenarioId: run.scenarioId },
        });
        this.kernelProcessIds.set(runId, kernelResult.processId);
        this.recordKernelEvent(runId, "simulation:started", {});
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${(err as Error).message}`,
        );
      }
    }

    const runProcessId = this.kernelProcessIds.get(runId);
    const runSimulation = async () => {
      try {
        // Initialization: fetch external data snapshot
        const evidenceTrail: Array<Record<string, unknown>> = [];
        const state: Record<string, unknown> = {};

        const { snapshot, evidence } = await this.externalData.getSnapshot();
        evidenceTrail.push(...evidence);
        Object.assign(state, snapshot);

        // Save initial world state
        await this.prisma.simulationRun.update({
          where: { id: run.id },
          data: {
            worldState: state as Prisma.InputJsonValue,
            evidenceTrail: evidenceTrail as Prisma.InputJsonValue,
          },
        });

        let currentRound = options?.resume ? run.currentRound || 0 : 0;
        const humanBreakEvery =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
          (run.params as Record<string, any> | null)?.humanBreakEvery !==
          undefined
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
              (run.params as Record<string, any> | null)?.humanBreakEvery
            : 2;

        while (currentRound < rounds) {
          currentRound += 1;
          const turn = await this.processRound(run.id, currentRound);
          this.logger.log(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
            `[Simulation] Run ${run.id} finished round ${currentRound}, ruling=${(turn.adjudication as Record<string, any> | null)?.ruling}`,
          );

          if (
            humanBreakEvery &&
            currentRound % humanBreakEvery === 0 &&
            currentRound < rounds
          ) {
            await this.prisma.simulationRun.update({
              where: { id: run.id },
              data: {
                status: SimulationRunStatus.PAUSED,
                currentRound,
                summary: {
                  ...(run.summary as object),
                  humanBreak: `Paused at round ${currentRound} for human-in-the-loop`,
                } as Prisma.InputJsonValue,
              },
            });
            return;
          }
        }

        const debrief = await this.computeDebrief(run.id);

        await this.prisma.simulationRun.update({
          where: { id: run.id },
          data: {
            status: SimulationRunStatus.COMPLETED,
            currentRound: rounds,
            summary: debrief as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });

        // Complete AI Kernel process
        this.recordKernelEvent(runId, "simulation:debrief.complete", {});
        this.completeKernelProcess(runId, {
          rounds,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error(
          `[Simulation] Run ${runId} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Fail AI Kernel process
        this.recordKernelEvent(runId, "simulation:failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        this.failKernelProcess(
          runId,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }; // end of runSimulation

    await (runProcessId
      ? MissionContext.run(
          { agentProcessId: runProcessId, userId: run.startedById || "" },
          runSimulation,
        )
      : runSimulation());
  }

  private recordKernelEvent(
    entityId: string,
    type: string,
    payload?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(entityId);
    if (!processId || !this.kernelJournal) return;
    void this.kernelJournal
      .record(processId, type, payload)
      .catch((err: unknown) =>
        this.logger.warn(
          `[Kernel] Event ${type} failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  private emitKernelLifecycle(
    entityId: string,
    event: string,
    data?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(entityId);
    if (!processId || !this.eventBus) return;
    this.eventBus.emit({
      type: event,
      payload: { processId, module: "simulation", ...data },
      metadata: { timestamp: new Date(), source: "simulation" },
    });
  }

  private completeKernelProcess(
    runId: string,
    output?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(runId);
    if (!processId || !this.missionExecutor) return;
    this.emitKernelLifecycle(runId, "kernel:mission.complete", output);
    void this.missionExecutor
      .complete(processId, output)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to complete process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(runId);
  }

  private failKernelProcess(runId: string, error: string): void {
    const processId = this.kernelProcessIds.get(runId);
    if (!processId || !this.missionExecutor) return;
    this.emitKernelLifecycle(runId, "kernel:mission.failed", { error });
    void this.missionExecutor
      .fail(processId, error)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to fail process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(runId);
  }

  private async processRound(runId: string, roundNumber: number) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: {
        scenario: {
          include: { agents: true, companies: true },
        },
      },
    });
    if (!run) {
      throw new Error(`Run ${runId} not found when processing round`);
    }

    // Collect submissions: enforce CoT (inner monologue + blind public action scaffold)
    const submissions: Array<Record<string, unknown>> = [];
    const worldState = (run.worldState as Record<string, unknown> | null) || {};
    const irrationalProb =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
      (run.params as Record<string, any> | null)?.irrationalProb !== undefined
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
          (run.params as Record<string, any> | null)?.irrationalProb
        : 0.2;
    const chaosInjectedTeam =
      run.scenario.agents.some((a) => a.team === SimulationTeam.CHAOS) || false;

    // 并行生成所有Agent的决策
    const agentDecisions = await Promise.all(
      run.scenario.agents.map(async (agent) => {
        const irrationalTriggered = Math.random() < irrationalProb;
        const decision = await this.generateAgentDecision(
          agent,
          worldState,
          roundNumber,
          run.scenario,
          irrationalTriggered,
        );
        return { agent, decision, irrationalTriggered };
      }),
    );

    for (const { agent, decision, irrationalTriggered } of agentDecisions) {
      const isChaos = agent.team === SimulationTeam.CHAOS;
      const baseVisibility =
        isChaos || agent.team === SimulationTeam.ARBITER ? "global" : "team";

      const chaosInjected =
        chaosInjectedTeam &&
        isChaos &&
        Math.random() <
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
          ((run.params as Record<string, any> | null)?.chaosProb ?? 0.3);

      const submission = {
        agentId: agent.id,
        companyId: agent.companyId,
        team: agent.team,
        role: agent.role,
        innerMonologue: decision.innerMonologue,
        publicAction: decision.publicAction,
        visibility: baseVisibility,
        timestamp: new Date().toISOString(),
        tools: agent.tools,
        irrational: irrationalTriggered,
        chaosInjected,
      };
      submissions.push(submission);
    }

    const adjudication: AdjudicationResult = await this.simpleAdjudication(
      run,
      submissions,
    );

    const evidenceRefs = adjudication.evidenceRefs || [];

    // 累积worldState：将worldDelta与现有worldState深度合并
    const prevWorldState = (run.worldState as Record<string, unknown>) || {};
    const mergedWorldState = {
      ...prevWorldState,
      ...adjudication.worldDelta,
    };

    const turn = await this.prisma.simulationTurn.create({
      data: {
        runId,
        roundNumber,
        submissions: submissions as Prisma.InputJsonValue,
        adjudication: adjudication as unknown as Prisma.InputJsonValue,
        evidence: evidenceRefs as Prisma.InputJsonValue,
        worldState: mergedWorldState as Prisma.InputJsonValue,
      },
    });

    const prevTrail =
      (run.evidenceTrail as Record<string, unknown> | null) || {};

    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: {
        currentRound: roundNumber,
        worldState: mergedWorldState as Prisma.InputJsonValue,
        evidenceTrail: {
          ...prevTrail,
          [`round_${roundNumber}`]: evidenceRefs,
        } as Prisma.InputJsonValue,
      },
    });

    return turn;
  }

  /**
   * Very lightweight adjudication that relies on external data snapshots.
   * If any provider missing data, mark ruling as "insufficient_evidence".
   */
  private async simpleAdjudication(
    run: {
      worldState: unknown;
      scenario: { companies: Array<{ id: string; metrics: unknown }> };
      params: unknown;
    },
    submissions: Array<Record<string, unknown>>,
  ): Promise<AdjudicationResult> {
    const evidenceRefs: EvidenceRef[] = [];
    const worldDelta: Record<string, unknown> = {};
    const worldState = (run.worldState as Record<string, unknown>) || {};

    // Basic resource sanity check: if a submission declares cost but公司现金不足则驳回
    const companyCashMap: Record<string, number> = {};
    (run.scenario.companies || []).forEach(
      (c: { id: string; metrics: unknown }) => {
        const metrics = c.metrics as Record<string, unknown> | null;
        const cash = metrics?.cash;
        if (typeof cash === "number") {
          companyCashMap[c.id] = cash;
        }
      },
    );

    for (const sub of submissions) {
      const intent = sub.intent as { cost?: number } | undefined;
      const tools = sub.tools as { plannedCost?: number } | undefined;
      const intentCost =
        (intent && typeof intent.cost === "number" ? intent.cost : undefined) ||
        (tools && typeof tools.plannedCost === "number"
          ? tools.plannedCost
          : undefined);
      const companyId = sub.companyId as string | undefined;
      if (intentCost !== undefined && companyId) {
        const available = companyCashMap[companyId];
        if (typeof available === "number" && intentCost > available) {
          evidenceRefs.push({
            provider: "arbiter",
            status: "rejected",
            reason: "insufficient_funds",
            detail: `plannedCost=${intentCost} > cash=${available}`,
          });
          return {
            ruling: "rejected_insufficient_funds",
            notes: "裁判驳回：资金不足以支撑该行动。",
            evidenceRefs,
            worldDelta,
          };
        }
      }
    }

    const providers = ["market", "finance", "news", "regulation"];
    const missing = providers.filter(
      (p) => !worldState[p] || (worldState[p] as { error?: unknown })?.error,
    );

    if (missing.length > 0) {
      missing.forEach((p) => {
        evidenceRefs.push({
          provider: p,
          status: "missing",
          note: "依据不足",
        });
      });
      // Warning: 允许推演继续，但标记数据不完整
      this.logger.warn(
        `[Adjudication] Missing external data: ${missing.join(", ")} - continuing with limited evidence`,
      );
    }

    // Minimal heuristic: mirror current state + submissions count
    worldDelta["last_submissions"] = submissions.length;

    // Chaos / Black Swan toggle based on params
    const chaosProb =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
      (run.params as Record<string, any> | null)?.chaosProb ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
      (run.params as Record<string, any> | null)?.blackSwanProb ??
      0.1;
    const chaosTriggered = Math.random() < chaosProb;
    // 非理性因素：对部分队别施加随机偏置
    const irrationalBias = Math.random() < 0.3 ? "irrational_spike" : null;

    let blackSwanEvent: BlackSwanEvent | undefined;

    if (chaosTriggered) {
      // 从事件库中随机选择一个黑天鹅事件（事件库经 PolicyConfig dual-read）
      const blackSwanLibrary = await this.simulationPolicy.blackSwanEvents();
      const randomIndex = Math.floor(Math.random() * blackSwanLibrary.length);
      const selectedEvent = blackSwanLibrary[randomIndex];
      blackSwanEvent = {
        ...selectedEvent,
        probability: chaosProb,
        triggered: true,
      };

      evidenceRefs.push({
        provider: "chaos",
        status: "triggered",
        event: blackSwanEvent,
        timestamp: new Date().toISOString(),
      });

      worldDelta["blackSwan"] = blackSwanEvent;
      worldDelta["blackSwanHistory"] = [
        ...((worldState["blackSwanHistory"] as unknown[]) || []),
        {
          ...blackSwanEvent,
          triggeredAt: new Date().toISOString(),
        },
      ];

      this.logger.warn(
        `[Black Swan] ${blackSwanEvent?.name}: ${blackSwanEvent?.description}`,
      );
    }

    if (irrationalBias) {
      evidenceRefs.push({
        provider: "arbiter",
        status: "irrational_bias",
        note: "Inject slight non-rational behavior to avoid echo chamber",
        timestamp: new Date().toISOString(),
      });
      worldDelta["irrationalBias"] = irrationalBias;
    }

    // 基于外部数据进行证据链记录
    const evidenceSummary: string[] = [];
    if (worldState.market) {
      evidenceSummary.push("市场数据已验证");
    }
    if (worldState.finance) {
      evidenceSummary.push("财务数据已验证");
    }
    if (worldState.news) {
      evidenceSummary.push("新闻舆情已检索");
    }
    if (worldState.regulation) {
      evidenceSummary.push("监管政策已核查");
    }

    evidenceRefs.push({
      provider: "arbiter",
      status: "ok",
      note: `裁判判定完成: ${evidenceSummary.join(", ")}`,
      timestamp: new Date().toISOString(),
    });

    // 生成裁判结论
    let ruling = "proceed";
    let notes =
      missing.length > 0
        ? `部分外部数据缺失 [${missing.join(", ")}]，推演继续但依据有限。所有行动可行性已验证，可继续下一回合或等待人类干预。`
        : "数据齐备，所有行动可行性已验证，可继续下一回合或等待人类干预。";

    if (chaosTriggered && blackSwanEvent) {
      ruling = "black_swan";
      notes = `黑天鹅事件触发: 【${blackSwanEvent.name}】${blackSwanEvent.description}。影响级别: ${blackSwanEvent.impact}，受影响阵营: ${blackSwanEvent.affectedTeams.join("/")}。建议人类介入评估影响范围。`;
    }

    return {
      ruling,
      notes,
      evidenceRefs,
      worldDelta,
      blackSwanEvent,
    };
  }

  private async computeDebrief(runId: string) {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: {
        turns: true,
        scenario: { include: { agents: true, companies: true } },
      },
    });
    if (!run) return {};

    const keyFindings: string[] = [];
    const monologueLog: unknown[] = [];
    const causalChain: Array<{
      round: number;
      cause: string;
      effect: { significance?: string } | null;
      timestamp: Date;
    }> = [];
    const biasesDetected: Array<{
      round: number;
      type: string;
      description: string;
      recommendation: string;
      team?: string;
      role?: string;
    }> = [];
    const blindspots: Array<{
      type: string;
      description: string;
      recommendation: string;
      team?: string;
    }> = [];
    const counterfactuals: Array<{
      round: number;
      scenario: string;
      potentialOutcome: string;
      probability: string;
    }> = [];
    const blackSwanEvents: unknown[] = [];

    // Missing data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column cast; runtime shape is untyped
    const worldState = (run.worldState as Record<string, any>) || {};
    const missing = ["market", "finance", "news", "regulation"].filter(
      (p) => !worldState[p] || worldState[p]?.error,
    );
    if (missing.length > 0) {
      keyFindings.push(`外部数据缺失：${missing.join(",")}，裁判标记依据不足`);
      blindspots.push({
        type: "data_gap",
        description: `外部数据源 [${missing.join(", ")}] 未配置或数据获取失败`,
        recommendation: "建议在Settings -> External API配置相关数据源",
      });
    }

    // Black swan history
    if (worldState["blackSwanHistory"]) {
      blackSwanEvents.push(
        ...((worldState["blackSwanHistory"] as unknown[]) || []),
      );
    }
    if (worldState["blackSwan"]) {
      const bs = worldState["blackSwan"] as BlackSwanEvent;
      keyFindings.push(`黑天鹅触发：【${bs.name}】${bs.description}`);
    }

    // Scan turns and build analysis
    const teamActions: Record<string, unknown[]> = {};
    let prevWorldState: Record<string, unknown> | null = null;

    for (const turn of run.turns) {
      const adjudication = turn.adjudication as Record<string, unknown>;
      const currentWorldState = turn.worldState as Record<string, unknown>;

      // Track state changes for causal chain
      if (prevWorldState && currentWorldState) {
        const stateChange = this.detectStateChange(
          prevWorldState,
          currentWorldState,
        );
        if (stateChange) {
          causalChain.push({
            round: turn.roundNumber,
            cause: `回合${turn.roundNumber}各方行动`,
            effect: stateChange,
            timestamp: turn.createdAt,
          });
        }
      }
      prevWorldState = currentWorldState;

      if (adjudication?.ruling === "rejected_insufficient_funds") {
        keyFindings.push(
          `回合${turn.roundNumber} 裁判驳回：资金不足 (${adjudication?.notes || ""})`,
        );
        // 检测决策偏见：资金不足仍尝试大额投入
        biasesDetected.push({
          round: turn.roundNumber,
          type: "overconfidence",
          description: "过度自信偏见：在资金不足的情况下仍尝试大额投入",
          recommendation: "建议重新评估资源约束后制定保守策略",
        });
      }

      if (adjudication?.ruling === "insufficient_evidence") {
        keyFindings.push(`回合${turn.roundNumber} 数据不足，需补充外部证据`);
      }

      if (adjudication?.ruling === "black_swan") {
        keyFindings.push(
          `回合${turn.roundNumber} 黑天鹅事件：${adjudication?.notes || ""}`,
        );
        // 生成反事实推理
        const blackSwanEvent = adjudication.blackSwanEvent as BlackSwanEvent;
        if (blackSwanEvent) {
          counterfactuals.push({
            round: turn.roundNumber,
            scenario: `如果【${blackSwanEvent.name}】未发生`,
            potentialOutcome: `${blackSwanEvent.affectedTeams.join("/")}阵营可能按原计划推进，市场格局不会剧变`,
            probability: "假设性分析",
          });
        }
      }

      const submissions =
        (turn.submissions as Array<{
          agentId?: string;
          team?: string;
          role?: string;
          publicAction?: string;
          irrational?: boolean;
          companyId?: string;
          innerMonologue?: string;
          visibility?: string;
          timestamp?: string;
          chaosInjected?: boolean;
        }>) || [];
      submissions.forEach((s) => {
        const agent = run.scenario.agents.find((a) => a.id === s.agentId);

        // Build team action history
        if (s.team !== undefined) {
          if (!teamActions[s.team]) teamActions[s.team] = [];
          teamActions[s.team].push({
            round: turn.roundNumber,
            role: s.role,
            action: s.publicAction,
            irrational: s.irrational,
          });
        }

        // Detect irrational behavior
        if (s.irrational) {
          biasesDetected.push({
            round: turn.roundNumber,
            team: s.team,
            role: s.role,
            type: "irrational_spike",
            description: `${s.role}在本回合表现出非理性决策倾向（情绪化/短视/误判）`,
            recommendation: "建议在人类干预环节重点审视该角色决策",
          });
        }

        monologueLog.push({
          round: turn.roundNumber,
          team: s.team,
          role: s.role,
          agentId: s.agentId,
          companyId: s.companyId,
          innerMonologue: s.innerMonologue,
          visibility: s.visibility,
          timestamp: s.timestamp,
          agentName: agent?.role || s.role,
          irrational: s.irrational,
          chaosInjected: s.chaosInjected,
        });
      });
    }

    // Analyze team behavior patterns
    for (const [team, actions] of Object.entries(teamActions)) {
      const irrationalCount = actions.filter(
        (a) => (a as { irrational?: boolean }).irrational,
      ).length;
      if (irrationalCount > actions.length * 0.3) {
        blindspots.push({
          type: "team_behavior",
          team,
          description: `${team}阵营在${irrationalCount}/${actions.length}回合表现出非理性决策`,
          recommendation: "建议重新审视该阵营Persona设置的风险容忍度和偏见配置",
        });
      }
    }

    // Generate counterfactual for key turning points
    const turningPoints = causalChain.filter(
      (c) => c.effect?.significance === "high",
    );
    turningPoints.forEach((tp) => {
      counterfactuals.push({
        round: tp.round,
        scenario: `如果回合${tp.round}采取不同策略`,
        potentialOutcome: "市场格局可能产生显著不同的演变路径",
        probability: "假设性分析",
      });
    });

    return {
      // 公开版报告
      publicReport: {
        keyFindings: Array.from(new Set(keyFindings)),
        causalChain: causalChain.slice(0, 5), // 公开版只展示主要因果链
        blackSwanEvents,
      },
      // 内部版报告
      internalReport: {
        keyFindings: Array.from(new Set(keyFindings)),
        causalChain,
        biasesDetected,
        blindspots,
        counterfactuals,
        blackSwanEvents,
        monologueLog,
      },
      // 原始数据
      worldState,
      teamActions,
    };
  }

  /**
   * 检测状态变化以构建因果链
   */
  private detectStateChange(
    prev: Record<string, unknown>,
    current: Record<string, unknown>,
  ): { changes: string[]; significance: "high" | "medium" | "low" } | null {
    const changes: string[] = [];
    let significance: "high" | "medium" | "low" = "low";

    // Check for black swan
    if (!prev["blackSwan"] && current["blackSwan"]) {
      const blackSwan = current["blackSwan"] as { name?: string };
      changes.push(`黑天鹅事件: ${blackSwan.name}`);
      significance = "high";
    }

    // Check for irrational bias
    if (!prev["irrationalBias"] && current["irrationalBias"]) {
      changes.push("非理性波动注入");
      if (significance === "low") significance = "medium";
    }

    // Check submissions count change
    if (
      prev["last_submissions"] !== current["last_submissions"] &&
      current["last_submissions"]
    ) {
      changes.push(`提交数: ${current["last_submissions"]}`);
    }

    if (changes.length === 0) return null;

    return {
      changes,
      significance,
    };
  }
}
