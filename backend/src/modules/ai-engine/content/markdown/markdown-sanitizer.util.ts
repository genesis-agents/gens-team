/**
 * MarkdownSanitizer 实现
 *
 * 上游：docs/architecture/ai-harness/evaluation/report-assembly-invariant-redesign.md v1.4 §4.1
 *
 * 设计要点（与 v1.4 文档保持严格一致）：
 *   1. fence 状态机扫描（非全文奇偶计数）— 嵌套 ` ```markdown\n```py\n```\n``` ` 也能正确处理
 *   2. 顶级 H1/H2 精确剥离 — 仅剥离 knownDimNames[i] 匹配的首行 H2
 *   3. 嵌入 [[toc]] / [TOC] 标记移除（backend 自己生成目录）
 *   4. 引用块内 fence 修复 ` > ```...` → 提到引用外
 *   5. trailing 空白 / 重复换行规整
 *   6. CRLF → LF 归一化
 *   7. BOM 清除
 *   8. <thinking>...</thinking> 整块剥离（cross-model fallback 防泄露）
 *   9. instruction-injection-redacted（F18 — `Ignore previous instructions` 等 → `[indirect prompt redacted]`）
 *  10. HTML 注释 `<!-- ... -->` 移除（防 assembler H2 误识）
 *
 * ReDoS / DoS 防御：
 *   - 入口 input.length > maxInputBytes throw
 *   - regex 用非回溯写法
 *   - 长循环每 1000 行检 abortSignal.aborted
 *
 * stateless：所有状态局部于函数栈，便于 Promise.all 并发。
 */

import {
  MARKDOWN_SANITIZER_VERSION,
  InputTooLargeError,
  SanitizerAbortedError,
  type SanitizeOptions,
  type SanitizeResult,
  type SanitizeRule,
  type SanitizeRuleApplied,
} from "./markdown-sanitizer.types";
import { segmentRunOnParagraphs } from "./paragraph-segmenter.util";

// Re-export for facade consumers convenience（与 .types.ts 同一常量，单一源）
export { MARKDOWN_SANITIZER_VERSION } from "./markdown-sanitizer.types";

const DEFAULT_MAX_INPUT_BYTES = 2_000_000;

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all )?(?:previous|prior|above) (?:instructions|directives|prompts)/gi,
  /disregard (?:all )?(?:previous|prior|above) (?:instructions|directives)/gi,
  /<\|(?:im_start|im_end|system|assistant|user)\|>/gi,
  /\[\[?\s*system\s*\]\]?\s*:?\s*/gi,
];

const FENCE_RE = /^(\s{0,3})(```|~~~)([^\r\n]*)$/;
const H2_RE = /^##\s+(.+?)\s*$/;
const H1_RE = /^#\s+(.+?)\s*$/;
const TOC_RE = /^\s*\[\[?\s*toc\s*\]\]?\s*$/i;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const THINKING_RE = /<thinking>[\s\S]*?<\/thinking>/gi;
const BLOCKQUOTE_FENCE_RE = /^\s*>\s*(```|~~~)([^\r\n]*)$/;

/**
 * 主入口
 */
