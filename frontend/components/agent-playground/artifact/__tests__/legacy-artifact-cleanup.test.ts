/**
 * legacy-artifact-cleanup.test.ts — 2026-08-09
 *
 * 覆盖用户实证：RSI 报告参考文献 [125]-[128] 是图片 CDN 地址
 * （cdn.i-scmp.com / media.thenextweb.com / platform.theverge.com /
 * img.staticimg.com），由已删除的 synthetic citation 兜底路径产生。
 */

import type { ArtifactCitation } from '@/lib/features/agent-playground/report-artifact.types';
import { dropImageResourceCitations } from '../legacy-artifact-cleanup';

function makeCitation(
  overrides: Partial<ArtifactCitation> & { index: number }
): ArtifactCitation {
  return {
    uuid: `cite-${overrides.index}`,
    title: 'Some article title',
    url: 'https://example.com/article',
    domain: 'example.com',
    accessedAt: '2026-08-09T00:00:00.000Z',
    sourceType: 'industry',
    credibilityScore: 70,
    occurrences: [],
    ...overrides,
  } as ArtifactCitation;
}

describe('dropImageResourceCitations', () => {
  it('摘掉"URL 指向图片文件 + 正文从未引用"的假引用', () => {
    const citations = [
      makeCitation({
        index: 128,
        title: 'Tian Yuan Dong',
        url: 'https://img.staticimg.com/photo/tian.jpg',
        domain: 'img.staticimg.com',
        occurrences: [],
      }),
      makeCitation({
        index: 127,
        url: 'https://platform.theverge.com/wp-content/uploads/a.png',
        domain: 'platform.theverge.com',
        occurrences: [],
      }),
    ];
    expect(dropImageResourceCitations(citations)).toHaveLength(0);
  });

  it('保留正文真正引用过的条目，即使 URL 指向图片', () => {
    const citations = [
      makeCitation({
        index: 5,
        url: 'https://example.com/figure.png',
        occurrences: [
          { sectionId: 'dim-1', paragraphIndex: 0, characterOffset: 10 },
        ],
      }),
    ];
    expect(dropImageResourceCitations(citations)).toHaveLength(1);
  });

  it('保留正常文献（URL 不是图片资源）', () => {
    const citations = [
      makeCitation({
        index: 1,
        url: 'https://www.anthropic.com/institute/recursive-self-improvement',
        domain: 'anthropic.com',
        occurrences: [],
      }),
      makeCitation({
        index: 2,
        url: 'https://arxiv.org/abs/2607.07663',
        domain: 'arxiv.org',
        occurrences: [],
      }),
    ];
    expect(dropImageResourceCitations(citations)).toHaveLength(2);
  });

  it('不重排编号 —— 剩余条目的 index 保持原值（正文 [N] 角标必须对得上）', () => {
    const citations = [
      makeCitation({ index: 1, occurrences: [] }),
      makeCitation({
        index: 2,
        url: 'https://cdn.example.com/x.jpg',
        occurrences: [],
      }),
      makeCitation({ index: 3, occurrences: [] }),
    ];
    const kept = dropImageResourceCitations(citations);
    expect(kept.map((c) => c.index)).toEqual([1, 3]);
  });

  it('URL 带 query 时仍按路径扩展名判定', () => {
    const citations = [
      makeCitation({
        index: 9,
        url: 'https://cdn.i-scmp.com/sites/default/files/d8/images/x.jpg?itok=abc',
        occurrences: [],
      }),
    ];
    expect(dropImageResourceCitations(citations)).toHaveLength(0);
  });

  it('URL 解析失败时不误删', () => {
    const citations = [makeCitation({ index: 4, url: 'not-a-url' })];
    expect(dropImageResourceCitations(citations)).toHaveLength(1);
  });
});
