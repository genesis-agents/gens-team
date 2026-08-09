import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReferencePanel } from '../ReferencePanel';
import type { ArtifactCitation } from '@/lib/features/agent-playground/report-artifact.types';

function makeCitation(
  index: number,
  overrides: Partial<ArtifactCitation> = {}
): ArtifactCitation {
  return {
    index,
    uuid: `uuid-${index}`,
    title: `Article ${index}`,
    url: `https://example.com/article/${index}`,
    domain: 'example.com',
    sourceType: 'news',
    credibilityScore: 80,
    accessedAt: '2025-01-01',
    occurrences: [],
    ...overrides,
  };
}

describe('ReferencePanel', () => {
  it('renders null when citations is empty', () => {
    const { container } = render(<ReferencePanel citations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders heading with citation count', () => {
    render(<ReferencePanel citations={[makeCitation(1), makeCitation(2)]} />);
    expect(screen.getByText('参考文献（2）')).toBeInTheDocument();
  });

  it('renders each citation index badge', () => {
    render(<ReferencePanel citations={[makeCitation(1), makeCitation(2)]} />);
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });

  it('renders citation title as link', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { title: 'Test Article' })]}
      />
    );
    expect(screen.getByText('Test Article')).toBeInTheDocument();
  });

  it('citation link has correct href', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { url: 'https://reuters.com/test' })]}
      />
    );
    const link = screen.getByRole('link', { name: /Article 1/ });
    expect(link.getAttribute('href')).toBe('https://reuters.com/test');
  });

  it('renders domain', () => {
    render(
      <ReferencePanel citations={[makeCitation(1, { domain: 'bbc.com' })]} />
    );
    expect(screen.getByText('bbc.com')).toBeInTheDocument();
  });

  it('shows publishedAt date when present', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { publishedAt: '2025-06-14T00:00:00Z' })]}
      />
    );
    expect(screen.getByText('· 2025-06-14')).toBeInTheDocument();
  });

  it('does not show publishedAt when absent', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { publishedAt: undefined })]}
      />
    );
    expect(screen.queryByText(/· 20/)).not.toBeInTheDocument();
  });

  it('shows occurrences count badge', () => {
    const c = makeCitation(1, {
      occurrences: [
        { sectionId: 'sec-1', paragraphIndex: 0, characterOffset: 0 },
        { sectionId: 'sec-2', paragraphIndex: 1, characterOffset: 5 },
      ],
    });
    render(<ReferencePanel citations={[c]} />);
    expect(screen.getByText(/文中\s*2\s*处/)).toBeInTheDocument();
  });

  it('does not show occurrences badge when empty', () => {
    render(
      <ReferencePanel citations={[makeCitation(1, { occurrences: [] })]} />
    );
    expect(screen.queryByText(/处/)).not.toBeInTheDocument();
  });

  // ★ 2026-08-09 契约变更：不再把内部 section id 暴露给读者。
  //   原本渲染成「章: dim-8, dim-9」，用户在导出的 PDF 参考文献里直接看到内部 id。
  it('does not leak internal section ids to the reader', () => {
    const c = makeCitation(1, {
      occurrences: [
        { sectionId: 'sec-1', paragraphIndex: 0, characterOffset: 0 },
        { sectionId: 'sec-2', paragraphIndex: 0, characterOffset: 0 },
      ],
    });
    render(<ReferencePanel citations={[c]} />);
    expect(screen.queryByText(/章:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sec-1/)).not.toBeInTheDocument();
    // 引用次数仍然展示（对读者有意义的信息保留）
    expect(screen.getByText(/文中\s*2\s*处/)).toBeInTheDocument();
  });

  // ★ 2026-08-09: 存量报告里混有 0-1 量纲的 credibilityScore（已删除的合成引用
  //   写的是 0.5），渲染期归一后不再显示成「可信度 0.5」。
  it('normalizes 0-1 scale credibility score for legacy artifacts', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { credibilityScore: 0.5 })]}
      />
    );
    expect(screen.getByText('可信度 50')).toBeInTheDocument();
  });

  // ★ 2026-08-09 布局不变量（用户实证 Screenshot_81：导出 PDF 里来源类型徽章
  //   竖排成「行/业」「学/术」）。参考文献条目在 A4 打印宽度下会被 flex 压缩，
  //   而 CJK 任意两字之间都可断行 → min-content 宽度 = 1 个字 → 短标签竖排。
  //   jsdom 没有排版引擎，测不出视觉效果，只能把「不允许被压缩」钉在 class 上。
  //   这个缺陷已经犯过两次（先是可信度，再是来源类型徽章），值得钉住。
  describe('打印/窄栏布局不变量：短标签不得被 flex 压缩', () => {
    it.each([
      ['来源类型徽章', '行业'],
      ['引用编号角标', '[1]'],
      ['可信度', '可信度 65'],
      ['引用次数', '文中 2 处'],
    ])('%s 带 shrink-0', (_label, text) => {
      render(
        <ReferencePanel
          citations={[
            makeCitation(1, {
              sourceType: 'industry',
              credibilityScore: 65,
              occurrences: [
                { sectionId: 'sec-1', paragraphIndex: 0, characterOffset: 0 },
                { sectionId: 'sec-2', paragraphIndex: 1, characterOffset: 5 },
              ],
            }),
          ]}
        />
      );
      const el = screen.getByText(
        (_c, node) =>
          (node?.textContent ?? '').replace(/\s+/g, ' ').trim() === text &&
          node?.children.length === 0
      );
      expect(el.className).toContain('shrink-0');
    });
  });

  // ★ 2026-08-09：摘掉图片 CDN 假引用后 citations 编号会出现空缺（1、3、4），
  //   若 <ol> 还渲染自动序号（1、2、3）就会和 [N] 角标并排且不一致。
  it('不渲染 ol 自动序号，编号唯一来源是 [N]', () => {
    const { container } = render(
      <ReferencePanel citations={[makeCitation(1), makeCitation(3)]} />
    );
    expect(container.querySelector('ol')?.className).toContain('list-none');
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[3]')).toBeInTheDocument();
  });

  // ★ 2026-08-09：导出 PDF 走 print 媒体（WysiwygRenderService 未调
  //   emulateMediaType，puppeteer page.pdf 默认 print）。屏幕上的交互附属信息
  //   不属于报告正文，打印时必须退化成标准文献条目：[N] 标题. 域名 · 日期。
  describe('打印媒体：导出成文献格式而不是应用卡片', () => {
    it.each([
      ['来源类型标签', '行业'],
      ['引用次数', '文中 2 处'],
      ['可信度', '可信度 65'],
    ])('%s 在打印时隐藏', (_label, text) => {
      render(
        <ReferencePanel
          citations={[
            makeCitation(1, {
              sourceType: 'industry',
              credibilityScore: 65,
              occurrences: [
                { sectionId: 'sec-1', paragraphIndex: 0, characterOffset: 0 },
                { sectionId: 'sec-2', paragraphIndex: 1, characterOffset: 5 },
              ],
            }),
          ]}
        />
      );
      const el = screen.getByText(
        (_c, node) =>
          (node?.textContent ?? '').replace(/\s+/g, ' ').trim() === text &&
          node?.children.length === 0
      );
      expect(el.className).toContain('print:hidden');
    });

    it('条目在打印时去卡片化（无边框/底色/内边距）', () => {
      const { container } = render(
        <ReferencePanel citations={[makeCitation(1)]} />
      );
      const li = container.querySelector('li')!;
      expect(li.className).toContain('print:border-0');
      expect(li.className).toContain('print:bg-transparent');
    });

    it('标题在打印时不截断（line-clamp 会砍掉文献标题）', () => {
      render(<ReferencePanel citations={[makeCitation(1)]} />);
      expect(
        screen.getByRole('link', { name: /Article 1/ }).className
      ).toContain('print:line-clamp-none');
    });
  });

  it('shows credibility score', () => {
    render(
      <ReferencePanel citations={[makeCitation(1, { credibilityScore: 85 })]} />
    );
    expect(screen.getByText('可信度 85')).toBeInTheDocument();
  });

  it('high credibility (>=80) uses emerald color', () => {
    const { container } = render(
      <ReferencePanel citations={[makeCitation(1, { credibilityScore: 80 })]} />
    );
    const credEl = container.querySelector('.text-emerald-600');
    expect(credEl).toBeTruthy();
  });

  it('medium credibility (60-79) uses amber color', () => {
    const { container } = render(
      <ReferencePanel citations={[makeCitation(1, { credibilityScore: 65 })]} />
    );
    const credEl = container.querySelector('.text-amber-600');
    expect(credEl).toBeTruthy();
  });

  it('low credibility (<60) uses gray-400 color', () => {
    const { container } = render(
      <ReferencePanel citations={[makeCitation(1, { credibilityScore: 40 })]} />
    );
    const credEl = container.querySelector('.text-gray-400');
    expect(credEl).toBeTruthy();
  });

  it('renders source type label: news', () => {
    render(
      <ReferencePanel citations={[makeCitation(1, { sourceType: 'news' })]} />
    );
    expect(screen.getByText('新闻')).toBeInTheDocument();
  });

  it('renders source type label: academic', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { sourceType: 'academic' })]}
      />
    );
    expect(screen.getByText('学术')).toBeInTheDocument();
  });

  it('renders source type label: gov', () => {
    render(
      <ReferencePanel citations={[makeCitation(1, { sourceType: 'gov' })]} />
    );
    expect(screen.getByText('政府')).toBeInTheDocument();
  });

  it('renders source type label: industry', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { sourceType: 'industry' })]}
      />
    );
    expect(screen.getByText('行业')).toBeInTheDocument();
  });

  it('renders source type label: blog', () => {
    render(
      <ReferencePanel citations={[makeCitation(1, { sourceType: 'blog' })]} />
    );
    expect(screen.getByText('博客')).toBeInTheDocument();
  });

  it('renders source type label: community', () => {
    render(
      <ReferencePanel
        citations={[makeCitation(1, { sourceType: 'community' })]}
      />
    );
    expect(screen.getByText('社区')).toBeInTheDocument();
  });

  it('renders source type label: other', () => {
    render(
      <ReferencePanel citations={[makeCitation(1, { sourceType: 'other' })]} />
    );
    expect(screen.getByText('其他')).toBeInTheDocument();
  });

  it('highlighted citation shows violet styling', () => {
    const { container } = render(
      <ReferencePanel citations={[makeCitation(1)]} highlightedIndex={1} />
    );
    const li = container.querySelector('li#ref-1');
    expect(li?.className).toContain('border-violet-300');
    expect(li?.className).toContain('bg-violet-50');
  });

  it('non-highlighted citation uses default styling', () => {
    const { container } = render(
      <ReferencePanel citations={[makeCitation(1)]} highlightedIndex={2} />
    );
    const li = container.querySelector('li#ref-1');
    expect(li?.className).toContain('border-gray-100');
  });

  it('clicking citation index badge calls onClickReverseHighlight', () => {
    const handler = vi.fn();
    render(
      <ReferencePanel
        citations={[makeCitation(1)]}
        onClickReverseHighlight={handler}
      />
    );
    fireEvent.click(screen.getByText('[1]'));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ index: 1 }));
  });

  it('clicking citation index badge without handler does not throw', () => {
    render(<ReferencePanel citations={[makeCitation(1)]} />);
    expect(() => fireEvent.click(screen.getByText('[1]'))).not.toThrow();
  });

  it('limits displayed section ids to 3', () => {
    const c = makeCitation(1, {
      occurrences: [
        { sectionId: 'sec-1', paragraphIndex: 0, characterOffset: 0 },
        { sectionId: 'sec-2', paragraphIndex: 0, characterOffset: 0 },
        { sectionId: 'sec-3', paragraphIndex: 0, characterOffset: 0 },
        { sectionId: 'sec-4', paragraphIndex: 0, characterOffset: 0 },
      ],
    });
    render(<ReferencePanel citations={[c]} />);
    expect(screen.queryByText(/sec-4/)).not.toBeInTheDocument();
  });

  it('citation li has scroll-mt-4 for scroll-into-view', () => {
    const { container } = render(
      <ReferencePanel citations={[makeCitation(5)]} />
    );
    const li = container.querySelector('li#ref-5');
    expect(li?.className).toContain('scroll-mt-4');
  });
});