export function sanitizeMarkdownBody(
  raw: string,
  opts: SanitizeOptions = {},
): SanitizeResult {
  const maxBytes = opts.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const inputBytes = Buffer.byteLength(raw, "utf-8");
  if (inputBytes > maxBytes) {
    throw new InputTooLargeError(inputBytes, maxBytes);
  }

  const appliedCount = new Map<SanitizeRule, number>();
  const inc = (rule: SanitizeRule): void => {
    appliedCount.set(rule, (appliedCount.get(rule) ?? 0) + 1);
  };

  let body = raw;

  // 1. BOM 剥除（开头）
  if (body.charCodeAt(0) === 0xfeff) {
    body = body.slice(1);
    inc("bom-stripped");
  }

  // 2. CRLF → LF
  if (body.includes("\r")) {
    const before = body.length;
    body = body.replace(/\r\n?/g, "\n");
    if (body.length !== before) inc("crlf-newline-normalized");
  }

  // 3. <thinking>...</thinking> 整块剥离
  body = body.replace(THINKING_RE, () => {
    inc("thinking-signature-stripped");
    return "";
  });

  // 4. HTML 注释剥除
  body = body.replace(HTML_COMMENT_RE, () => {
    inc("html-comment-stripped");
    return "";
  });

  // 5. prompt injection redaction
  for (const pat of PROMPT_INJECTION_PATTERNS) {
    body = body.replace(pat, () => {
      inc("instruction-injection-redacted");
      return "[indirect prompt redacted]";
    });
  }

  // ★ 2026-05-08 PR-6 (mission 843f6958 实证修, 4/4 Round 2 第 4 路指出 PR-4 装错管线):
  //   主路径 (StructuralReportAssembler → sanitizeMarkdownBody) 历史 0 figure
  //   规则，LLM 写出 4 类图引用垃圾（inline-fig URL / <figureReferences> 标签 /
  //   <figure> 标签 / prompt 提示语当 url）全透传到 fullMarkdown。这里加 3 条
  //   主路径规则，与 ai-engine/content/report-template 的 removeHallucinatedImages
  //   规则等价，但移到主路径生效（feedback_no_dual_sources：单源治理）。
  //
  //   注意：保留合法 `![](#fig-N)` 占位（reportAssembler.injectFigurePlaceholders
  //   注入），因此 inline-fig 规则只剥 `![FIG-N](xxx)` 形式（chapter-writer 严令
  //   禁止此格式，唯一图引用路径是 finalize.figureReferences 结构化字段）。
  body = body.replace(/!\[FIG-\d+[^\]]*\]\([^)]+\)/gi, () => {
    inc("inline-fig-image-stripped");
    return "";
  });
  body = body.replace(
    /<figureReferences?>[\s\S]*?<\/figureReferences?>/gi,
    () => {
      inc("figure-references-tag-stripped");
      return "";
    },
  );
  // 单边孤立 <figureReferences> / </figureReferences>（无配对）
  body = body.replace(/<\/?figureReferences?>/gi, () => {
    inc("figure-references-tag-stripped");
    return "";
  });
  body = body.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, () => {
    inc("figure-tag-stripped");
    return "";
  });
  body = body.replace(/<\/?figure[^>]*>/gi, () => {
    inc("figure-tag-stripped");
    return "";
  });

  // ★ 2026-08-09 (用户实证 RSI 报告正文里出现"脚本")：
  //   PR-6 那三条规则漏掉了 envelope 泄漏的实际形态。
  //
  //   5.1 finalize envelope 的 JSON 被当正文写出来。生产 artifact 51b6b494 实测有
  //       **两种**形态，两种都要治：
  //         a) 裸块（不闭合残片，LLM 写到一半被 body 截断）
  //         b) ```json 围栏块 —— 生产数据里就是这种。第一版规则 fence-aware 地
  //            跳过了围栏，等于对真实形态完全失效。
  body = stripOutputEnvelopeJson(body, inc);

  //   5.2 正文里裸写的图编号 token（`FIG-1` 单独成行或夹在句中）。
  //       只剥独立 token，不动 "FIG-1 所示" 这类被引号包住的正常引述之外的情况——
  //       实测 LLM 的泄漏形态就是孤立 token，正文引述图片一律用自然语言。
  body = body.replace(
    /(^|[\s(（])FIG-\d+(?=$|[\s)）,，。;；:：])/gim,
    (_m, lead) => {
      inc("bare-figure-token-stripped");
      return typeof lead === "string" ? lead : "";
    },
  );

  //   5.3 未解析的图占位符 `![alt](#fig-xxx)` —— **仅在注入前的管线开启**。
  //       structural assembler 对每段 raw LLM body 调用 sanitizer，此刻 body 里
  //       不可能存在合法占位符，出现即 LLM 照抄 prompt 反面示例，必须剥掉，
  //       否则会原样渲染成一行 markdown 文本（用户实证 RSI 报告 p.67）。
  //       注入后再 sanitize 的管线不得开启，否则会把真图全删掉。
  if (opts.stripFigurePlaceholders) {
    body = body.replace(/!\[[^\]]*\]\(\s*#fig-[^)]*\)/gi, () => {
      inc("unresolved-fig-placeholder-stripped");
      return "";
    });
  }

  // 6. 状态机扫描 — fence 配对 + 顶级 heading 处理 + blockquote fence 修复 + TOC 移除
  body = scanLines(body, opts, inc);

  // 6.5 run-on 散文段切分（2026-06-15）：把「超长、句末相接、无段落空行」的纯散文
  //     按句切成自然段，与其他正常分段章节观感一致。fence/列表/表格/标题/图占位/数学块
  //     已在 segmenter 内保护跳过。放在 \n{3,} 折叠前，让切分产生的空行由步骤 7 规整。
  body = segmentRunOnParagraphs(body, () => inc("paragraph-segmented"));

  // 7. 折叠 ≥3 个 \n 为 \n\n（trailing 空白规整）
  body = body.replace(/\n{3,}/g, "\n\n").replace(/^[ \t]+\n/gm, "\n");

  if (opts.abortSignal?.aborted) throw new SanitizerAbortedError();

  const appliedRules: SanitizeRuleApplied[] = [];
  for (const [rule, count] of appliedCount) {
    appliedRules.push({
      rule,
      count,
      severity: severityOf(rule),
      segmentName: opts.segmentName,
    });
  }

  return {
    body,
    appliedRules,
    sanitizerVersion: MARKDOWN_SANITIZER_VERSION,
  };
}

