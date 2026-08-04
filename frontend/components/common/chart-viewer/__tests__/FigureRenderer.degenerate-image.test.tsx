/**
 * ★ 2026-08-04 生产回归：报告里配图全是「有边框、有标题、里面全空」。
 *
 * 链条（mission 4dfaa4b3 实证）：
 *   BCG 的 CDN 对数据中心 IP 返回 403
 *   → 后端 /proxy/image 拉不到图时返回 **200 + 1×1 透明 PNG**（当时为躲 5xx 告警）
 *   → 浏览器判定"加载成功" → onError 永不触发
 *   → imageLoadFailed 恒 false，两道"隐藏无效图"的防线全部绕过
 *   → <Image width={800} height={450}> 按 16:9 预留出一大片空白
 *
 * 后端已改为如实 404。本 spec 锁的是**与后端独立的第二道防线**：
 * 无论图片从哪来（别的代理 / CDN spacer.gif / 缓存里的旧占位图），
 * 尺寸退化（≤4px）就按加载失败处理。
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FigureRenderer } from '../FigureRenderer';

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) =>
    React.createElement('img', props),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh-CN' }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/lib/utils/config', () => ({
  config: { apiUrl: 'https://api.test' },
}));

const baseChart = {
  id: 'fig-dim-1-0',
  title: 'BCG: The Widening AI Value Gap',
  chartType: 'reference',
  imageUrl: 'https://web-assets.bcg.com/some-image.webp',
};

function fireLoadWithSize(img: HTMLImageElement, w: number, h: number) {
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true });
  fireEvent.load(img);
}

describe('FigureRenderer — 加载成功但是空图', () => {
  it('★ 1×1 占位图加载"成功" → 整个 figure 必须隐藏，不留空框', () => {
    const { container } = render(<FigureRenderer chart={baseChart as never} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    fireLoadWithSize(img as HTMLImageElement, 1, 1);

    // 恢复旧行为（onLoad 只 setImageLoading(false)）时，figure 会留在页面上
    expect(container.querySelector('figure')).toBeNull();
  });

  it('正常尺寸的图正常显示，不被误杀', () => {
    const { container } = render(<FigureRenderer chart={baseChart as never} />);
    const img = container.querySelector('img');
    fireLoadWithSize(img as HTMLImageElement, 1200, 630);

    expect(container.querySelector('img')).not.toBeNull();
  });

  it('真正的加载失败（onError）同样隐藏', () => {
    const { container } = render(<FigureRenderer chart={baseChart as never} />);
    const img = container.querySelector('img');
    fireEvent.error(img as HTMLImageElement);

    expect(container.querySelector('figure')).toBeNull();
  });
});
