/**
 * Figure Relevance Service —— figure pipeline 的质量闸门
 *
 * ★ v18.0 (2026-08-09) 根因重构：从「只判主题相关」升级为「主题相关 + 信息量」两道闸。
 *
 * 用户实证（RSI 深度调研报告）：整篇报告配图基本是人物头像和新闻现场照。
 * 复盘出的根因是**两代"根因重构"各拆掉一道闸，最后一道也没了**：
 *   1. extractor v6.0 把"必须像图表"的白名单换成黑名单 —— 只挡 URL/alt 里
 *      字面带 avatar/headshot/logo 的图，新闻站正文首图与人物照全部放行；
 *   2. 本 service v17.0 把 Vision 换成 caption embedding —— 判据变成
 *      "caption 和主题相不相关"，而不是"这张图有没有信息量"。
 *      "Tian Yuan Dong" 这个 caption 对 RSI 主题**确实相关**，人头照必然通过；
 *   3. type = chart/table/diagram 一律免检，而 type 是 classifyFigureType 靠
 *      caption 关键词猜的 —— caption 带"架构/趋势"的照片直接免检入库。
 *
 * v18 的闸门顺序（成本从低到高，能用规则判掉的绝不调模型）：
 *
 *   Stage A 硬闸（零 LLM）
 *     · caption/alt 有效长度不足 → 拒
 *     · URL 命中人物页 / 署名图路径特征 → 拒
 *
 *   Stage B 主题相关性（沿用 v17：一次 LLM batch 判 caption，失败回落 embedding）
 *     · 只对 photo 类型判；informational 类型跳过（与 v17 行为一致）
 *
 *   Stage C 信息量（v18 新增，本次修复核心）
 *     · 结构化强信号 → 直通，零成本、不调模型。三类信号：
 *         - caption 学术图说前缀（"Figure 3:" / "表 1："）—— 置信度最高
 *         - URL 落在 /charts/ /figures/ 等通用图表目录，或含 fig-3 这类编号
 *         - caption 同时具备数字与图表词汇
 *     · 其余一律 borderline → **一次 Vision batch 真看图**判是否承载信息
 *     · Vision 不可用 / 失败 → 只丢 borderline（fail-closed），强信号图不受影响
 *
 * ★ 降级语义（没有配 vision 模型时）：不是"跳过检测放行全部"，也不是"全部丢弃"，
 *   而是**只放行强结构信号图**。生产核查（2026-08-09）发现多数账号没有可用的
 *   vision 模型，所以这条降级路径是常态而非边缘情况。它能成立的前提是
 *   ai-engine/content/figure 把 arXiv abs 解析到 HTML 渲染版 —— 那里的
 *   `<figcaption>` 就是 "Figure 1: ..."，强信号自然充足。两处改动互为前提。
 *
 *   Stage D 排序：直通 > Vision 通过；组内按 informationScore 降序
 *
 * ★ 返回值契约变更：返回列表**已按信息量降序**（best first）。
 *   调用方（s3 figure pipeline）对结果做 slice(0, N)，v17 的无序返回让
 *   slice 实际取的是"页面最靠前的 N 张" = 文章头图 / 作者照。
 *
 * ★ fail-closed 原则：任何一道闸出错都不再 fail-open 放行。v17 在 embedding
 *   拿不到向量时"廉价 lexical fallback"，调用方在整体失败时回退全量未过滤图，
 *   两者叠加等于闸门形同虚设。质量第一，宁可这一维度没有配图。
 */

// Sediment from {app} (2026-04-29) — ai-harness/governance/figure/
// 来源: ai-app/{app}/services/report/figure-relevance.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
// ★ ExtractedFigure 类型从 ai-engine/content/figure 沉淀版本拿（同源 schema，避免双份）
import type { ExtractedFigure } from "@/modules/ai-engine/facade";
// AIFacade 在 ai-harness 同层
import { AIFacade } from "../../facade";

/** 信息性图片类型：Stage B 主题相关性判断跳过（Stage C 信息量闸仍然要过） */
const INFORMATIONAL_FIGURE_TYPES = new Set(["chart", "table", "diagram"]);