/**
 * v1.7 (代码审 / 测试三轮反馈): 仅当 fence info string（lang）属于
 * "孤儿 fence 高发"语言时，才触发 fence 内 H2 就近补关。
 *
 * 真实场景：mission `eafceb32` 是 mermaid 漏关；其他可能漏关的是
 * 无 lang 标记的纯 ```...```。编程语言（python/bash/js/ts/...）的
 * 代码块内合法存在 `## comment`（如教 markdown 语法），不应被误判。
 */
const ORPHAN_FENCE_LANGS = new Set([
  "", // 无 lang 标记的裸 fence（最易孤儿）
  "mermaid",
  "mmd",
  "graph",
  "flowchart",
  "sequencediagram",
  "classdiagram",
  "statediagram",
  "erdiagram",
  "gantt",
  "journey",
  "pie",
]);

function scanLines(
  body: string,
  opts: SanitizeOptions,
  inc: (rule: SanitizeRule) => void,
): string {
  const lines = body.split("\n");
  const out: string[] = [];
  /** fence stack：每条记录 fence 类型 + lang，多条表示嵌套 */
  const fenceStack: { type: string; lang: string; line: number }[] = [];
  const knownDims = new Set(opts.knownDimNames ?? []);
  /** 是否已经处理首行 H2 剥离（仅首行允许剥） */
  let firstNonEmpty = true;

  for (let i = 0; i < lines.length; i++) {
    if (i % 1000 === 999 && opts.abortSignal?.aborted) {
      throw new SanitizerAbortedError();
    }

    const line = lines[i];

    // blockquote 内 fence → 提到引用外（修复后跳过普通 fence 处理这一行）
    const bqFence = BLOCKQUOTE_FENCE_RE.exec(line);
    if (bqFence) {
      out.push(bqFence[1] + bqFence[2]);
      const fenceType = bqFence[1];
      const top = fenceStack[fenceStack.length - 1];
      if (top && top.type === fenceType) fenceStack.pop();
      else fenceStack.push({ type: fenceType, lang: "", line: i });
      inc("blockquote-fence-fixed");
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const fenceType = fence[2];
      const fenceLang = (fence[3] ?? "").trim().toLowerCase();
      const top = fenceStack[fenceStack.length - 1];
      if (top && top.type === fenceType) {
        fenceStack.pop();
      } else {
        fenceStack.push({ type: fenceType, lang: fenceLang, line: i });
      }
      out.push(line);
      continue;
    }

    // 仍在 fence 内 → 检查是否遇到看起来像 H2 的行（孤儿 fence 治理）
    //
    // ★ v1.6 + v1.7 启发式精确化：
    // sanitizer 原行为是只在 EOF 补关 fence，但若 fence 漏关后下游内容含
    // 多个 ## H2，按 EOF 补关会让所有 H2 都仍在 fence 内（前端渲染为代码块）。
    // 真正的修复是在 fence 内遇到 H2 就近补关，让该 H2 作为 fence 外的真章节。
    //
    // v1.7：仅当 fence lang ∈ ORPHAN_FENCE_LANGS（mermaid / 无 lang）时
    // 才触发，避免 python/bash 代码块内合法的 `## comment` 被误关。
    if (fenceStack.length > 0) {
      const looksLikeH2 = /^##\s/.test(line) && !/^###/.test(line);
      const top = fenceStack[fenceStack.length - 1];
      const langOrphanProne = ORPHAN_FENCE_LANGS.has(top.lang);
      if (looksLikeH2 && langOrphanProne) {
        // 在 H2 前补关所有未关 fence（最常见情况是 1 个，即 mermaid 的 ```）
        while (fenceStack.length > 0) {
          const f = fenceStack.pop()!;
          out.push(f.type);
          inc("unclosed-fence-appended");
        }
        // 然后正常处理这个 H2（落到下面的"在 fence 外"分支）
      } else {
        // 普通 fence 内行（代码块内容）→ 保留原样
        out.push(line);
        continue;
      }
    }

    // 嵌入 TOC 标记移除
    if (TOC_RE.test(line)) {
      inc("embedded-toc-removed");
      continue;
    }

    // 顶级 heading 处理（仅在 fence 外）
    if (!opts.allowTopLevelHeadings) {
      const h2 = H2_RE.exec(line);
      if (h2) {
        const title = h2[1].trim();
        // 仅当首行 H2 且匹配 knownDimNames，剥离
        if (firstNonEmpty && knownDims.has(title)) {
          inc("top-level-heading-stripped");
          firstNonEmpty = false;
          continue;
        }
        // 其他 H2 保留（dim 内合法 H2 子章节）
      }
      const h1 = H1_RE.exec(line);
      if (h1) {
        // F2: body 开头 # 大标题 → 降为 ### 大标题（保留语义但避免顶级冲突）
        // F17: 标题跳跃 — 不主动补中间 H2，由前端目录组件容忍
        out.push(`### ${h1[1].trim()}`);
        inc("top-level-heading-stripped");
        if (firstNonEmpty) firstNonEmpty = false;
        continue;
      }
    }

    if (firstNonEmpty && line.trim() !== "") firstNonEmpty = false;
    out.push(line);
  }

  // 收尾：fence stack 残留 → 在 EOF 前补关
  while (fenceStack.length > 0) {
    const f = fenceStack.pop()!;
    out.push(f.type);
    inc("unclosed-fence-appended");
  }

  return out.join("\n");
}

