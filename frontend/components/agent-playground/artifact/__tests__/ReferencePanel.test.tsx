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