/**
 * Stage B 全局相关性阈值：photo caption 与研究主题的 cosine 相似度下限。
 *
 * ★ R-LIVE-3 (2026-04-30): 实证 0.35 对中文政策/法规类 dim 过严（10 张抽样 0
 *   命中），跨语言（中文 caption vs 英文 topicTitle）downstream cosine 普遍
 *   0.25-0.32 区间。降到 0.28 作为"safety net"，让边缘相关图通过。
 */
const STAGE2_COSINE_THRESHOLD = 0.28;

/** photo 有效 caption 最小长度（< 10 字符视为无描述，直接拒绝） */
const MIN_CAPTION_LENGTH = 10;

/**
 * 单次 Vision batch 最多看几张图。
 *
 * 超出部分按 informationScore 取前 N 张，其余丢弃并 log 明示丢了多少
 * （不做静默截断 —— 静默截断会让"覆盖不全"读起来像"已全覆盖"）。
 */
const VISION_BATCH_MAX = 8;

/**
 * 人物照 / 署名图的**结构化**特征（路径段与文件名约定，非站点白名单）。
 *
 * 只匹配业界通用的目录/命名约定，不列举具体域名 —— 域名清单会过时，
 * 且项目已有 canonical 的来源信誉表（tool_configs.industry-report.config.sources）
 * 负责"这个站可不可信"，本 service 只负责"这张图是不是人物照"。
 */
const PERSON_IMAGE_URL_PATTERNS: RegExp[] = [
  /\/(people|team|staff|authors?|contributors?|speakers?|leadership|founders?|bios?)\//i,
  /(headshot|portrait|byline|mugshot|avatar|profile[-_]?(?:pic|photo|image))/i,
];

/**
 * 站点固定装饰资产（页脚赞助方 logo、品牌图、徽章等）—— 不是内容图。
 *
 * ★ 生产 artifact 51b6b494 实证：19 张配图里有 3 张是 arXiv 页脚的赞助方 logo
 *   （`arxiv.org/static/base/1.0.1/images/funders/simons-foundation.png` 等，
 *   caption 就是 "Simons Foundation" / "Schmidt Sciences"）。这类图**每个 arXiv
 *   页面都一样**，与研究主题零关系，却因为 extractor v6.0 的黑名单只挡字面含
 *   "logo" 的 URL 而全部放行。
 *
 * 用通用目录约定匹配，不列域名。注意不能一刀切 `/images/` 或 `/assets/` ——
 * METR 的真图表就在 `metr.org/assets/images/time-horizon-1-1/` 下。
 */
const SITE_CHROME_URL_PATTERNS: RegExp[] = [
  /\/(funders?|sponsors?|partners?|logos?|branding?|badges?)\//i,
];

/**
 * 结构化"这是图表"强信号（通用命名约定，非站点白名单）。
 * 命中即视为信息性图片，跳过 Vision，零成本直通。
 */
const FIGURE_URL_PATTERNS: RegExp[] = [
  /\/(charts?|figures?|graphs?|plots?|tables?|diagrams?|infographics?|exhibits?)\//i,
  /(^|[-_/])(fig|figure|chart|graph|plot|exhibit)[-_]?\d+/i,
];

/**
 * 学术图说前缀 —— 最硬的结构信号。
 *
 * `<figcaption>` 以 "Figure 3:" / "Table 1." / "图 2：" 开头，是论文排版的强约定：
 * 这就是一张正式编号的图表，不可能是人物照或装饰图。
 *
 * ★ 2026-08-09 加这条的直接动机：多数账号没有配可用的 vision 模型（生产核查），
 *   Vision 闸门用不了时 borderline 会被全部丢弃。有了这条，论文类来源的真图表
 *   **不依赖 Vision 也能稳稳放行** —— 与 extractor 把 arXiv abs 解析到 HTML
 *   渲染版是同一件事的两半，缺一不可。
 */