/**
 * finalize envelope 的字段名 —— 正文里出现「以 `{` 开头且含这些 key」的块，
 * 一律判定为 LLM 把结构化输出写进了正文。
 *
 * 只列 envelope 契约字段，不做通用 JSON 检测：报告正文里出现代码块形式的
 * JSON 示例是**合法内容**（如讲 API schema 的章节），不能一刀切剥掉。
 */
const OUTPUT_ENVELOPE_KEYS =
  /"(figureReferences|figureId|anchorParagraph|citationsUsed|wordCount|thinking|action|kind|finalize)"\s*:/;

/** 单个 envelope 块的最大扫描行数（防止吃掉正常正文） */
const MAX_ENVELOPE_BLOCK_LINES = 20;

/**
 * 剥离正文里的 finalize envelope JSON。
 *
 * 两种实证形态（生产 artifact 51b6b494）：
 *
 *   a) ```json 围栏块 —— 生产数据里实际就是这种：
 *        ```json
 *        {
 *          "figureReferences": [{"figureId": "FIG-1", "anchorParagraph": 2, ...}]
 *        }
 *        ```
 *   b) 裸块（不闭合残片，LLM 写到一半被 body 截断）：
 *        {
 *          "figureReferences": [{"figureId": "FIG-1", "anchorParagraph": 2, "caption": "
 *                   某段中文
 *        }
 *      所以不能用配对花括号匹配，必须按行扫。
 *
 * 判定条件（两条都要满足才剥，避免误伤讲 API schema 的合法章节）：
 *   · 块首个非空行是 `{`
 *   · 块内出现 envelope 契约字段名
 * 普通 JSON 代码块（`{"name": "demo"}`）不含这些 key，一律保留。
 */
