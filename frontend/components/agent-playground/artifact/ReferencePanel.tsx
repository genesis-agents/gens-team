'use client';

import { ExternalLink } from 'lucide-react';
import type { ArtifactCitation } from '@/lib/features/agent-playground/report-artifact.types';

interface Props {
  citations: ArtifactCitation[];
  highlightedIndex?: number | null;
  onClickReverseHighlight?: (citation: ArtifactCitation) => void;
}

const SOURCE_TYPE_COLOR: Record<ArtifactCitation['sourceType'], string> = {
  gov: 'bg-blue-100 text-blue-700',
  academic: 'bg-purple-100 text-purple-700',
  industry: 'bg-emerald-100 text-emerald-700',
  news: 'bg-amber-100 text-amber-700',
  blog: 'bg-gray-100 text-gray-700',
  community: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-500',
};
const SOURCE_TYPE_LABEL: Record<ArtifactCitation['sourceType'], string> = {
  gov: '政府',
  academic: '学术',
  industry: '行业',
  news: '新闻',
  blog: '博客',
  community: '社区',
  other: '其他',
};

/**
 * 可信度分归一到 0-100。
 *
 * ★ 2026-08-09：历史报告里混有 0-1 量纲的条目（assembler 早期给图片补的
 * "合成引用" 写的是 0.5，而正常 citation 走 scoreCredibility 是 0-100）。
 * 直接渲染会显示成「可信度 0.5」并恒判为低可信。产线侧已删掉合成引用，
 * 这里做渲染期归一，让**存量报告重新导出**也能显示正确数值。
 */
function normalizeCredibility(score: number | null | undefined): number | null {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  if (score < 0) return null;
  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

/**
 * ReferencePanel —— 引用列表，支持反向溯源（baseline §8.3 [4]）。
 *
 * - hover/scroll 来源：从角标点击触发 scroll-into-view + 高亮 highlightedIndex
 * - click：触发 onClickReverseHighlight，调用方用 occurrences[] 高亮文中所有出现位置
 *
 * ★ 2026-08-09 导出排版修（用户实证：PDF 参考文献页右边距掉了一列孤立数字）：
 *   元信息行原本是 `flex flex-wrap` + 末项 `ml-auto`，且末项没有 shrink-0。
 *   A4 打印宽度下这一项被压到约 1 字符宽，「可信度 85」竖着一个字一行落到页边。
 *   现在：元信息行不再用 auto margin 撑开，每一项 whitespace-nowrap + shrink-0，
 *   整条目 break-inside-avoid 防止跨页撕裂。
 *   同时移除原本直接暴露给用户的内部 section id（`章: dim-8, dim-9`）。
 *
 * ★ 2026-08-09 二修（用户实证 Screenshot_81 导出 PDF）：
 *   1) 来源类型徽章「行业/学术/博客」在打印宽度下竖排成「行/业」——与可信度
 *      同一个病因（flex 子项没 shrink-0），CJK 任意两字之间都可断行使得
 *      min-content 宽度只有 1 个字，所以中文标签必然被压竖。
 *   2) `<ol>` 的自动序号与条目自带的 [N] 并排显示两份编号；且
 *      dropImageResourceCitations 摘掉假引用后 citations 编号会有空缺
 *      （1、3、4），ol 序号仍是 1、2、3 —— 两个数字对不上会误导。改 list-none，
 *      编号唯一来源是 c.index。
 *   3) 导出的 PDF 走 print 媒体（WysiwygRenderService 未调 emulateMediaType，
 *      puppeteer page.pdf 默认 print）。屏幕上的交互附属信息——彩色来源类型
 *      标签、引用次数、可信度、外链图标——属于应用 UI，不属于报告正文，
 *      打印时一律 print:hidden，条目退化成标准文献格式：
 *        [1] 标题. 域名 · 日期
 *      卡片边框/底色/圆角在打印时也去掉，标题不再 line-clamp 截断。
 */
export function ReferencePanel({
  citations,
  highlightedIndex,
  onClickReverseHighlight,
}: Props) {
  if (citations.length === 0) return null;
  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-gray-900">
        参考文献（{citations.length}）
      </h3>
      <ol className="list-none space-y-2 print:space-y-0">
        {citations.map((c) => (
          <li
            id={`ref-${c.index}`}
            key={c.index}
            className={`scroll-mt-4 break-inside-avoid rounded-md border p-2.5 transition-colors print:mb-1 print:rounded-none print:border-0 print:bg-transparent print:p-0 ${
              highlightedIndex === c.index
                ? 'border-violet-300 bg-violet-50'
                : 'border-gray-100 bg-gray-50/50'
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className="shrink-0 cursor-pointer whitespace-nowrap rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 hover:bg-violet-200 print:bg-transparent print:px-0 print:text-black"
                onClick={() => onClickReverseHighlight?.(c)}
                title={`点击高亮文中 ${c.occurrences.length} 处出现`}
              >
                [{c.index}]
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  {/* CJK 会被 flex 压成一字一行，必须 shrink-0 + nowrap；
                      打印时属于 UI 附属信息，不进文献条目 */}
                  <span
                    className={`shrink-0 whitespace-nowrap rounded px-1 py-0 text-[9px] font-medium print:hidden ${SOURCE_TYPE_COLOR[c.sourceType]}`}
                  >
                    {SOURCE_TYPE_LABEL[c.sourceType]}
                  </span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 min-w-0 flex-1 text-xs font-medium text-violet-700 hover:underline print:line-clamp-none print:text-black print:no-underline"
                  >
                    {c.title}
                    <ExternalLink className="ml-1 inline h-2.5 w-2.5 print:hidden" />
                  </a>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                  <span className="shrink-0 break-all">{c.domain}</span>
                  {c.publishedAt && (
                    <span className="shrink-0 whitespace-nowrap">
                      · {c.publishedAt.slice(0, 10)}
                    </span>
                  )}
                  {c.occurrences.length > 0 && (
                    <span className="shrink-0 whitespace-nowrap rounded bg-gray-100 px-1 py-0 text-[10px] text-gray-600 print:hidden">
                      文中 {c.occurrences.length} 处
                    </span>
                  )}
                  {(() => {
                    const credibility = normalizeCredibility(
                      c.credibilityScore
                    );
                    if (credibility === null) return null;
                    return (
                      <span
                        className={`shrink-0 whitespace-nowrap print:hidden ${
                          credibility >= 80
                            ? 'text-emerald-600'
                            : credibility >= 60
                              ? 'text-amber-600'
                              : 'text-gray-400'
                        }`}
                      >
                        可信度 {credibility}
                      </span>
                    );
                  })()}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
