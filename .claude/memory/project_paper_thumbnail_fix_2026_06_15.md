---
name: project_paper_thumbnail_fix_2026_06_15
description: 'explore 论文缩略图修复——alphaXiv CDN 封盗链 + PDF 渲染管线"双重死亡"的彻底解决'
metadata:
  node_type: memory
  type: project
  originSessionId: e1f9c652-28bc-40fb-9b23-b9aa2c879f65
---

**根因（非显而易见）**：explore 论文缩略图全体消失。两层独立原因：

1. arXiv 论文缩略图原走 alphaXiv 公开 CDN `paper-assets.alphaxiv.org/image/{id}{ver}.png`（2025-12-05 commit 2b2b6a266 引入）。该 CDN 现**对所有人/所有 UA/带 Referer 一律 403**（盗链封禁，连 1706.03762 经典论文也 403）。外部失效，仓库无对应改动。
2. 看到的是**纯白**而非默认图标：proxy.controller.ts 的 `/proxy/image`（commit 721655513，2026-05-25 降噪改动）失败时返回 200 + 1×1 透明 PNG → 浏览器视为"加载成功" → `<img>` onError 不触发 → ResourceThumbnail 的图标兜底永远走不到。

**关键事实**：后端其实早有完整真实缩略图管线（PdfThumbnailService=pdfjs+canvas+sharp 渲染首页 / dynamic-thumbnail PAPER 策略1 / `/thumbnail/extract` 缓存 DB / `/thumbnail/pdf-preview`），但**双重死亡从没真正跑通**：①前端 ResourceThumbnail 对 arxiv 抢先短路到 alphaXiv，从不调后端；②后端渲染后写本地 `public/thumbnails`，但**全项目无人静态服务它**（main.ts/app 无 ServeStatic），Railway 还重启即丢。

**修复（彻底，懒加载重生不写脚本）**：

- pdf-thumbnail.service.ts：渲染后改 `objectStorage.uploadBuffer(buf,"thumbnails",`${id}.jpg`,"image/jpeg")` 上传 R2 持久化，R2 未配置才回退本地；删本地"已存在"短路。
- dynamic-thumbnail.service.ts：PAPER 缺 pdfUrl 但 sourceUrl 是 arxiv 时，推导 `https://arxiv.org/pdf/{arxivId}.pdf` 再渲染。
- object-storage.service.ts：加公开 `isPresignedUrlExpiringSoon()`（R2 presigned 硬上限 7 天）。
- resources.service.ts findAll/findOne：读时对即将过期的 R2 thumbnailUrl `refreshImageUrl` 续签+异步回写（与 ai-app/image storage.service.ts:157 同范式）。
- ResourceThumbnail.tsx：删 alphaXiv 短路；PAPER 纳入走后端 extract 的类型；isPdfUrl 早返回排除 PAPER；isPlaceholderImage 加 `paper-assets.alphaxiv.org`（存量死链触发重生）。

验证：backend 392 测试绿 + tsc 0 + eslint 0 error；前端 tsc 0。关联 [[project_foresight_p0_2026_06_12]]（论文资产来自前瞻/雷达 ingestion）。
