---
name: 2026-05-04 prod observed issues (post pipeline-v1 cutover)
description: pipeline-v1 切默认后 Railway 日志观测到的非 boot-crash 但影响 mission 质量的问题清单，逐项需要修
type: project
originSessionId: 94c0899f-9d18-492b-abde-5c553623a0bd
---

2026-05-04 Railway logs 显示 pipeline-v1 mission 在跑（无 DI crash / 无 heartbeat 误杀），但有 **4 类持续问题**直接 / 间接影响 mission 质量。**不是阻塞但都是技术债**：

## 1. OpenAI `text-embedding-3-small` 429 风暴

**频率**：5 分钟内 ~25 次 429，持续重试，没退避。
**影响**：

- `RAGSearchTool: RAG search failed: Request failed with status code 429` — researcher 失去 RAG 检索能力
- `FigureRelevanceService: embedding failed, fallback=true` — 图片相关性筛选退化到非-embedding 启发式（精度差）

**Why**：用户 BYOK or 平台 key 的 OpenAI embedding tier 配额被打爆。
**How to apply**：next session 加：

- EmbeddingService exponential backoff + circuit breaker（连续 5 次 429 在 5min 内 → 暂停 60s）
- RAG 工具 429 时返回 `success:false + reason="upstream_rate_limit"` 不抛错（让 ReAct loop 切别的工具）

## 2. YouTube `/watch?v=...` HTTP 429

**频率**：每个 mission ~4-5 个 youtube URL 都 429
**影响**：YouTube 视频 transcript 采不到，researcher 维度证据 source 数少
**Why**：YouTube anti-scraping，IP rate limit。无 backup（youtubejs 已知不稳定，2026-05-04 logs 有 `[YOUTUBEJS][Player]: Failed to extract n decipher function`）。
**How to apply**：YouTube 转写需要换源（Whisper API / yt-dlp residential proxy）—— 不是修代码就行的，需要外部依赖。短期：在 researcher prompt 提示"避免选 YouTube 来源"。

## 3. axios `maxContentLength size of 52428800 exceeded`

**频率**：每次拉 `https://console.anthropic.com/llms-full.txt` 必出
**影响**：Anthropic 全量 docs 拉不到，相关 mission 缺关键 source
**Why**：axios 默认 50MB（52428800 bytes）上限，llms-full.txt 实际 80MB+。
**How to apply**：SearchService 创建 axios instance 时设 `maxContentLength: 200 * 1024 * 1024` + `maxBodyLength` 同步；或者大文档走流式 + 截断前 N MB。

## 4. Cloudflare 521 单点

**频率**：偶发（csdn.net 等中文博客）
**影响**：单一 URL 失败，可忽略（multi-source mission 容错）
**Why**：源站偶发不可达
**How to apply**：观察即可，不用修

## 元教训

我之前看 logs 习惯**只看 boot crash + mission failed**，把 429 / fallback 等"非阻塞但影响质量"的问题一笔带过。用户 2026-05-04 push 后明确反对："429 这些问题不记录？" → 之后所有 logs review 都要：

1. **明确分类**：阻塞 / 影响质量 / 噪音
2. **每个类都记 memory**，不让 issue 从对话里消失
3. **给优先级 + 修复路径**，不是"已 fallback OK 不用管"