const CAPTION_ACADEMIC_LABEL =
  /^\s*(figure|fig\.?|table|chart|exhibit|图|表)\s*\.?\s*\d+\s*[:：.、]/i;

/** caption 里的"承载数据"信号：数字 + 单位 / 百分比 / 年份 / 图表词汇 */
const CAPTION_DATA_SIGNAL = /\d/;
const CAPTION_FIGURE_VOCAB =
  /(chart|graph|plot|trend|forecast|projection|distribution|benchmark|share|growth|rate|index|comparison|breakdown|timeline|架构图|示意图|流程图|趋势|增长|占比|对比|分布|统计|预测|走势)/i;

/** Cosine 相似度计算 */
function cosine(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA === 0 || magB === 0
    ? 0
    : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** 取 caption（优先 caption，回落 alt），trim 后返回 */
function captionOf(fig: ExtractedFigure): string {
  return (fig.caption ?? fig.alt ?? "").trim();
}

@Injectable()
export class FigureRelevanceService {
  private readonly logger = new Logger(FigureRelevanceService.name);

  constructor(private readonly engineFacade: AIFacade) {}

  /**
   * 对候选图片列表做「主题相关 + 信息量」双闸过滤。
   *
   * @param figures - 经过 validateAndUpgradeFigures 后的候选图片
   * @param topicTitle - 研究主题 / 维度标题
   * @returns 通过全部闸门的图片，**已按信息量降序**（调用方可直接 slice(0, N)）
   */
  async filterRelevantFigures(
    figures: ExtractedFigure[],
    topicTitle: string,
  ): Promise<ExtractedFigure[]> {
    if (figures.length === 0) return [];

    // ── Stage A: 硬闸（零成本）────────────────────────────────────
    const afterHardGate = figures.filter((fig) => !this.isHardRejected(fig));
    if (afterHardGate.length < figures.length) {
      this.logger.log(
        `[figureGate] Stage A 硬闸拒 ${figures.length - afterHardGate.length}/${figures.length}（无有效 caption 或人物照特征）`,
      );
    }
    if (afterHardGate.length === 0) return [];

    // ── Stage B: 主题相关性（photo only，与 v17 一致）──────────────
    const topicRelevant = await this.filterByTopicRelevance(
      afterHardGate,
      topicTitle,
    );
    if (topicRelevant.length === 0) {
      this.logger.log(`[figureGate] Stage B 主题相关性过滤后为空`);
      return [];
    }

    // ── Stage C: 信息量闸（结构化直通 + Vision 兜底）────────────────
    const directPass: ExtractedFigure[] = [];
    const borderline: ExtractedFigure[] = [];
    for (const fig of topicRelevant) {
      if (this.hasStrongFigureSignal(fig)) directPass.push(fig);
      else borderline.push(fig);
    }

    const visionAccepted = await this.filterByVision(borderline, topicTitle);

    // ── Stage D: 排序（直通优先，组内按信息量降序）──────────────────
    const rank = (list: ExtractedFigure[]): ExtractedFigure[] =>
      list
        .map((fig, i) => ({ fig, score: this.informationScore(fig), i }))
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .map((e) => e.fig);

    const result = [...rank(directPass), ...rank(visionAccepted)];
    this.logger.log(
      `[figureGate] "${topicTitle}": ${figures.length} 候选 → 硬闸后 ${afterHardGate.length} → ` +
        `主题相关 ${topicRelevant.length} → 直通 ${directPass.length} + Vision 通过 ${visionAccepted.length}/${borderline.length} ` +
        `= 最终 ${result.length}（v18 双闸）`,
    );
    return result;
  }

  // ─── Stage A ───────────────────────────────────────────────────

  /** 明确的非内容图：无有效描述 / 人物照结构特征 */
  private isHardRejected(fig: ExtractedFigure): boolean {
    if (captionOf(fig).length < MIN_CAPTION_LENGTH) return true;
    const url = fig.imageUrl ?? "";
    return (
      PERSON_IMAGE_URL_PATTERNS.some((re) => re.test(url)) ||
      SITE_CHROME_URL_PATTERNS.some((re) => re.test(url))
    );
  }

  // ─── Stage C 辅助 ───────────────────────────────────────────────

  /**
   * 结构化"这是图表"强信号 —— 命中则跳过 Vision 直通。
   *
   * 注意**不信任 fig.type**：type 由 classifyFigureType 靠 caption 关键词猜，
   * caption 里带"架构"的人物照会被猜成 diagram。信号只取 URL 命名约定，
   * 以及 caption 同时具备"数据 + 图表词汇"这种不易误判的组合。
   */
  private hasStrongFigureSignal(fig: ExtractedFigure): boolean {
    const caption = captionOf(fig);
    // 学术图说前缀（"Figure 3:" / "表 1："）—— 论文排版的强约定，最高置信
    if (CAPTION_ACADEMIC_LABEL.test(caption)) return true;
    const url = fig.imageUrl ?? "";
    if (FIGURE_URL_PATTERNS.some((re) => re.test(url))) return true;
    return (
      CAPTION_DATA_SIGNAL.test(caption) && CAPTION_FIGURE_VOCAB.test(caption)
    );
  }

  /** 信息量打分（仅用于排序，不做通过/拒绝判定） */
  private informationScore(fig: ExtractedFigure): number {
    const caption = captionOf(fig);
    const url = fig.imageUrl ?? "";
    let score = 0;
    if (CAPTION_ACADEMIC_LABEL.test(caption)) score += 5;
    if (FIGURE_URL_PATTERNS.some((re) => re.test(url))) score += 4;
    if (CAPTION_FIGURE_VOCAB.test(caption)) score += 3;
    if (/\d+\s*(%|％)/.test(caption)) score += 2;
    if (CAPTION_DATA_SIGNAL.test(caption)) score += 1;
    if (INFORMATIONAL_FIGURE_TYPES.has(fig.type)) score += 1;
    return score;
  }

  /**
   * Vision batch —— 一次调用真看图，判"是否承载信息的图表/示意图/表格"。
   *
   * 这是 v17 用 caption embedding 换掉后丢失、v18 补回的能力：caption 判不出
   * "这是一张人物照还是一张折线图"，只有看图能判。为控成本：
   *   · 只对 Stage C borderline 调用（结构化强信号的图不进这里）
   *   · 单次最多 VISION_BATCH_MAX 张，一次请求判完
   *   · 失败 / 模型不可用 → 全拒（fail-closed）
   */
  private async filterByVision(
    borderline: ExtractedFigure[],
    topicTitle: string,
  ): Promise<ExtractedFigure[]> {
    if (borderline.length === 0) return [];

    // ★ 2026-08-09 前置能力校验（生产核查后加，防"失败伪装成成功"）：
    //   ChatFacade.resolveModelId 在找不到该 modelType 的模型时**返回空串**，
    //   下游会回落到普通 CHAT 模型。那样这次调用照样「成功」，但模型根本没看图，
    //   只是按 prompt 里的 caption 列表作答 —— 日志却会打印"Vision 判图：保留 N/M"。
    //   生产核查（2026-08-09）实测：本项目多数账号的 MULTIMODAL 配置为
    //   is_enabled=false / supports_vision=false，这条路径会真实发生。
    //   所以先确认真有一个 supportsVision 的模型，没有就直接按"闸门不可用"处理。
    const visionModel = await this.resolveVisionModel();
    if (!visionModel) {
      this.logger.error(
        `[figureGate] 未找到可用的 vision 模型（AIModelType.MULTIMODAL 且 supportsVision=true）——` +
          ` ${borderline.length} 张"需要看图才能判定"的候选图已丢弃（fail-closed）。` +
          ` 注意：强结构信号图（学术图说 "Figure N:" / 图表目录 URL）不受影响，仍会放行。` +
          ` 若报告配图仍偏少，请在模型配置里启用一个支持图像输入的 MULTIMODAL 模型。`,
      );
      return [];
    }

    // 超额部分按信息量取前 N，明示丢弃数量（不静默截断）
    const ordered = borderline
      .map((fig, i) => ({ fig, score: this.informationScore(fig), i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((e) => e.fig);
    const batch = ordered.slice(0, VISION_BATCH_MAX);
    if (ordered.length > batch.length) {
      this.logger.log(
        `[figureGate] Vision batch 上限 ${VISION_BATCH_MAX}，本轮丢弃 ${ordered.length - batch.length} 张低分候选`,
      );
    }

    const instruction = [
      `研究主题：${topicTitle}`,
      "",
      `下面按顺序给出 ${batch.length} 张候选配图（编号 0 起）及其 caption。`,
      "请**看图本身**判断每张图是否值得放进一份严肃研究报告作为插图。",
      "",
      "判定为「保留」的条件（两条都要满足）：",
      "  1) 图本身承载信息：数据图表、统计图、示意图/架构图/流程图、表格截图、benchmark 结果图；",
      "  2) 图的内容与研究主题相关。",
      "",
      "判定为「丢弃」（不论 caption 写得多相关）：",
      "  · 人物肖像 / 合影 / 演讲现场照 / 记者会照片",
      "  · 产品外观照、办公室照、城市风光、配图性质的图库照片",
      "  · 纯 Logo、封面海报、广告横幅、二维码、装饰底图",
      "  · 看不清内容、纯色块、加载失败的占位图",
      "",
      "caption 列表：",
      ...batch.map((f, i) => `  ${i}. ${captionOf(f).slice(0, 200)}`),
      "",
      '返回 JSON：{ "keepIndices": <number[]> }，只列出应保留的图片编号。',
      "宁可少留，不要凑数：不确定的一律不列入。",
    ].join("\n");

    try {
      const result = await this.engineFacade.chatStructured<{
        keepIndices: number[];
      }>({
        // 用上面校验过的具体模型，不再让 modelType 走可能落空的默认解析
        model: visionModel,
        systemPrompt:
          "你是研究报告的配图审校。你会真正查看图片内容，只放行承载信息的图表类图片，人物照与装饰图一律拒绝。输出严格 JSON。",
        messages: [
          {
            role: "user",
            // content 是纯文本 fallback（日志摘要 / 非多模态模型降级用）
            content: instruction,
            contentParts: [
              { type: "text", text: instruction },
              ...batch.map((f) => ({
                type: "image_url" as const,
                image_url: { url: f.imageUrl, detail: "low" as const },
              })),
            ],
          },
        ],
        schema: {
          type: "object",
          properties: {
            keepIndices: { type: "array", items: { type: "number" } },
          },
          required: ["keepIndices"],
        },
        taskProfile: { creativity: "deterministic", outputLength: "short" },
        throwOnParseError: false,
        maxRetries: 1,
        // ★ 2026-06-11 护栏误杀修复：caption 是网页抓取的研究语料，易被
        //   llm-moderation 误判 harmful/injection 而整批拦掉。trustedInternal=true：
        //   正则护栏 + PII 照跑，但可疑结果不升级 LLM 审核、不 block。
        trustedInternal: true,
      });

      // LLM 可能返回越界 index（如 3 张图却返回 [0,1,99]），必须叠加边界检查
      const keep = new Set<number>(
        Array.isArray(result.data?.keepIndices)
          ? result.data.keepIndices.filter(
              (n: unknown): n is number =>
                typeof n === "number" &&
                Number.isInteger(n) &&
                n >= 0 &&
                n < batch.length,
            )
          : [],
      );
      const accepted = batch.filter((_, i) => keep.has(i));
      this.logger.log(
        `[figureGate] Vision 判图：保留 ${accepted.length}/${batch.length}`,
      );
      return accepted;
    } catch (err) {
      // fail-closed：判不了就不放行。v17 在这里 fail-open，是垃圾图涌入的直接原因。
      this.logger.warn(
        `[figureGate] Vision 判图失败，${batch.length} 张 borderline 全部丢弃（fail-closed）: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  /**
   * 解析出一个**确实支持图像输入**的模型 id；没有则返回 null。
   *
   * 只认 `supportsVision === true`：MULTIMODAL 这个 model_type 在本项目里也被
   * 用于视频/图像生成类模型（生产实测有 `grok-imagine-video` 挂在 MULTIMODAL 下），
   * 光看 model_type 会把不能读图的模型当成 vision 模型用。
   */
  private async resolveVisionModel(): Promise<string | null> {
    try {
      const def = await this.engineFacade.getDefaultModelByType(
        AIModelType.MULTIMODAL,
      );
      if (!def?.modelId) return null;
      const cfg = await this.engineFacade.getFullModelConfig(def.modelId);
      return cfg?.supportsVision ? def.modelId : null;
    } catch (err) {
      this.logger.warn(
        `[figureGate] vision 模型解析失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  // ─── Stage B（沿用 v17 实现，仅改为内部方法）──────────────────────

  /** 主题相关性：优先一次 LLM batch 判 caption，失败回落 embedding */
  private async filterByTopicRelevance(
    figures: ExtractedFigure[],
    topicTitle: string,
  ): Promise<ExtractedFigure[]> {
    try {
      const llmResult = await this.filterByLLMBatch(figures, topicTitle);
      if (llmResult) return llmResult;
    } catch (err) {
      this.logger.warn(
        `[figureGate] Stage B LLM batch failed, falling back to embedding: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // topicTitle embedding：懒计算 Promise 缓存，整个调用只算一次
    let topicEmbeddingPromise: Promise<number[] | null> | null = null;
    const getTopicEmbedding = (): Promise<number[] | null> => {
      if (topicEmbeddingPromise === null) {
        topicEmbeddingPromise = this.engineFacade
          .embeddingGenerate(topicTitle)
          .then((r) => r?.embedding ?? null)
          .catch(() => null);
      }
      return topicEmbeddingPromise;
    };

    const evalResults = await Promise.all(
      figures.map(async (fig, idx) => {
        try {
          const accepted = await this.evaluateSingleByEmbedding(
            fig,
            getTopicEmbedding,
          );
          return { fig, accepted };
        } catch (error) {
          // ★ v18 fail-closed：embedding 出错不再 type-based 放行。
          //   type 本身是 caption 关键词猜的，放行等于闸门失效。
          this.logger.warn(
            `[figureGate] [${idx}] ${fig.imageUrl.substring(0, 60)}... ` +
              `embedding failed, rejected (fail-closed): ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
          return { fig, accepted: false };
        }
      }),
    );

    return evalResults.filter((r) => r.accepted).map((r) => r.fig);
  }

  /**
   * 单张图片 Embedding 主题相关性评估
   *
   * ① chart/table/diagram → 跳过主题判定（Stage C 信息量闸仍然会拦）
   * ② photo, caption < 10 chars → 拒绝（Stage A 已拦，这里是二次防御）
   * ③ photo, valid caption → cosine(caption, topicTitle) >= 阈值 → 保留
   * ④ Embedding 拿不到向量 → 拒绝（fail-closed）
   */
  private async evaluateSingleByEmbedding(
    fig: ExtractedFigure,
    getTopicEmbedding: () => Promise<number[] | null>,
  ): Promise<boolean> {
    if (INFORMATIONAL_FIGURE_TYPES.has(fig.type)) {
      return true;
    }

    const caption = captionOf(fig);
    if (caption.length < MIN_CAPTION_LENGTH) {
      return false;
    }

    const [topicEmb, captionResult] = await Promise.all([
      getTopicEmbedding(),
      this.engineFacade.embeddingGenerate(caption.substring(0, 300)),
    ]);

    const captionEmb = captionResult?.embedding;
    if (!topicEmb?.length || !captionEmb?.length) {
      // ★ v18: 原 v17 在这里做"廉价 lexical fallback"放行（只要 caption 有 2 个
      //   实词就通过）。实证下这条 fallback 让任何带一句话说明的人物照都能过闸。
      //   改为拒绝 —— Stage C 的 Vision 才是判"有没有信息量"的正确手段，
      //   embedding 端点挂掉时不应该用一条更弱的规则顶上。
      this.logger.warn(
        `[figureGate] Embedding unavailable, rejected (fail-closed): ${fig.imageUrl.substring(0, 80)}`,
      );
      return false;
    }

    const similarity = cosine(topicEmb, captionEmb);
    const accepted = similarity >= STAGE2_COSINE_THRESHOLD;
    if (!accepted) {
      this.logger.debug(
        `[figureGate] Rejected (cosine=${similarity.toFixed(3)} < ${STAGE2_COSINE_THRESHOLD}): ` +
          `caption="${caption.substring(0, 60)}" | ${fig.imageUrl.substring(0, 60)}`,
      );
    }
    return accepted;
  }

  /**
   * LLM 批量判 caption 主题相关性 —— 单次调用判全部 photo。
   *
   * ① chart/table/diagram → 跳过（Stage C 仍会拦）
   * ② photo, caption < 10 chars → 拒绝
   * ③ 剩余 photo 列出 caption，让 LLM 一次性返回 acceptedIndices
   *
   * 失败时返回 null，调用方走 embedding 路径兜底。
   */
  private async filterByLLMBatch(
    figures: ExtractedFigure[],
    topicTitle: string,
  ): Promise<ExtractedFigure[] | null> {
    const accepted: ExtractedFigure[] = [];
    const photoCandidates: { idx: number; fig: ExtractedFigure }[] = [];

    figures.forEach((fig, idx) => {
      if (INFORMATIONAL_FIGURE_TYPES.has(fig.type)) {
        accepted.push(fig);
        return;
      }
      if (fig.type === "photo") {
        if (captionOf(fig).length < MIN_CAPTION_LENGTH) return; // 拒
        photoCandidates.push({ idx, fig });
      }
    });

    if (photoCandidates.length === 0) return accepted;

    const captionsList = photoCandidates
      .map((c, i) => `${i}. ${captionOf(c.fig).substring(0, 200)}`)
      .join("\n");

    const userPrompt = [
      `研究主题：${topicTitle}`,
      "",
      "下列是候选图片的 caption 列表（编号 0 起）。请判断哪些图片与研究主题相关、值得保留：",
      "",
      captionsList,
      "",
      '返回 JSON：{ acceptedIndices: <number[]> }，仅列出"应保留"图片的编号；',
      "标准：caption 内容直接或间接支撑主题论证。装饰图、广告图、无关 stock 图都拒绝。",
    ].join("\n");

    try {
      const result = await this.engineFacade.chatStructured<{
        acceptedIndices: number[];
      }>({
        systemPrompt:
          "你是图文相关性审查助手，按主题相关度过滤图片，输出严格 JSON。",
        messages: [{ role: "user", content: userPrompt }],
        schema: {
          type: "object",
          properties: {
            acceptedIndices: { type: "array", items: { type: "number" } },
          },
          required: ["acceptedIndices"],
        },
        taskProfile: { creativity: "deterministic", outputLength: "short" },
        throwOnParseError: false,
        maxRetries: 1,
        // ★ 2026-06-11 护栏误杀修复（见 filterByVision 同款注释）
        trustedInternal: true,
      });

      // ★ 2026-05-13: LLM 幻觉可能返回越界 index，必须叠加 0 <= n < length 边界检查
      const candidatesLen = photoCandidates.length;
      const indices = new Set<number>(
        Array.isArray(result.data?.acceptedIndices)
          ? result.data.acceptedIndices.filter(
              (n: unknown): n is number =>
                typeof n === "number" &&
                Number.isInteger(n) &&
                n >= 0 &&
                n < candidatesLen,
            )
          : [],
      );

      photoCandidates.forEach((c, i) => {
        if (indices.has(i)) accepted.push(c.fig);
      });

      this.logger.log(
        `[figureGate] Stage B LLM: caption 相关 ${indices.size}/${photoCandidates.length} for "${topicTitle}"`,
      );
      return accepted;
    } catch (err) {
      this.logger.warn(
        `[figureGate] Stage B LLM batch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null; // 让调用方 fallback
    }
  }
}
