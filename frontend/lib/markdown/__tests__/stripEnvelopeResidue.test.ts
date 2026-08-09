/**
 * stripEnvelopeResidue.test.ts — 2026-08-09
 *
 * 覆盖用户实证 RSI 报告 PDF 里出现的三种 envelope 残片。
 * 后端 sanitizer v1.2.0 治本，本 util 是渲染期兜底（治存量报告重新导出）。
 */

import { stripEnvelopeResidue } from '../stripEnvelopeResidue';

describe('stripEnvelopeResidue', () => {
  it('剥不闭合的 finalize envelope JSON 残片（RSI 报告 p.33 实证形态）', () => {
    const md = [
      '上一段正文。',
      '',
      '{',
      '  "figureReferences": [{"figureId": "FIG-1", "anchorParagraph": 2, "caption": "',
      '             人工智能',
      '}',
      '',
      '下一段正文。',
    ].join('\n');
    const out = stripEnvelopeResidue(md);
    expect(out).not.toContain('figureReferences');
    expect(out).toContain('上一段正文。');
    expect(out).toContain('下一段正文。');
  });

  // ★ 生产 artifact 51b6b494 实测形态：envelope 被写进 ```json 围栏
  it('剥 ```json 围栏里的 envelope 块（生产实测形态）', () => {
    const md = [
      '上一段正文。',
      '',
      '```json',
      '{',
      '  "figureReferences": [{"figureId": "FIG-1", "anchorParagraph": 2}]',
      '}',
      '```',
      '',
      '### 下一节',
    ].join('\n');
    const out = stripEnvelopeResidue(md);
    expect(out).not.toContain('figureReferences');
    expect(out).not.toContain('```json');
    expect(out).toContain('### 下一节');
  });

  it('不动普通 JSON 代码块', () => {
    const md = ['```json', '{', '  "name": "demo"', '}', '```'].join('\n');
    expect(stripEnvelopeResidue(md)).toContain('"name"');
  });

  it('不动与 envelope 无关的普通裸 JSON 块', () => {
    const md = ['{', '  "name": "demo"', '}'].join('\n');
    expect(stripEnvelopeResidue(md)).toContain('"name"');
  });

  it('剥正文里裸写的 FIG-N（RSI 报告 p.82 实证）', () => {
    const md = 'Claude 家族能力演进见下图。\nFIG-1\n人工智能的发展。';
    expect(stripEnvelopeResidue(md)).not.toMatch(/FIG-\d/);
  });

  it('剥指向不存在 figure 的占位符（RSI 报告 p.67 实证）', () => {
    const md =
      '![DeepSeek made AI cheap](#fig-dim-8-8 "DeepSeek made AI cheap")\n正常段落。';
    const out = stripEnvelopeResidue(md, new Set(['fig-dim-1-0']));
    expect(out).not.toContain('#fig-dim-8-8');
    expect(out).toContain('正常段落。');
  });

  it('保留指向真实 figure 的占位符', () => {
    const md = '![真图](#fig-dim-1-0 "真图说明")\n正常段落。';
    const out = stripEnvelopeResidue(md, new Set(['fig-dim-1-0']));
    expect(out).toContain('#fig-dim-1-0');
  });

  // ★ 生产 artifact 51b6b494 实证：19 个占位符里只有这 1 个含 `$`，
  //   也正好只有它在 PDF 里渲染成了原始 markdown 文本。
  //   `$…$` 被 remark-math 当行内公式定界符，把 `](#fig-…"` 整段吞掉。
  it('去掉真占位符 alt/title 里的 $，防 remark-math 撑碎图片语法', () => {
    const md =
      '![DeepSeek made AI cheap. Now it is raising $8bn and buying robots](#fig-dim-8-8 "DeepSeek made AI cheap. Now it is raising $8bn and buying robots")';
    const out = stripEnvelopeResidue(md, new Set(['fig-dim-8-8']));
    expect(out).toContain('#fig-dim-8-8');
    expect(out).not.toContain('$');
    expect(out).toContain('8bn');
  });

  it('空输入原样返回', () => {
    expect(stripEnvelopeResidue('')).toBe('');
  });
});