function stripOutputEnvelopeJson(
  body: string,
  inc: (rule: SanitizeRule) => void,
): string {
  if (!body.includes("{")) return body;
  const lines = body.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── 形态 a：围栏块 ──
    const fenceOpen = /^\s*(```|~~~)\s*(\w*)\s*$/.exec(line);
    if (fenceOpen) {
      const marker = fenceOpen[1];
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (new RegExp(`^\\s*${marker}\\s*$`).test(lines[j])) {
          close = j;
          break;
        }
      }
      if (close > i) {
        const inner = lines.slice(i + 1, close);
        const firstNonEmpty = inner.find((l) => l.trim() !== "")?.trim() ?? "";
        const isEnvelope =
          firstNonEmpty.startsWith("{") &&
          inner.some((l) => OUTPUT_ENVELOPE_KEYS.test(l));
        if (isEnvelope) {
          inc("output-envelope-json-stripped");
          i = close; // 连同围栏一起跳过
          continue;
        }
        // 非 envelope 围栏：原样透传整块，且不让内部内容进入形态 b 的扫描
        for (let j = i; j <= close; j++) out.push(lines[j]);
        i = close;
        continue;
      }
      // 没有配对收尾 → 交给后续 scanLines 的 fence 状态机处理
      out.push(line);
      continue;
    }

    // ── 形态 b：裸块 ──
    if (line.trim() !== "{") {
      out.push(line);
      continue;
    }
    let end = -1;
    let hasEnvelopeKey = false;
    for (
      let j = i + 1;
      j < Math.min(lines.length, i + MAX_ENVELOPE_BLOCK_LINES);
      j++
    ) {
      const cur = lines[j];
      if (OUTPUT_ENVELOPE_KEYS.test(cur)) hasEnvelopeKey = true;
      if (/^\s*\}[,;]?\s*$/.test(cur)) {
        end = j;
        break;
      }
      // 遇到标题说明已经越过块边界，放弃（不吃正文）
      if (/^\s*#{1,6}\s/.test(cur)) break;
    }
    if (hasEnvelopeKey && end > i) {
      inc("output-envelope-json-stripped");
      i = end; // 整块跳过（含收尾 `}` 行）
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function severityOf(rule: SanitizeRule): "low" | "medium" | "high" {
  switch (rule) {
    case "unclosed-fence-appended":
      return "high"; // 影响整个文档结构
    case "instruction-injection-redacted":
      return "high"; // 安全相关
    case "thinking-signature-stripped":
      return "medium";
    case "top-level-heading-stripped":
    case "blockquote-fence-fixed":
      return "medium";
    case "embedded-toc-removed":
    case "html-comment-stripped":
    case "crlf-newline-normalized":
    case "bom-stripped":
      return "low";
    case "inline-fig-image-stripped":
    case "figure-references-tag-stripped":
    case "figure-tag-stripped":
    case "bare-figure-token-stripped":
    case "unresolved-fig-placeholder-stripped":
      return "medium"; // LLM 写错图引用契约，应被 chapter-writer prompt + reviewer 拦
    case "output-envelope-json-stripped":
      return "high"; // 结构化输出漏进正文 —— 用户直接看到"报告里有段脚本"
    case "paragraph-segmented":
      return "low"; // 纯排版规整，无内容/安全影响
  }
}
