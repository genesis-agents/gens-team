/**
 * legacy-artifact-cleanup.ts — 2026-08-09
 *
 * 存量 ReportArtifact 的**渲染期兜底清理**。
 *
 * 背景（用户实证 RSI 深度调研报告）：参考文献 [125]-[128] 是图片 CDN 地址
 * （cdn.i-scmp.com / media.thenextweb.com / platform.theverge.com /
 * img.staticimg.com），标题是被截到 100 字的半句话，没有日期。
 *
 * 根因在后端：figure 的 sourceUrl 被错写成图片 URL，assembler 匹配不到引用时
 * 合成了一条 citation 塞进参考文献（绕过 junk 过滤与去重）。产线侧已修
 * （s3 带下真实来源页 URL + assembler 删除合成引用路径），但**已经落库的报告
 * 不会自愈** —— 用户重新导出仍是脏的。本文件在渲染入口把这类条目摘掉。
 *
 * 判定用结构化条件，且必须两条同时成立，避免误伤真实引用：
 *   1) URL 路径指向图片资源（扩展名判定，忽略 query）
 *   2) 该引用在正文里从未被 [N] 引用过（occurrences 为空）
 * 真实的文献引用不会同时满足这两条。
 */

import type {
  ArtifactCitation,
  ArtifactFigure,
} from '@/lib/features/agent-playground/report-artifact.types';

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?)$/i;

/** URL 路径是否直接指向图片资源（忽略 query / hash） */
function pointsToImageResource(url: string): boolean {
  try {
    return IMAGE_EXTENSION.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * 摘掉"图片 CDN 假引用"。
 *
 * 不重排编号：正文里的 [N] 角标与剩余引用的 index 必须继续对得上，
 * 重排会让所有角标错位。被摘掉的编号在参考文献里留空是正确行为
 * —— 它本来就没有被正文引用过。
 */
export function dropImageResourceCitations(
  citations: readonly ArtifactCitation[]
): ArtifactCitation[] {
  return citations.filter(
    (c) => !(c.occurrences.length === 0 && pointsToImageResource(c.url))
  );
}

/** 当前 artifact 里真实存在的 figure id 集合（供占位符残片判定用） */
export function figureIdSet(
  figures: readonly ArtifactFigure[]
): ReadonlySet<string> {
  return new Set(figures.map((f) => f.id));
}
