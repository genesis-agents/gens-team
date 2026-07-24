'use client';

import { config } from '@/lib/utils/config';

interface BrandLogoProps {
  variant?: 'icon' | 'full';
  iconClassName?: string;
  className?: string;
  /** 渲染在品牌字标右侧（baseline 对齐） */
  nameAddon?: React.ReactNode;
  /**
   * 渲染为品牌字标右侧的小角标（如 v40.11.0）。
   * 传 null 显式隐藏；传 undefined 走默认 config.brand.subtitle。
   */
  subtitle?: React.ReactNode;
}

/** Compact 方形图标：单 italic `g` 居中。折叠 sidebar / favicon tab 等小尺寸场合用。 */
function GlyphIconCompact({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      aria-label={config.brand.name}
      role="img"
    >
      <text
        x="16"
        y="20"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="24"
        fontStyle="italic"
        fill="#4f46e5"
      >
        g
      </text>
    </svg>
  );
}

export function BrandLogo({
  variant = 'icon',
  iconClassName,
  className = '',
  nameAddon,
  subtitle,
}: BrandLogoProps) {
  const isFull = variant === 'full';

  if (!isFull) {
    return (
      <div
        className={`inline-flex flex-shrink-0 ${className}`}
        style={{ filter: 'drop-shadow(0 1px 2px rgba(79,70,229,0.14))' }}
      >
        <GlyphIconCompact className={iconClassName ?? 'h-8 w-8'} />
      </div>
    );
  }

  return (
    <div className={`inline-flex items-end gap-1.5 ${className}`}>
      <span
        className="logo-shimmer text-[16px] font-bold leading-tight tracking-[0.03em]"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {config.brand.name}
      </span>
      {nameAddon}
      {subtitle !== null && subtitle !== undefined && (
        <span className="rounded-full bg-indigo-50 px-1.5 py-[2px] text-[7px] font-semibold leading-none tracking-[0.14em] text-slate-500">
          {subtitle}
        </span>
      )}
      {subtitle === undefined && config.brand.subtitle && (
        <span className="rounded-full bg-indigo-50 px-1.5 py-[2px] text-[7px] font-semibold leading-none tracking-[0.14em] text-slate-500">
          {config.brand.subtitle}
        </span>
      )}
    </div>
  );
}
