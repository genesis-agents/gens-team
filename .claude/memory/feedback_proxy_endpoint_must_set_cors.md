---
name: feedback_proxy_endpoint_must_set_cors
description: 后端 /proxy/* 端点凡是被前端 fetch() 读取响应体的（不只是当 <img src> 用），必须显式 setHeader Access-Control-Allow-Origin + Cross-Origin-Resource-Policy；否则跨域 fetch 静默失败 → 走它的链路（如 PDF 导出 inline-image）整条断
metadata:
  node_type: memory
  type: feedback
  originSessionId: b2a1b3e2-dcf6-4709-b034-22dd0f9570ab
---

后端 `/proxy/*` 端点（`/proxy/pdf` `/proxy/html` `/proxy/image` 等）被前端使用时
要分两类处理：

- **只当资源 src 用**（`<img src=>` `<iframe src=>`）：浏览器跨域拉资源不需要 CORS
  头，可以省。
- **被 `fetch()` 读响应体**（如 `HtmlCaptureService.inlineImagesAsDataUrls` 把
  `<img>` 转成 data: URL 写进 PDF 导出 HTML）：**必须**显式设两个头：
  ```ts
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  ```

**Why**：2026-05-15 用户截图反馈 playground 报告导出 PDF/HTML 图片全破图。
根因链：

1. 前端 `<Image src={apiUrl + /proxy/image?url=...}>` 是跨域 URL（FE/BE 不同
   origin）
2. `HtmlCaptureService.inlineImagesAsDataUrls` 在 export 前 `fetch(src)` 转 data:
   URL
3. `/proxy/image` 历史只设了 Content-Type / Cache-Control，**没设 ACAO**
4. 浏览器 fetch CORS 检查失败 → reject
5. `Promise.allSettled` + 空 `catch {}` 静默吞错 → cloneImg.src 仍是跨域 URL
6. puppeteer 渲染 PDF 时 image 拉不下来 → broken icon 嵌进 PDF

姐妹端点 `/proxy/pdf` `/proxy/html` 早就设了 ACAO（line 340 / 452），唯独 image
漏掉。这是不一致 + 静默失败的双重坑。

**How to apply**：

- 新建 `/proxy/*` 端点：cargo-cult `/proxy/pdf` 的 header 集合（ACAO + CORP +
  Cache-Control + Content-Type）
- 改 `HtmlCaptureService` / 任何"DOM clone → fetch resource → inline as data:
  URL"的导出链路时，**必须先验证 fetch 链路要拉的所有 URL 都跨域可读**
- 跨域 image 配套：后端加 ACAO 之外，前端 `<Image>` 加 `crossOrigin="anonymous"`，
  让 canvas-fallback（HtmlCaptureService:374-388）也能 untaint canvas 走 toDataURL
- 看 [[feedback_screenshot_first_then_diagnose]]：用户截图破图 = ground truth；
  不要凭"puppeteer 渲染应该能跑通"假设主路径
