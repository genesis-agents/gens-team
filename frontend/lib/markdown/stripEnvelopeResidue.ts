/**
 * stripEnvelopeResidue.ts — 2026-08-09
 *
 * 剥离 LLM finalize envelope 漏进正文的结构化残片。
 *
 * 用户实证（RSI 深度调研报告 PDF）：正文里原样出现三种"脚本"
 *   p.33  `{ "figureReferences": [{"figureId": "FIG-1", "anchorParagraph": 2, ... }`
 *   p.82  裸写的 `FIG-1`
 *   p.67  未解析的图占位 `![DeepSeek made AI cheap…](#fig-dim-8-8 "…")`
 *
 * 治本在后端 sanitizer（ai-engine/content/markdown/markdown-sanitizer.util.ts
 * 的 output-envelope-json-stripped / bare-figure-token-stripped /
 * unresolved-fig-placeholder-stripped 三条规则，v1.2.0 起生效）；
 * 本文件是**渲染期兜底**，让规则上线前已经落库的存量报告重新导出也干净。
 * 两侧算法保持一致 —— 与 segmentParagraphs.ts 的前后端同款实现同一模式。
 *
 * 注意与后端的一处差异：后端跑在 injectFigurePlaceholders **之前**，此刻任何
 * `![](#fig-)` 都是非法的；前端跑在注入**之后**，合法占位符必须保留。所以这里
 * 只剥"解析不到对应图"的占位符，由调用方传入已知 figure id 集合。
 */

/** finalize envelope 契约字段名（与后端 OUTPUT_ENVELOPE_KEYS 对齐） */
const ENVELOPE_KEYS =
  /"(figureReferences|figureId|anchorParagraph|citationsUsed|wordCount|thinking|action|kind|finalize)"\s*:/;

const MAX_ENVELOPE_BLOCK_LINES = 20;

/**
 * 剥离正文里的 finalize envelope JSON。与后端 stripOutputEnvelopeJson 同款算法，
 * 覆盖两种实证形态：```json 围栏块（生产数据的实际形态）与不闭合裸块。
 */
function stripEnvelopeJson(md: string): string {
  if (!md.includes('{')) return md;
  const lines = md.split('\n');
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
        const firstNonEmpty = inner.find((l) => l.trim() !== '')?.trim() ?? '';
        const isEnvelope =
          firstNonEmpty.startsWith('{') &&
          inner.some((l) => ENVELOPE_KEYS.test(l));
        if (isEnvelope) {
          i = close;
          continue;
        }
        for (let j = i; j <= close; j++) out.push(lines[j]);
        i = close;
        continue;
      }
      out.push(line);
      continue;
    }

    // ── 形态 b：不闭合裸块 ──
    if (line.trim() !== '{') {
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
      if (ENVELOPE_KEYS.test(cur)) hasEnvelopeKey = true;
      if (/^\s*\}[,;]?\s*$/.test(cur)) {
        end = j;
        break;
      }
      // 遇到标题说明已越过块边界，放弃（不吃正文）
      if (/^\s*#{1,6}\s/.test(cur)) break;
    }
    if (hasEnvelopeKey && end > i) {
      i = end;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * 剥离正文里的 envelope 残片。
 *
 * @param md            报告 markdown（已注入合法图占位符）
 * @param knownFigureIds 当前 artifact 里真实存在的 figure id（如 `fig-dim-8-8`）。
 *                       不在其中的 `![](#fig-xxx)` 视为残片剥掉 —— 它们渲染出来
 *                       只会是一行原始 markdown 文本或一个"图占位未找到"警告框。
 */
export function stripEnvelopeResidue(
  md: string,
  knownFigureIds: ReadonlySet<string> = new Set()
): string {
  if (typeof md !== 'string' || md.length === 0) return md;

  let result = stripEnvelopeJson(md);

  // 裸写的图编号 token（孤立出现，不是自然语言引述的一部分）
  result = result.replace(
    /(^|[\s(（])FIG-\d+(?=$|[\s)）,，。;；:：])/gim,
    (_m, lead: string) => lead ?? ''
  );

  // 图占位符：指向不存在的 figure → 剥掉；存在 → 保留，但必须去掉 `$`。
  //
  // ★ 生产 artifact 51b6b494 实证：占位符的 alt/title 里带 `$`（caption
  //   "Now it is raising $8bn and buying robots"）时，remark-math 把 `$…$`
  //   之间整段（含 `](#fig-…"`）当行内公式吞掉，图片语法当场散架，
  //   渲染出来就是一行原始 `![...](...)` 文本。该 artifact 19 个占位符里
  //   只有这 1 个含 `$`，也正好只有它破损。
  //   后端注入侧已治本（safeAlt/safeCaption 去 `$`），这里治存量。
  result = result.replace(
    /!\[[^\]]*\]\(\s*(#fig-[^\s)"']+)[^)]*\)/gi,
    (match, href: string) =>
      knownFigureIds.has(href.slice(1)) ? match.replace(/\$/g, '') : ''
  );

  // 剥完可能留下多余空行
  return result.replace(/\n{3,}/g, '\n\n');
}
